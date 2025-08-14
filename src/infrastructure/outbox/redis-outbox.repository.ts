import { Injectable, Logger } from '@nestjs/common';
import { OutboxRecord, OutboxRepository } from './outbox.entity';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

/**
 * Redis-based implementation of the outbox repository
 * Uses Redis Streams and Hash for reliable event storage
 */
@Injectable()
export class RedisOutboxRepository implements OutboxRepository {
  private readonly logger = new Logger(RedisOutboxRepository.name);
  private readonly outboxKey = 'outbox:events';
  private readonly statusKey = 'outbox:status';

  constructor(private readonly redis: Redis) {}

  /**
   * Add new outbox records
   */
  async add(records: OutboxRecord[]): Promise<void> {
    if (records.length === 0) return;

    try {
      const multi = this.redis.multi();

      for (const record of records) {
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
      }

      await multi.exec();

      this.logger.debug({ count: records.length }, 'outbox.add.success');
    } catch (error) {
      this.logger.error(
        {
          count: records.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.add.failed',
      );
      throw error;
    }
  }

  /**
   * Get next batch of pending records
   */
  async nextBatch(limit: number): Promise<OutboxRecord[]> {
    try {
      // Get batch of IDs from pending list
      const ids = await this.redis.lrange(
        `${this.statusKey}:pending`,
        0,
        limit - 1,
      );

      if (ids.length === 0) {
        return [];
      }

      // Remove from pending list
      await this.redis.ltrim(`${this.statusKey}:pending`, ids.length, -1);

      // Get full records
      const records: OutboxRecord[] = [];
      for (const id of ids) {
        const data = await this.redis.hgetall(`${this.outboxKey}:${id}`);

        if (data && Object.keys(data).length > 0) {
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
        }
      }

      this.logger.debug(
        { requested: limit, returned: records.length },
        'outbox.nextBatch',
      );

      return records;
    } catch (error) {
      this.logger.error(
        {
          limit,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.nextBatch.failed',
      );
      return [];
    }
  }

  /**
   * Mark records as published
   */
  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    try {
      const multi = this.redis.multi();

      for (const id of ids) {
        // Update status
        multi.hset(`${this.outboxKey}:${id}`, {
          status: 'published',
          updatedAt: new Date().toISOString(),
        });

        // Add to published list for cleanup
        multi.lpush(`${this.statusKey}:published`, id);
      }

      await multi.exec();

      this.logger.debug({ count: ids.length }, 'outbox.markPublished.success');
    } catch (error) {
      this.logger.error(
        {
          ids,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.markPublished.failed',
      );
      throw error;
    }
  }

  /**
   * Mark a record as failed
   */
  async markFailed(id: string, error: string): Promise<void> {
    try {
      const record = await this.redis.hgetall(`${this.outboxKey}:${id}`);

      if (!record || Object.keys(record).length === 0) {
        this.logger.warn({ id }, 'outbox.markFailed.recordNotFound');
        return;
      }

      const attempts = parseInt(record.attempts, 10) + 1;
      const nextRetryAt = new Date(Date.now() + attempts * 60000); // Exponential backoff

      await this.redis.hset(`${this.outboxKey}:${id}`, {
        status: 'failed',
        attempts: attempts.toString(),
        lastError: error,
        nextRetryAt: nextRetryAt.toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Add to failed list for retry processing
      await this.redis.lpush(`${this.statusKey}:failed`, id);

      this.logger.debug({ id, attempts, error }, 'outbox.markFailed.success');
    } catch (err) {
      this.logger.error(
        {
          id,
          error: err instanceof Error ? err.message : String(err),
        },
        'outbox.markFailed.failed',
      );
      throw err;
    }
  }

  /**
   * Get failed records ready for retry
   */
  async retryFailed(maxAttempts = 5): Promise<OutboxRecord[]> {
    try {
      const failedIds = await this.redis.lrange(
        `${this.statusKey}:failed`,
        0,
        -1,
      );
      const retryableRecords: OutboxRecord[] = [];
      const now = new Date();

      for (const id of failedIds) {
        const data = await this.redis.hgetall(`${this.outboxKey}:${id}`);

        if (!data || Object.keys(data).length === 0) continue;

        const attempts = parseInt(data.attempts, 10);
        const nextRetryAt = data.nextRetryAt
          ? new Date(data.nextRetryAt)
          : new Date(0);

        // Check if ready for retry
        if (attempts < maxAttempts && now >= nextRetryAt) {
          retryableRecords.push({
            id: data.id,
            eventId: data.eventId,
            type: data.type,
            payload: JSON.parse(data.payload),
            metadata: JSON.parse(data.metadata),
            status: data.status as OutboxRecord['status'],
            attempts,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
            lastError: data.lastError || undefined,
            nextRetryAt,
          });

          // Remove from failed list and add back to pending
          await this.redis.lrem(`${this.statusKey}:failed`, 1, id);
          await this.redis.lpush(`${this.statusKey}:pending`, id);
        }
      }

      this.logger.debug(
        { count: retryableRecords.length },
        'outbox.retryFailed',
      );

      return retryableRecords;
    } catch (error) {
      this.logger.error(
        {
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.retryFailed.failed',
      );
      return [];
    }
  }

  /**
   * Clean up old published/failed records
   */
  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date(
        Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
      );
      let deletedCount = 0;

      // Clean published records
      const publishedIds = await this.redis.lrange(
        `${this.statusKey}:published`,
        0,
        -1,
      );

      for (const id of publishedIds) {
        const data = await this.redis.hget(
          `${this.outboxKey}:${id}`,
          'updatedAt',
        );

        if (data && new Date(data) < cutoffDate) {
          await this.redis.del(`${this.outboxKey}:${id}`);
          await this.redis.lrem(`${this.statusKey}:published`, 1, id);
          deletedCount++;
        }
      }

      this.logger.debug({ olderThanDays, deletedCount }, 'outbox.cleanup');

      return deletedCount;
    } catch (error) {
      this.logger.error(
        {
          olderThanDays,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.cleanup.failed',
      );
      return 0;
    }
  }

  /**
   * Create a new outbox record from event data
   */
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
      payload,
      metadata,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get outbox statistics
   */
  async getStats(): Promise<{
    pending: number;
    published: number;
    failed: number;
  }> {
    try {
      const [pending, published, failed] = await Promise.all([
        this.redis.llen(`${this.statusKey}:pending`),
        this.redis.llen(`${this.statusKey}:published`),
        this.redis.llen(`${this.statusKey}:failed`),
      ]);

      return { pending, published, failed };
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.getStats.failed',
      );
      return { pending: 0, published: 0, failed: 0 };
    }
  }
}
