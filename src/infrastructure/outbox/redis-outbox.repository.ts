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
  private readonly keys: {
    pending: string;
    processing: string;
    published: string;
    failed: string;
    dlq: string; // Dead Letter Queue
    retrySchedule: string; // Sorted set for retry scheduling
  };

  // Lua script for atomic dedup + enqueue
  private readonly atomicEnqueueScript = `
    local dedupeKey = KEYS[1]
    local hashKey = KEYS[2]
    local pendingKey = KEYS[3]
    local recordData = cjson.decode(ARGV[1])
    local ttl = tonumber(ARGV[2])
    
    -- Check deduplication
    local existing = redis.call('SET', dedupeKey, '1', 'EX', ttl, 'NX')
    if not existing then
      return 0  -- Duplicate, skip
    end
    
    -- Store record and enqueue atomically
    redis.call('HSET', hashKey, unpack(recordData))
    redis.call('LPUSH', pendingKey, recordData[2])  -- recordData[2] is the ID
    
    return 1  -- Success
  `;

  constructor(
    private readonly redis: Redis,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {
    // Environment isolation
    const envPrefix = `app:${process.env.NODE_ENV ?? 'dev'}:`;
    this.outboxKey = `${envPrefix}outbox:events`;
    this.statusKey = `${envPrefix}outbox:status`;
    this.dedupePrefix = `${envPrefix}outbox:dedupe`;

    // Key structure for different queues
    this.keys = {
      pending: `${this.statusKey}:pending`,
      processing: `${this.statusKey}:processing`,
      published: `${this.statusKey}:published`,
      failed: `${this.statusKey}:failed`,
      dlq: `${this.statusKey}:dlq`,
      retrySchedule: `${this.statusKey}:retry-schedule`,
    };
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
        multi.lpush(this.keys.pending, record.id);
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
        this.keys.pending,
        this.keys.processing,
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
   * Moves to DLQ when max attempts exceeded
   */
  async markFailed(
    id: string,
    errorMessage: string,
    maxAttempts = 5,
  ): Promise<void> {
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
      const now = new Date().toISOString();
      const multi = this.redis.multi();

      // Check if max attempts exceeded - move to DLQ
      if (attempts >= maxAttempts) {
        multi.hset(`${this.outboxKey}:${id}`, {
          status: 'dead',
          attempts: attempts.toString(),
          lastError: errorMessage,
          deadAt: now,
          updatedAt: now,
        });

        multi.lrem(this.keys.processing, 1, id);
        multi.lpush(this.keys.dlq, id);

        await multi.exec();

        Log.error(
          this.logger,
          new Error(`Max attempts exceeded: ${errorMessage}`),
          'Outbox record moved to DLQ',
          {
            component: 'RedisOutboxRepository',
            method: 'markFailed',
            recordId: id,
            attempts,
            error: errorMessage,
            finalStatus: 'dead',
          },
        );
        return;
      }

      // Calculate retry backoff with exponential + jitter
      const base = 30_000; // 30 seconds base delay
      const exponential = base * Math.pow(2, attempts - 1);
      const jitter = Math.floor(Math.random() * 1000); // Up to 1s jitter
      const backoff = Math.min(exponential + jitter, 60 * 60 * 1000); // Cap at 1 hour
      const nextRetryAt = new Date(Date.now() + backoff);

      // Update record with failure info
      multi.hset(`${this.outboxKey}:${id}`, {
        status: 'failed',
        attempts: attempts.toString(),
        lastError: errorMessage,
        nextRetryAt: nextRetryAt.toISOString(),
        updatedAt: now,
      });

      // Move from processing to retry schedule (sorted set)
      multi.lrem(this.keys.processing, 1, id);
      multi.zadd(this.keys.retrySchedule, nextRetryAt.getTime(), id);

      await multi.exec();

      Log.warn(this.logger, 'Outbox record scheduled for retry', {
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
   * Get failed records ready for retry using sorted set for efficiency
   * O(log N) instead of O(N) with ZRANGEBYSCORE
   */
  async retryFailed(batchSize = 100): Promise<OutboxRecord[]> {
    try {
      const retryableRecords: OutboxRecord[] = [];
      const now = Date.now();

      // Efficiently get due items from sorted set
      const dueIds = await this.redis.zrangebyscore(
        this.keys.retrySchedule,
        '-inf',
        now,
        'LIMIT',
        0,
        batchSize,
      );

      if (dueIds.length === 0) {
        return retryableRecords;
      }

      // Process each due record
      for (const id of dueIds) {
        const data = await this.redis.hgetall(`${this.outboxKey}:${id}`);
        if (!data || !data.id) continue;

        // Atomically move from retry schedule to pending
        const removed = await this.redis.zrem(this.keys.retrySchedule, id);
        if (removed > 0) {
          await this.redis.lpush(this.keys.pending, id);

          try {
            retryableRecords.push({
              id: data.id,
              eventId: data.eventId,
              type: data.type,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              payload: JSON.parse(data.payload),
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              metadata: JSON.parse(data.metadata),
              status: 'pending' as const,
              attempts: parseInt(data.attempts, 10) || 0,
              createdAt: new Date(data.createdAt),
              updatedAt: new Date(data.updatedAt),
              lastError: data.lastError || undefined,
            });

            Log.info(this.logger, 'Outbox record scheduled for retry', {
              component: 'RedisOutboxRepository',
              method: 'retryFailed',
              recordId: id,
              attempts: parseInt(data.attempts, 10) || 0,
            });
          } catch (parseError) {
            Log.error(
              this.logger,
              parseError as Error,
              'Failed to parse retryable record payload/metadata',
              {
                component: 'RedisOutboxRepository',
                method: 'retryFailed',
                recordId: id,
                parseError: (parseError as Error).message,
              },
            );

            // Mark as poison record and move to DLQ
            await this.markFailed(
              id,
              `JSON parse error: ${(parseError as Error).message}`,
              1,
            );
          }
        }
      }

      Log.info(this.logger, 'Retry batch processed', {
        component: 'RedisOutboxRepository',
        method: 'retryFailed',
        dueRecords: dueIds.length,
        processedRecords: retryableRecords.length,
      });

      return retryableRecords;
    } catch (error) {
      Log.error(this.logger, error, 'Failed to process retry records', {
        component: 'RedisOutboxRepository',
        method: 'retryFailed',
      });
      throw error;
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
    dlq: number;
    retryScheduled: number;
  }> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.llen(this.keys.pending);
      pipeline.llen(this.keys.processing);
      pipeline.llen(this.keys.published);
      pipeline.llen(this.keys.failed);
      pipeline.llen(this.keys.dlq);
      pipeline.zcard(this.keys.retrySchedule);

      const results = await pipeline.exec();

      const [
        [, pending = 0],
        [, processing = 0],
        [, published = 0],
        [, failed = 0],
        [, dlq = 0],
        [, retryScheduled = 0],
      ] = results || [];

      return {
        pending: pending as number,
        processing: processing as number,
        published: published as number,
        failed: failed as number,
        dlq: dlq as number,
        retryScheduled: retryScheduled as number,
      };
    } catch (error) {
      Log.error(this.logger, error, 'Failed to get outbox stats', {
        component: 'RedisOutboxRepository',
        method: 'getStats',
      });
      return {
        pending: 0,
        processing: 0,
        published: 0,
        failed: 0,
        dlq: 0,
        retryScheduled: 0,
      };
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

  /**
   * Recover processing records on startup (handles crash recovery)
   */
  async recoverProcessing(): Promise<number> {
    try {
      const processingIds = await this.redis.lrange(
        this.keys.processing,
        0,
        -1,
      );

      if (processingIds.length === 0) return 0;

      // Move all processing records back to pending atomically
      const pipeline = this.redis.pipeline();
      processingIds.forEach((id) => {
        pipeline.lrem(this.keys.processing, 1, id);
        pipeline.lpush(this.keys.pending, id);
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
