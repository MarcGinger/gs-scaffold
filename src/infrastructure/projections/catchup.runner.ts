import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from '../eventstore/eventstore.service';
import { eventTypeFilter, START } from '@eventstore/db-client';
import { CheckpointStore } from './checkpoint.store';

/**
 * Type for projection handler functions
 */
export type ProjectFn = (evt: {
  type: string;
  data: any;
  metadata: any;
  streamId: string;
  revision?: bigint;
  position?: { commit: bigint; prepare: bigint };
}) => Promise<void>;

/**
 * Catch-up subscription runner for building projections
 * Processes events from $all stream with filters and maintains checkpoints
 */
@Injectable()
export class CatchUpRunner {
  private readonly logger = new Logger(CatchUpRunner.name);
  private readonly runningSubscriptions = new Map<string, boolean>();

  constructor(
    private readonly es: EventStoreService,
    private readonly checkpoints: CheckpointStore,
  ) {}

  /**
   * Run a catch-up subscription filtered by event type prefixes
   */
  async run(
    group: string,
    prefixes: string[],
    project: ProjectFn,
    options: {
      batchSize?: number;
      stopOnCaughtUp?: boolean;
      maxRetries?: number;
      retryDelayMs?: number;
    } = {},
  ): Promise<void> {
    const {
      batchSize = 100,
      stopOnCaughtUp = false,
      maxRetries = 3,
      retryDelayMs = 1000,
    } = options;

    if (this.runningSubscriptions.get(group)) {
      this.logger.warn({ group }, 'catchup.already.running');
      return;
    }

    this.runningSubscriptions.set(group, true);

    try {
      const key = group;
      const posStr = await this.checkpoints.get(key);

      this.logger.log(
        {
          group,
          prefixes,
          checkpointPosition: posStr || 'START',
          batchSize,
          stopOnCaughtUp,
        },
        'catchup.starting',
      );

      const sub = this.es.subscribeToAll({
        fromPosition: posStr
          ? { commit: BigInt(posStr), prepare: BigInt(posStr) }
          : START,
        filter: eventTypeFilter({ prefixes }),
      });

      let processedCount = 0;
      let errorCount = 0;
      const startTime = Date.now();

      for await (const res of sub) {
        try {
          if (!res.event) continue;

          const { event } = res;

          // Execute projection
          await this.executeProjectionWithRetry(
            project,
            {
              type: event.type,
              data: event.data,
              metadata: event.metadata,
              streamId: event.streamId || 'unknown',
              revision: event.revision,
              position: res.commitPosition
                ? { commit: res.commitPosition, prepare: res.commitPosition }
                : undefined,
            },
            maxRetries,
            retryDelayMs,
          );

          processedCount++;

          // Update checkpoint
          if (res.commitPosition) {
            await this.checkpoints.set(key, res.commitPosition.toString());
          }

          // Log progress periodically
          if (processedCount % batchSize === 0) {
            const elapsed = Date.now() - startTime;
            const rate = Math.round((processedCount / elapsed) * 1000);

            this.logger.debug(
              {
                group,
                processedCount,
                errorCount,
                rate: `${rate}/sec`,
                lastPosition: res.commitPosition?.toString(),
              },
              'catchup.progress',
            );
          }

          // Stop if caught up and requested (Note: isLiveEvent not available in all versions)
          // if (stopOnCaughtUp && res.isLiveEvent) {
          //   this.logger.log(
          //     { group, processedCount },
          //     'catchup.caughtUp.stopping',
          //   );
          //   break;
          // }
        } catch (err) {
          errorCount++;
          this.logger.error(
            {
              group,
              eventType: res.event?.type,
              eventId: res.event?.id,
              streamId: res.event?.streamId,
              error: err instanceof Error ? err.message : String(err),
            },
            'catchup.projection.failed',
          );

          // Optionally: push to DLQ / park list
          // For now, we continue processing
        }
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(
        {
          group,
          processedCount,
          errorCount,
          elapsedMs: elapsed,
          avgRate: Math.round((processedCount / elapsed) * 1000),
        },
        'catchup.completed',
      );
    } catch (error) {
      this.logger.error(
        {
          group,
          error: error instanceof Error ? error.message : String(error),
        },
        'catchup.failed',
      );
      throw error;
    } finally {
      this.runningSubscriptions.delete(group);
    }
  }

  /**
   * Execute projection with retry logic
   */
  private async executeProjectionWithRetry(
    project: ProjectFn,
    event: Parameters<ProjectFn>[0],
    maxRetries: number,
    retryDelayMs: number,
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await project(event);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          this.logger.warn(
            {
              eventType: event.type,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              eventId: event.metadata?.eventId,
              attempt: attempt + 1,
              maxRetries,
              error: lastError.message,
            },
            'catchup.projection.retry',
          );

          // Exponential backoff
          const delay = retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    throw new Error(lastError?.message || 'Unknown projection error');
  }

  /**
   * Check if a subscription is currently running
   */
  isRunning(group: string): boolean {
    return this.runningSubscriptions.get(group) || false;
  }

  /**
   * Stop a running subscription
   */
  stop(group: string): void {
    this.runningSubscriptions.delete(group);
    this.logger.log({ group }, 'catchup.stopped');
  }

  /**
   * Get status of all running subscriptions
   */
  getStatus(): Record<string, boolean> {
    return Object.fromEntries(this.runningSubscriptions);
  }

  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset checkpoint for a group (useful for replaying from start)
   */
  async resetCheckpoint(group: string): Promise<void> {
    await this.checkpoints.delete(group);
    this.logger.log({ group }, 'catchup.checkpoint.reset');
  }

  /**
   * Get current checkpoint position for a group
   */
  async getCheckpoint(group: string): Promise<string | null> {
    return this.checkpoints.get(group);
  }
}
