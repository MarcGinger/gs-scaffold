import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from '../eventstore/eventstore.service';

/**
 * Type for persistent subscription projection handlers
 */
export type PersistentProjectFn = (event: {
  type: string;
  data: any;
  metadata: any;
  streamId: string;
  revision?: bigint;
}) => Promise<void>;

/**
 * Persistent subscription runner for real-time event processing
 * Uses EventStore's built-in persistent subscriptions with competitive consumers
 */
@Injectable()
export class PersistentRunner {
  private readonly logger = new Logger(PersistentRunner.name);
  private readonly runningSubscriptions = new Map<string, boolean>();

  constructor(private readonly es: EventStoreService) {}

  /**
   * Ensure persistent subscription group exists and start consuming
   */
  async ensureAndRun(
    stream: string,
    group: string,
    project: PersistentProjectFn,
    settings: {
      resolveLinkTos?: boolean;
      bufferSize?: number;
      checkpointAfter?: number;
      checkpointLowerBound?: number;
      checkpointUpperBound?: number;
      maxRetryCount?: number;
      liveBufferSize?: number;
      readBatchSize?: number;
      historyBufferSize?: number;
      messageTimeoutMs?: number;
      extraStatistics?: boolean;
    } = {},
  ): Promise<void> {
    const subscriptionKey = `${stream}::${group}`;

    if (this.runningSubscriptions.get(subscriptionKey)) {
      this.logger.warn({ stream, group }, 'persistent.already.running');
      return;
    }

    const defaultSettings = {
      resolveLinkTos: true,
      bufferSize: 32,
      checkpointAfter: 2000,
      checkpointLowerBound: 10,
      checkpointUpperBound: 1000,
      maxRetryCount: 10,
      liveBufferSize: 500,
      readBatchSize: 20,
      historyBufferSize: 500,
      messageTimeoutMs: 30000,
      extraStatistics: true,
      ...settings,
    };

    try {
      // Ensure persistent subscription group exists (idempotent)
      try {
        await this.es.persistent.create(stream, group, defaultSettings);
        this.logger.log({ stream, group }, 'persistent.group.created');
      } catch (error) {
        // Group already exists - this is expected
        this.logger.debug(
          { stream, group, error: String(error) },
          'persistent.group.exists',
        );
      }

      this.runningSubscriptions.set(subscriptionKey, true);

      this.logger.log(
        { stream, group, settings: defaultSettings },
        'persistent.starting',
      );

      // Connect to persistent subscription
      const sub = this.es.persistent.connect(stream, group);

      let processedCount = 0;
      let errorCount = 0;
      let ackedCount = 0;
      let nackedCount = 0;
      const startTime = Date.now();

      for await (const resolvedEvent of sub) {
        if (!this.runningSubscriptions.get(subscriptionKey)) {
          this.logger.log({ stream, group }, 'persistent.stopping');
          break;
        }

        if (!resolvedEvent.event) {
          // Ack empty events
          if (
            'ack' in resolvedEvent &&
            typeof resolvedEvent.ack === 'function'
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            resolvedEvent.ack();
          }
          continue;
        }

        const { event } = resolvedEvent;

        try {
          await project({
            type: event.type,
            data: event.data,
            metadata: event.metadata,
            streamId: event.streamId || 'unknown',
            revision: event.revision,
          });

          // Acknowledge successful processing
          if (
            'ack' in resolvedEvent &&
            typeof resolvedEvent.ack === 'function'
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            resolvedEvent.ack();
          }
          processedCount++;
          ackedCount++;

          // Log progress periodically
          if (processedCount % 100 === 0) {
            const elapsed = Date.now() - startTime;
            const rate = Math.round((processedCount / elapsed) * 1000);

            this.logger.debug(
              {
                stream,
                group,
                processedCount,
                errorCount,
                ackedCount,
                nackedCount,
                rate: `${rate}/sec`,
              },
              'persistent.progress',
            );
          }
        } catch (error) {
          errorCount++;
          nackedCount++;

          this.logger.error(
            {
              stream,
              group,
              eventType: event.type,
              eventId: event.id,
              streamId: event.streamId,
              error: error instanceof Error ? error.message : String(error),
            },
            'persistent.project.failed',
          );

          // Policy: retry | park | skip
          // For now, we park the message (sends to DLQ after max retries)
          if (
            'nack' in resolvedEvent &&
            typeof resolvedEvent.nack === 'function'
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            resolvedEvent.nack('park', String(error));
          }
        }
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(
        {
          stream,
          group,
          processedCount,
          errorCount,
          ackedCount,
          nackedCount,
          elapsedMs: elapsed,
          avgRate: Math.round((processedCount / elapsed) * 1000),
        },
        'persistent.completed',
      );
    } catch (error) {
      this.logger.error(
        {
          stream,
          group,
          error: error instanceof Error ? error.message : String(error),
        },
        'persistent.failed',
      );
      throw error;
    } finally {
      this.runningSubscriptions.delete(subscriptionKey);
    }
  }

  /**
   * Stop a running persistent subscription
   */
  stop(stream: string, group: string): void {
    const subscriptionKey = `${stream}::${group}`;
    this.runningSubscriptions.delete(subscriptionKey);
    this.logger.log({ stream, group }, 'persistent.stop.requested');
  }

  /**
   * Check if a persistent subscription is running
   */
  isRunning(stream: string, group: string): boolean {
    const subscriptionKey = `${stream}::${group}`;
    return this.runningSubscriptions.get(subscriptionKey) || false;
  }

  /**
   * Get status of all running persistent subscriptions
   */
  getStatus(): Record<string, boolean> {
    return Object.fromEntries(this.runningSubscriptions);
  }

  /**
   * Update persistent subscription settings
   */
  async updateSubscription(
    stream: string,
    group: string,
    settings: Record<string, any>,
  ): Promise<void> {
    try {
      await this.es.persistent.update(stream, group, settings);
      this.logger.log({ stream, group, settings }, 'persistent.updated');
    } catch (error) {
      this.logger.error(
        {
          stream,
          group,
          settings,
          error: error instanceof Error ? error.message : String(error),
        },
        'persistent.update.failed',
      );
      throw error;
    }
  }

  /**
   * Delete a persistent subscription group
   */
  async deleteSubscription(stream: string, group: string): Promise<void> {
    try {
      await this.es.persistent.delete(stream, group);
      this.runningSubscriptions.delete(`${stream}::${group}`);
      this.logger.log({ stream, group }, 'persistent.deleted');
    } catch (error) {
      this.logger.error(
        {
          stream,
          group,
          error: error instanceof Error ? error.message : String(error),
        },
        'persistent.delete.failed',
      );
      throw error;
    }
  }

  /**
   * Get subscription statistics (if supported by EventStore version)
   */
  getSubscriptionStats(
    stream: string,
    group: string,
  ): Record<string, any> | null {
    try {
      // Note: This would require additional EventStore client methods
      // For now, return basic info
      return {
        stream,
        group,
        isRunning: this.isRunning(stream, group),
        subscriptionKey: `${stream}::${group}`,
      };
    } catch (error) {
      this.logger.error(
        {
          stream,
          group,
          error: error instanceof Error ? error.message : String(error),
        },
        'persistent.stats.failed',
      );
      return null;
    }
  }
}
