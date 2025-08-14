import { Inject, Injectable } from '@nestjs/common';
import {
  EventStoreDBClient,
  jsonEvent,
  BACKWARDS,
  AppendResult,
} from '@eventstore/db-client';
import type { Logger } from 'pino';
import Redis from 'ioredis';
import { gzipSync, gunzipSync } from 'zlib';

import { Snapshot } from '../../domain/common/events';
import { Log } from '../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../shared/logging/logging.providers';

/**
 * Domain-specific error for snapshot operation failures
 */
export class SnapshotOperationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly streamId: string,
    cause: Error,
  ) {
    super(
      `Snapshot ${operation} failed for stream ${streamId}: ${cause.message}`,
    );
    this.name = 'SnapshotOperationError';
    this.cause = cause;
  }
}

@Injectable()
export class SnapshotRepository<State> {
  constructor(
    private readonly client: EventStoreDBClient,
    @Inject(APP_LOGGER) private readonly logger: Logger,
    private readonly redis?: Redis, // optional hot cache
  ) {}

  private redisKey(streamId: string): string {
    return `snapshot:${streamId}`;
  }

  /**
   * Compress snapshot data for efficient Redis storage
   */
  private compressSnapshot(snapshot: Snapshot<State>): string {
    try {
      const json = JSON.stringify(snapshot);
      const compressed = gzipSync(json);
      return compressed.toString('base64');
    } catch (error) {
      Log.warn(this.logger, 'snapshot.compression.failed', {
        component: 'SnapshotRepository',
        method: 'compressSnapshot',
        error: (error as Error).message,
      });
      // Fallback to uncompressed
      return JSON.stringify(snapshot);
    }
  }

  /**
   * Decompress snapshot data from Redis
   */
  private decompressSnapshot(compressed: string): Snapshot<State> | null {
    try {
      // Try decompression first (new format)
      try {
        const buffer = Buffer.from(compressed, 'base64');
        const decompressed = gunzipSync(buffer);
        return JSON.parse(decompressed.toString()) as Snapshot<State>;
      } catch {
        // Fallback to direct JSON parse (legacy format)
        return JSON.parse(compressed) as Snapshot<State>;
      }
    } catch (error) {
      Log.warn(this.logger, 'snapshot.decompression.failed', {
        component: 'SnapshotRepository',
        method: 'decompressSnapshot',
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Load the latest snapshot for a stream.
   * Returns the snapshot and whether it was a cache hit.
   */
  async loadLatest(streamId: string): Promise<{
    snapshot: Snapshot<State> | null;
    cacheHit: boolean;
  }> {
    // 1) Redis hot path
    if (this.redis) {
      try {
        const cached = await this.redis.get(this.redisKey(streamId));
        if (cached) {
          const snapshot = this.decompressSnapshot(cached);
          if (snapshot) {
            Log.debug(this.logger, 'snapshot.loadLatest.cache.hit', {
              component: 'SnapshotRepository',
              method: 'loadLatest',
              streamId,
              version: snapshot.version,
            });
            return { snapshot, cacheHit: true };
          } else {
            // Corrupt cache; evict
            await this.redis.del(this.redisKey(streamId));
            Log.warn(this.logger, 'snapshot.cache.corrupt.evicted', {
              component: 'SnapshotRepository',
              method: 'loadLatest',
              streamId,
            });
          }
        }
      } catch (err) {
        Log.warn(this.logger, 'snapshot.cache.readFailed', {
          component: 'SnapshotRepository',
          method: 'loadLatest',
          streamId,
          error: (err as Error).message,
        });
      }
    }

    // 2) ESDB: tail read (1 event) with BACKWARDS constant
    try {
      const iter = this.client.readStream(streamId, {
        direction: BACKWARDS,
        maxCount: 1,
      });

      for await (const r of iter) {
        const ev = r.event;
        if (!ev) continue;

        // Verify event type for safety
        if (ev.type !== 'snapshot') {
          Log.warn(this.logger, 'snapshot.loadLatest.unexpectedEventType', {
            component: 'SnapshotRepository',
            method: 'loadLatest',
            streamId,
            eventType: ev.type,
            expectedType: 'snapshot',
          });
          continue;
        }

        const snap = ev.data as Snapshot<State>;

        // Cache fill
        if (this.redis) {
          try {
            const compressed = this.compressSnapshot(snap);
            await this.redis.setex(this.redisKey(streamId), 3600, compressed);
          } catch (err) {
            Log.warn(this.logger, 'snapshot.cache.writeFailed', {
              component: 'SnapshotRepository',
              method: 'loadLatest',
              streamId,
              error: (err as Error).message,
            });
          }
        }

        Log.debug(this.logger, 'snapshot.loadLatest.esdb.hit', {
          component: 'SnapshotRepository',
          method: 'loadLatest',
          streamId,
          version: snap.version,
          streamPosition: ev.revision?.toString(),
        });
        return { snapshot: snap, cacheHit: false };
      }

      Log.debug(this.logger, 'snapshot.loadLatest.notFound', {
        component: 'SnapshotRepository',
        method: 'loadLatest',
        streamId,
      });
      return { snapshot: null, cacheHit: false };
    } catch (error) {
      Log.error(this.logger, error as Error, 'snapshot.loadLatest.failed', {
        component: 'SnapshotRepository',
        method: 'loadLatest',
        streamId,
      });
      throw new SnapshotOperationError('load', streamId, error as Error);
    }
  }

  /**
   * Save a snapshot to the snapshot stream.
   * Optionally provide `expectedRevision` to prevent concurrent duplicate snapshots.
   */
  async save(
    streamId: string,
    snapshot: Snapshot<State>,
    expectedRevision?: bigint, // ESDB revision for concurrency control
  ): Promise<AppendResult> {
    try {
      const appendOptions =
        expectedRevision !== undefined ? { expectedRevision } : undefined;

      const result = await this.client.appendToStream(
        streamId,
        [
          jsonEvent({
            type: 'snapshot',
            data: snapshot,
            metadata: {
              aggregate: snapshot.aggregate,
              aggregateSchema: snapshot.aggregateSchema,
              tenant: snapshot.tenant,
              entityId: snapshot.entityId,
              takenAt: snapshot.takenAt,
              // Include both versions for clarity
              domainVersion: snapshot.version,
              streamPosition: snapshot.streamPosition?.toString(),
            },
          }),
        ],
        appendOptions,
      );

      // Update Redis cache with compression
      if (this.redis) {
        try {
          const compressed = this.compressSnapshot(snapshot);
          await this.redis.setex(this.redisKey(streamId), 3600, compressed);
        } catch (err) {
          Log.warn(this.logger, 'snapshot.cache.writeFailed', {
            component: 'SnapshotRepository',
            method: 'save',
            streamId,
            error: (err as Error).message,
          });
        }
      }

      Log.debug(this.logger, 'snapshot.save.success', {
        component: 'SnapshotRepository',
        method: 'save',
        streamId,
        version: snapshot.version,
        streamPosition: snapshot.streamPosition?.toString(),
        aggregate: snapshot.aggregate,
        tenant: snapshot.tenant,
        entityId: snapshot.entityId,
        nextExpectedRevision: result.nextExpectedRevision?.toString(),
        expectedRevision: expectedRevision?.toString(),
      });

      return result;
    } catch (error) {
      Log.error(this.logger, error as Error, 'snapshot.save.failed', {
        component: 'SnapshotRepository',
        method: 'save',
        streamId,
        snapshot: {
          aggregate: snapshot.aggregate,
          version: snapshot.version,
          streamPosition: snapshot.streamPosition?.toString(),
          tenant: snapshot.tenant,
          entityId: snapshot.entityId,
        },
        expectedRevision: expectedRevision?.toString(),
      });
      throw new SnapshotOperationError('save', streamId, error as Error);
    }
  }

  /**
   * Delete the snapshot stream and evict cache.
   * Use proper tombstone to remove the entire stream.
   */
  async delete(streamId: string): Promise<void> {
    try {
      // Clear from Redis cache first
      if (this.redis) {
        await this.redis.del(this.redisKey(streamId));
      }

      // Use proper deleteStream for tombstone (not metadata truncation)
      await this.client.deleteStream(streamId);

      Log.debug(this.logger, 'snapshot.delete.success', {
        component: 'SnapshotRepository',
        method: 'delete',
        streamId,
      });
    } catch (error) {
      Log.error(this.logger, error as Error, 'snapshot.delete.failed', {
        component: 'SnapshotRepository',
        method: 'delete',
        streamId,
      });
      throw new SnapshotOperationError('delete', streamId, error as Error);
    }
  }

  /**
   * Check if a snapshot exists for a stream (uses loadLatest to avoid double work)
   */
  async exists(streamId: string): Promise<boolean> {
    try {
      const { snapshot } = await this.loadLatest(streamId);
      return snapshot !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get snapshot statistics for monitoring (single pass to avoid double work).
   */
  async getStats(streamId: string): Promise<{
    exists: boolean;
    version?: number;
    streamPosition?: string;
    takenAt?: string;
    cacheHit: boolean;
  }> {
    try {
      const { snapshot, cacheHit } = await this.loadLatest(streamId);
      return {
        exists: snapshot !== null,
        version: snapshot?.version,
        streamPosition: snapshot?.streamPosition?.toString(),
        takenAt: snapshot?.takenAt,
        cacheHit,
      };
    } catch (error) {
      Log.warn(this.logger, 'snapshot.getStats.failed', {
        component: 'SnapshotRepository',
        method: 'getStats',
        streamId,
        error: (error as Error).message,
      });
      return {
        exists: false,
        cacheHit: false,
      };
    }
  }

  /**
   * Get the current stream revision for concurrency control.
   * Useful for getting expectedRevision before saving a new snapshot.
   */
  async getCurrentRevision(streamId: string): Promise<bigint | null> {
    try {
      const iter = this.client.readStream(streamId, {
        direction: BACKWARDS,
        maxCount: 1,
      });

      for await (const r of iter) {
        return r.event?.revision ?? null;
      }
      return null; // Stream doesn't exist
    } catch {
      return null; // Stream doesn't exist or error
    }
  }
}
