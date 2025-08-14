import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisOutboxRepository, StandardJobMetadata } from '../../outbox';

/**
 * Outbox publisher that moves events from outbox to BullMQ queues
 * Implements the outbox pattern for reliable event publishing
 */
@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(
    private readonly outbox: RedisOutboxRepository,
    @Inject('NotificationQueue')
    private readonly notificationQueue: Queue,
    @Inject('ProjectionQueue')
    private readonly projectionQueue: Queue,
  ) {}

  /**
   * Publish a batch of outbox records to appropriate queues
   */
  async publishBatch(
    limit = 100,
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      const items = await this.outbox.nextBatch(limit);

      if (items.length === 0) {
        return { processed: 0, failed: 0 };
      }

      this.logger.debug({ count: items.length }, 'outbox.publishBatch.start');

      const publishedIds: string[] = [];

      for (const item of items) {
        try {
          // Create job metadata
          const jobMetadata: StandardJobMetadata = {
            correlationId: item.metadata?.correlationId || item.eventId,
            causationId: item.metadata?.causationId,
            source: item.metadata?.source || 'outbox-publisher',
            timestamp: new Date().toISOString(),
            user: item.metadata?.user,
            businessContext: {
              eventType: item.type,
              eventId: item.eventId,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              originalMetadata: item.metadata,
            },
          };

          // Route to appropriate queue based on event type
          const queue = this.selectQueue(item.type);

          await queue.add(
            item.type,
            {
              eventId: item.eventId,
              type: item.type,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              payload: item.payload,
              metadata: jobMetadata,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              originalMetadata: item.metadata,
            },
            {
              jobId: item.eventId, // Ensures idempotency
              removeOnComplete: 100,
              removeOnFail: 50,
              attempts: 3,
              delay: 0,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            },
          );

          publishedIds.push(item.id);
          processed++;

          this.logger.debug(
            {
              eventId: item.eventId,
              eventType: item.type,
              queue: queue.name,
            },
            'outbox.item.published',
          );
        } catch (error) {
          failed++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          await this.outbox.markFailed(item.id, errorMessage);

          this.logger.error(
            {
              itemId: item.id,
              eventId: item.eventId,
              eventType: item.type,
              error: errorMessage,
            },
            'outbox.item.failed',
          );
        }
      }

      // Mark successfully published items
      if (publishedIds.length > 0) {
        await this.outbox.markPublished(publishedIds);
      }

      this.logger.log(
        { processed, failed, total: items.length },
        'outbox.publishBatch.complete',
      );

      return { processed, failed };
    } catch (error) {
      this.logger.error(
        {
          limit,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.publishBatch.error',
      );
      return { processed, failed };
    }
  }

  /**
   * Select appropriate queue based on event type
   */
  private selectQueue(eventType: string): Queue {
    // Route notification events to notification queue
    if (
      eventType.includes('notification') ||
      eventType.includes('email') ||
      eventType.includes('sms')
    ) {
      return this.notificationQueue;
    }

    // Route projection events to projection queue
    if (eventType.includes('projection') || eventType.includes('read-model')) {
      return this.projectionQueue;
    }

    // Default to notification queue for domain events
    return this.notificationQueue;
  }

  /**
   * Retry failed outbox records
   */
  async retryFailed(maxAttempts = 5): Promise<{ retried: number }> {
    try {
      const retryableItems = await this.outbox.retryFailed(maxAttempts);

      this.logger.log(
        { count: retryableItems.length },
        'outbox.retryFailed.found',
      );

      return { retried: retryableItems.length };
    } catch (error) {
      this.logger.error(
        {
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.retryFailed.error',
      );
      return { retried: 0 };
    }
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
      return await this.outbox.getStats();
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.getStats.error',
      );
      return { pending: 0, published: 0, failed: 0 };
    }
  }

  /**
   * Clean up old outbox records
   */
  async cleanup(olderThanDays = 7): Promise<{ deleted: number }> {
    try {
      const deleted = await this.outbox.cleanup(olderThanDays);

      this.logger.log({ deleted, olderThanDays }, 'outbox.cleanup.complete');

      return { deleted };
    } catch (error) {
      this.logger.error(
        {
          olderThanDays,
          error: error instanceof Error ? error.message : String(error),
        },
        'outbox.cleanup.error',
      );
      return { deleted: 0 };
    }
  }
}
