import { Injectable, Logger } from '@nestjs/common';
import { EventStoreDBClient, jsonEvent } from '@eventstore/db-client';
import { Snapshot } from '../../domain/common/events';
import Redis from 'ioredis';

@Injectable()
export class SnapshotRepository<State> {
  private readonly logger = new Logger(SnapshotRepository.name);

  constructor(
    private readonly client: EventStoreDBClient,
    private readonly redis?: Redis, // optional hot cache
  ) {}

  private redisKey(streamId: string): string {
    return `snapshot:${streamId}`;
  }

  /**
   * Load the latest snapshot for a stream
   */
  async loadLatest(streamId: string): Promise<Snapshot<State> | null> {
    try {
      // Hot path: Redis cache
      if (this.redis) {
        const cached = await this.redis.get(this.redisKey(streamId));
        if (cached) {
          this.logger.debug({ streamId }, 'snapshot.loadLatest.cache.hit');
          return JSON.parse(cached) as Snapshot<State>;
        }
      }

      // Source of truth: ESDB (last event only)
      const read = this.client.readStream(streamId, {
        direction: 'backwards',
        maxCount: 1,
      });

      for await (const r of read) {
        if (!r.event) continue;
        const snap = r.event.data as Snapshot<State>;

        // Cache in Redis for next time
        if (this.redis) {
          await this.redis.setex(
            this.redisKey(streamId),
            3600, // 1 hour TTL
            JSON.stringify(snap),
          );
        }

        this.logger.debug(
          { streamId, version: snap.version },
          'snapshot.loadLatest.esdb.hit',
        );
        return snap;
      }

      this.logger.debug({ streamId }, 'snapshot.loadLatest.notFound');
      return null;
    } catch (error) {
      this.logger.error(
        {
          streamId,
          error: error instanceof Error ? error.message : String(error),
        },
        'snapshot.loadLatest.failed',
      );
      return null;
    }
  }

  /**
   * Save a snapshot to the snapshot stream
   */
  async save(streamId: string, snapshot: Snapshot<State>): Promise<void> {
    try {
      await this.client.appendToStream(streamId, [
        jsonEvent({
          type: 'snapshot',
          data: snapshot,
          metadata: {
            aggregate: snapshot.aggregate,
            aggregateSchema: snapshot.aggregateSchema,
            tenant: snapshot.tenant,
            entityId: snapshot.entityId,
            takenAt: snapshot.takenAt,
          },
        }),
      ]);

      // Update Redis cache
      if (this.redis) {
        await this.redis.setex(
          this.redisKey(streamId),
          3600, // 1 hour TTL
          JSON.stringify(snapshot),
        );
      }

      this.logger.debug(
        {
          streamId,
          version: snapshot.version,
          aggregate: snapshot.aggregate,
          tenant: snapshot.tenant,
          entityId: snapshot.entityId,
        },
        'snapshot.save.success',
      );
    } catch (error) {
      this.logger.error(
        {
          streamId,
          snapshot: {
            aggregate: snapshot.aggregate,
            version: snapshot.version,
            tenant: snapshot.tenant,
            entityId: snapshot.entityId,
          },
          error: error instanceof Error ? error.message : String(error),
        },
        'snapshot.save.failed',
      );
      throw error;
    }
  }

  /**
   * Delete a snapshot (and clear from cache)
   */
  async delete(streamId: string): Promise<void> {
    try {
      // Clear from Redis cache
      if (this.redis) {
        await this.redis.del(this.redisKey(streamId));
      }

      // Note: EventStore doesn't support deleting individual events easily
      // We would typically use stream metadata to mark as deleted
      await this.client.setStreamMetadata(streamId, {
        $tb: 0, // Truncate before (keeps no events)
      });

      this.logger.debug({ streamId }, 'snapshot.delete.success');
    } catch (error) {
      this.logger.error(
        {
          streamId,
          error: error instanceof Error ? error.message : String(error),
        },
        'snapshot.delete.failed',
      );
      throw error;
    }
  }

  /**
   * Check if a snapshot exists for a stream
   */
  async exists(streamId: string): Promise<boolean> {
    try {
      const snapshot = await this.loadLatest(streamId);
      return snapshot !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get snapshot statistics for monitoring
   */
  async getStats(streamId: string): Promise<{
    exists: boolean;
    version?: number;
    takenAt?: string;
    cacheHit: boolean;
  }> {
    const cacheHit = this.redis
      ? await this.redis.exists(this.redisKey(streamId))
      : false;

    const snapshot = await this.loadLatest(streamId);

    return {
      exists: snapshot !== null,
      version: snapshot?.version,
      takenAt: snapshot?.takenAt,
      cacheHit: Boolean(cacheHit),
    };
  }
}
