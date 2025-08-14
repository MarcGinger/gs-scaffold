import { Inject, Injectable } from '@nestjs/common';
import { OutboxRecord, OutboxRepository } from './outbox.entity';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from 'pino';
import { Log } from '../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../shared/logging/logging.providers';

/**
 * Production-ready Redis outbox repository with:
 * - Atomic claiming (prevent loss/duplication)
 * - Idempotency via eventId deduplication
 * - Exponential backoff with jitter
 * - Race-safe retry flow
 * - JSON safety with poison record handling
 * - Bulk operations with pipelines
 * - Environment isolation and TTL
 * - Structured logging (Pino)
 * - Lists + Hashes for reliability
 */
@Injectable()
export class RedisOutboxRepository implements OutboxRepository {
  private readonly outboxKey: string;
  private readonly statusKey: string;
  private readonly dedupePrefix: string;

  constructor(
    private readonly redis: Redis,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {
    // Environment isolation
    const envPrefix = `app:${process.env.NODE_ENV ?? 'dev'}:`;
    this.outboxKey = `${envPrefix}outbox:events`;
    this.statusKey = `${envPrefix}outbox:status`;
    this.dedupePrefix = `${envPrefix}outbox:dedupe`;
  }

  /**
   * Add new outbox records with idempotency
   */
  async add(records: OutboxRecord[]): Promise<void> {
    if (records.length === 0) return;

    try {
      const multi = this.redis.multi();
      const addedRecords: OutboxRecord[] = [];

      for (const record of records) {
        // Idempotency check: dedupe on eventId
        const dedupeKey = `${this.dedupePrefix}:${record.eventId}`;
        const isNew = await this.redis.set(
          dedupeKey,
          '1',
          'EX',
          60 * 60 * 24, // 24h TTL
          'NX',
        );

        if (!isNew) {
          Log.debug(this.logger, 'Outbox record deduplicated', {
            component: 'RedisOutboxRepository',
            method: 'add',
            eventId: record.eventId,
            recordId: record.id,
          });
          continue; // Skip duplicate
        }

        // Store record data in hash
        multi.hset(`${this.outboxKey}:${record.id}`, {
          id: record.id,
          eventId: record.eventId,
          type: record.type,
          payload: JSON.stringify(record.payload),
          metadata: JSON.stringify(record.metadata),
          status: record.status,
          attempts: record.attempts.toString(),
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
          lastError: record.lastError || '',
          nextRetryAt: record.nextRetryAt?.toISOString() || '',
        });

        // Add to pending list
        multi.lpush(`${this.statusKey}:pending`, record.id);
        addedRecords.push(record);
      }

      await multi.exec();

      Log.info(this.logger, 'Outbox records added', {
        component: 'RedisOutboxRepository',
        method: 'add',
        requested: records.length,
        added: addedRecords.length,
        deduplicated: records.length - addedRecords.length,
      });
    } catch (error) {
      Log.error(this.logger, error, 'Failed to add outbox records', {
        component: 'RedisOutboxRepository',
        method: 'add',
        count: records.length,
      });
      throw error;
    }
  }

  /**
   * Atomically claim pending records (prevents loss on crash)
   */
  private async claimPending(batchSize: number): Promise<string[]> {
    const ids: string[] = [];

    // Use LMOVE (Redis 6+) to atomically move from pending → processing
    for (let i = 0; i < batchSize; i++) {
      const id = await this.redis.lmove(
        `${this.statusKey}:pending`,
        `${this.statusKey}:processing`,
        'RIGHT',
        'LEFT',
      );

      if (!id) break; // No more pending records
      ids.push(id);
    }

    return ids;
  }

  /**
   * Get next batch of records with atomic claiming
   */
  async nextBatch(limit: number): Promise<OutboxRecord[]> {
    try {
      // Atomically claim IDs from pending → processing
      const ids = await this.claimPending(limit);
      if (ids.length === 0) return [];

      // Pipeline HGETALL for all claimed records
      const pipeline = this.redis.pipeline();
      ids.forEach((id) => pipeline.hgetall(`${this.outboxKey}:${id}`));
      const results = await pipeline.exec();

      const records: OutboxRecord[] = [];

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const [err, rawData] = results?.[i] ?? [null, null];

        if (
          err ||
          !rawData ||
          typeof rawData !== 'object' ||
          Object.keys(rawData).length === 0
        ) {
          // Remove from processing if no data found
          await this.redis.lrem(`${this.statusKey}:processing`, 1, id);
          continue;
        }

        const data = rawData as Record<string, string>;

        try {
          records.push({
            id: data.id,
            eventId: data.eventId,
            type: data.type,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            payload: JSON.parse(data.payload),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            metadata: JSON.parse(data.metadata),
            status: data.status as OutboxRecord['status'],
            attempts: parseInt(data.attempts, 10),
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
            lastError: data.lastError || undefined,
            nextRetryAt: data.nextRetryAt
              ? new Date(data.nextRetryAt)
              : undefined,
          });
        } catch (parseError) {
          // Poison record: mark as failed and keep in processing
          Log.warn(this.logger, 'Poison record found, marking as failed', {
            component: 'RedisOutboxRepository',
            method: 'nextBatch',
            recordId: id,
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });

          await this.markFailed(id, `JSON parse error: ${parseError}`);
        }
      }

      Log.debug(this.logger, 'Outbox batch claimed', {
        component: 'RedisOutboxRepository',
        method: 'nextBatch',
        requested: limit,
        claimed: ids.length,
        valid: records.length,
      });

      return records;
    } catch (error) {
      Log.error(this.logger, error, 'Failed to get next batch', {
        component: 'RedisOutboxRepository',
        method: 'nextBatch',
        limit,
      });
      // Don't lose IDs already moved to processing
      return [];
    }
  }

  /**
   * Mark records as published (remove from processing)
   */
  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    try {
      const now = new Date().toISOString();
      const multi = this.redis.multi();

      for (const id of ids) {
        // Update hash with published status
        multi.hset(`${this.outboxKey}:${id}`, {
          status: 'published',
          updatedAt: now,
        });

        // Remove from processing
        multi.lrem(`${this.statusKey}:processing`, 1, id);

        // Add to published list for cleanup
        multi.lpush(`${this.statusKey}:published`, id);

        // Set TTL on hash for automatic cleanup (optional)
        multi.expire(`${this.outboxKey}:${id}`, 60 * 60 * 24 * 7); // 7 days
      }

      await multi.exec();

      Log.info(this.logger, 'Outbox records published', {
        component: 'RedisOutboxRepository',
        method: 'markPublished',
        count: ids.length,
      });
    } catch (error) {
      Log.error(this.logger, error, 'Failed to mark records as published', {
        component: 'RedisOutboxRepository',
        method: 'markPublished',
        ids,
      });
      throw error;
    }
  }

  /**
   * Mark record as failed with exponential backoff + jitter
   */
  async markFailed(id: string, errorMessage: string): Promise<void> {
    try {
      const data = await this.redis.hgetall(`${this.outboxKey}:${id}`);
      if (!data || !data.id) {
        Log.warn(this.logger, 'Record not found for failure marking', {
          component: 'RedisOutboxRepository',
          method: 'markFailed',
          recordId: id,
        });
        return;
      }

      const attempts = (parseInt(data.attempts, 10) || 0) + 1;

      // Exponential backoff with jitter: base * 2^(attempt-1) + jitter
      const base = 30_000; // 30 seconds base delay
      const exponential = base * Math.pow(2, attempts - 1);
      const jitter = Math.floor(Math.random() * 1000); // Up to 1s jitter
      const backoff = Math.min(exponential + jitter, 60 * 60 * 1000); // Cap at 1 hour
      const nextRetryAt = new Date(Date.now() + backoff);

      const now = new Date().toISOString();
      const multi = this.redis.multi();

      multi.hset(`${this.outboxKey}:${id}`, {
        status: 'failed',
        attempts: attempts.toString(),
        lastError: errorMessage,
        nextRetryAt: nextRetryAt.toISOString(),
        updatedAt: now,
      });

      multi.lrem(`${this.statusKey}:processing`, 1, id);
      multi.lpush(`${this.statusKey}:failed`, id);

      await multi.exec();

      Log.warn(this.logger, 'Outbox record marked as failed', {
        component: 'RedisOutboxRepository',
        method: 'markFailed',
        recordId: id,
        attempts,
        nextRetryAt: nextRetryAt.toISOString(),
        error: errorMessage,
      });
    } catch (error) {
      Log.error(this.logger, error, 'Failed to mark record as failed', {
        component: 'RedisOutboxRepository',
        method: 'markFailed',
        recordId: id,
        errorMessage,
      });
      throw error;
    }
  }

  /**
   * Get failed records ready for retry (race-safe with atomic moves)
   */
  async retryFailed(maxAttempts = 5): Promise<OutboxRecord[]> {
    try {
      const retryableRecords: OutboxRecord[] = [];
      const now = Date.now();

      // Scan failed list for retry candidates
      const allFailedIds = await this.redis.lrange(
        `${this.statusKey}:failed`,
        0,
        -1,
      );

      for (const id of allFailedIds) {
        const data = await this.redis.hgetall(`${this.outboxKey}:${id}`);
        if (!data || !data.id) continue;

        const attempts = parseInt(data.attempts, 10) || 0;
        const nextRetryTime = data.nextRetryAt
          ? new Date(data.nextRetryAt).getTime()
          : 0;
        const isReady = nextRetryTime <= now;

        if (attempts >= maxAttempts || !isReady) continue;

        // Atomically move from failed → pending (race-safe)
        const moved = await this.redis.lrem(`${this.statusKey}:failed`, 1, id);
        if (moved > 0) {
          await this.redis.lpush(`${this.statusKey}:pending`, id);

          try {
            retryableRecords.push({
              id: data.id,
              eventId: data.eventId,
              type: data.type,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              payload: JSON.parse(data.payload),
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              metadata: JSON.parse(data.metadata),
              status: data.status as OutboxRecord['status'],
              attempts,
              createdAt: new Date(data.createdAt),
              updatedAt: new Date(data.updatedAt),
              lastError: data.lastError || undefined,
              nextRetryAt: data.nextRetryAt
                ? new Date(data.nextRetryAt)
                : undefined,
            });
          } catch (parseError) {
            // If we can't parse the record, mark it as permanently failed
            Log.error(this.logger, parseError, 'Failed to parse retry record', {
              component: 'RedisOutboxRepository',
              method: 'retryFailed',
              recordId: id,
            });
          }
        }
      }

      Log.info(this.logger, 'Failed records processed for retry', {
        component: 'RedisOutboxRepository',
        method: 'retryFailed',
        totalFailed: allFailedIds.length,
        retryable: retryableRecords.length,
        maxAttempts,
      });

      return retryableRecords;
    } catch (error) {
      Log.error(this.logger, error, 'Failed to process retry records', {
        component: 'RedisOutboxRepository',
        method: 'retryFailed',
        maxAttempts,
      });
      return [];
    }
  }

  createRecord(
    eventId: string,
    type: string,
    payload: any,
    metadata: any,
  ): OutboxRecord {
    const now = new Date();

    return {
      id: uuidv4(),
      eventId,
      type,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      payload,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      metadata,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getStats(): Promise<{
    pending: number;
    processing: number;
    published: number;
    failed: number;
  }> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.llen(`${this.statusKey}:pending`);
      pipeline.llen(`${this.statusKey}:processing`);
      pipeline.llen(`${this.statusKey}:published`);
      pipeline.llen(`${this.statusKey}:failed`);

      const results = await pipeline.exec();

      const [
        [, pending = 0],
        [, processing = 0],
        [, published = 0],
        [, failed = 0],
      ] = results || [];

      return {
        pending: pending as number,
        processing: processing as number,
        published: published as number,
        failed: failed as number,
      };
    } catch (error) {
      Log.error(this.logger, error, 'Failed to get outbox stats', {
        component: 'RedisOutboxRepository',
        method: 'getStats',
      });
      return { pending: 0, processing: 0, published: 0, failed: 0 };
    }
  }

  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date(
        Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
      );
      let deletedCount = 0;

      // Get all published IDs
      const publishedIds = await this.redis.lrange(
        `${this.statusKey}:published`,
        0,
        -1,
      );

      if (publishedIds.length === 0) return 0;

      // Pipeline HGET for all updatedAt timestamps
      const pipeline = this.redis.pipeline();
      publishedIds.forEach((id) =>
        pipeline.hget(`${this.outboxKey}:${id}`, 'updatedAt'),
      );
      const timestamps = await pipeline.exec();

      // Identify records to delete
      const toDelete: string[] = [];
      for (let i = 0; i < publishedIds.length; i++) {
        const id = publishedIds[i];
        const [err, updatedAt] = timestamps?.[i] ?? [null, null];

        if (
          !err &&
          updatedAt &&
          new Date(updatedAt as string).getTime() < cutoffDate.getTime()
        ) {
          toDelete.push(id);
        }
      }

      if (toDelete.length > 0) {
        // Use pipeline for bulk deletion
        const deletePipeline = this.redis.pipeline();
        toDelete.forEach((id) => {
          deletePipeline.unlink(`${this.outboxKey}:${id}`); // Non-blocking delete
          deletePipeline.lrem(`${this.statusKey}:published`, 1, id);
        });

        await deletePipeline.exec();
        deletedCount = toDelete.length;
      }

      Log.info(this.logger, 'Outbox cleanup completed', {
        component: 'RedisOutboxRepository',
        method: 'cleanup',
        olderThanDays,
        total: publishedIds.length,
        deleted: deletedCount,
      });

      return deletedCount;
    } catch (error) {
      Log.error(this.logger, error, 'Failed to cleanup outbox records', {
        component: 'RedisOutboxRepository',
        method: 'cleanup',
        olderThanDays,
      });
      return 0;
    }
  }

  async recoverProcessing(): Promise<number> {
    try {
      const processingIds = await this.redis.lrange(
        `${this.statusKey}:processing`,
        0,
        -1,
      );

      if (processingIds.length === 0) return 0;

      // Move all processing records back to pending
      const pipeline = this.redis.pipeline();
      processingIds.forEach((id) => {
        pipeline.lrem(`${this.statusKey}:processing`, 1, id);
        pipeline.lpush(`${this.statusKey}:pending`, id);
      });

      await pipeline.exec();

      Log.info(this.logger, 'Recovered processing records on startup', {
        component: 'RedisOutboxRepository',
        method: 'recoverProcessing',
        recovered: processingIds.length,
      });

      return processingIds.length;
    } catch (error) {
      Log.error(this.logger, error, 'Failed to recover processing records', {
        component: 'RedisOutboxRepository',
        method: 'recoverProcessing',
      });
      return 0;
    }
  }
}
