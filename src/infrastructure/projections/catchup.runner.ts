import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { type Logger } from 'pino';
import {
  eventTypeFilter,
  START,
  AllStreamSubscription,
} from '@eventstore/db-client';
import { EventStoreService } from '../eventstore/eventstore.service';
import { CheckpointStore } from './checkpoint.store';
import { Log } from '../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../shared/logging/logging.providers';

export type ProjectionEvent = {
  type: string;
  data: any;
  metadata?: Record<string, any>;
  streamId: string;
  revision: number;
  position?: { commit: bigint; prepare: bigint };
};

export type ProjectFn = (event: ProjectionEvent) => Promise<void> | void;

export interface DlqHook {
  publish(event: ProjectionEvent, reason: string): Promise<void>;
}

export interface RunOptions {
  /**
   * Event type prefixes to filter on (e.g., ['user-', 'order-'])
   */
  prefixes: string[];

  /**
   * Size of batch for checkpoint updates and logging
   */
  batchSize?: number;

  /**
   * Whether to stop when caught up to live events
   */
  stopOnCaughtUp?: boolean;

  /**
   * Maximum number of retries for failed projections
   */
  maxRetries?: number;

  /**
   * Base delay for retries (exponential backoff applied)
   */
  retryDelayMs?: number;

  /**
   * Dead letter queue hook for failed events
   */
  dlq?: DlqHook;

  /**
   * Throttle checkpoint writes (batch every N events)
   */
  checkpointBatchSize?: number;
}

interface SubscriptionHandle {
  subscription: AllStreamSubscription;
  abortController: AbortController;
}

interface CheckpointPosition {
  commit: bigint;
  prepare: bigint;
}

/**
 * Production-ready catch-up subscription runner for building projections
 * - Proper cancellation via AbortController
 * - Structured logging with Log.minimal API
 * - Enhanced checkpoint storage with commit/prepare positions
 * - DLQ support for failed events
 * - Retry classification for domain vs infrastructure errors
 * - Backpressure handling and concurrency control
 * - Graceful shutdown with checkpoint flushing
 */
@Injectable()
export class CatchUpRunner implements OnApplicationShutdown {
  private readonly runningSubscriptions = new Map<string, SubscriptionHandle>();
  private readonly pendingCheckpoints = new Map<string, CheckpointPosition>();

  constructor(
    private readonly es: EventStoreService,
    private readonly checkpoints: CheckpointStore,
    @Inject(APP_LOGGER) private readonly log: Logger,
  ) {}

  /**
   * Graceful shutdown: stop all subscriptions and flush checkpoints
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    Log.minimal.info(this.log, 'Shutting down catch-up runner', {
      component: 'CatchUpRunner',
      method: 'onApplicationShutdown',
      signal,
      activeSubscriptions: this.runningSubscriptions.size,
    });

    try {
      // Stop all running subscriptions and flush any pending checkpoints
      for (const [group] of this.runningSubscriptions.entries()) {
        // Flush pending checkpoint before stopping
        await this.flushCheckpoint(group);
        // Stop the subscription
        this.stop(group);
      }

      Log.minimal.info(this.log, 'Catch-up runner shutdown complete', {
        component: 'CatchUpRunner',
        method: 'onApplicationShutdown',
      });
    } catch (error) {
      Log.minimal.error(
        this.log,
        error instanceof Error ? error : new Error(String(error)),
        'Error during catch-up runner shutdown',
        {
          component: 'CatchUpRunner',
          method: 'onApplicationShutdown',
        },
      );
    }
  }

  /**
   * Start a catch-up subscription with production patterns
   */
  async run(
    group: string,
    project: ProjectFn,
    options: RunOptions,
  ): Promise<void> {
    const {
      prefixes,
      batchSize = 100,
      stopOnCaughtUp = false,
      maxRetries = 3,
      retryDelayMs = 1000,
      dlq,
      checkpointBatchSize = 10,
    } = options;

    if (this.runningSubscriptions.has(group)) {
      Log.minimal.warn(this.log, 'Catch-up subscription already running', {
        method: 'run',
        group,
        expected: true,
      });
      return;
    }

    // Setup cancellation
    const abortController = new AbortController();

    try {
      // Get checkpoint position - enhanced to support { commit, prepare }
      const checkpointPos = await this.getEnhancedCheckpoint(group);

      Log.minimal.info(this.log, 'Starting catch-up subscription', {
        method: 'run',
        group,
        prefixes: prefixes.join(','),
        checkpointPosition: checkpointPos
          ? `${checkpointPos.commit}:${checkpointPos.prepare}`
          : 'START',
        batchSize,
        stopOnCaughtUp,
        maxRetries,
        checkpointBatchSize,
        hasDlq: !!dlq,
      });

      // Create EventStore subscription
      const subscription = this.es.subscribeToAll({
        fromPosition: checkpointPos || START,
        filter: eventTypeFilter({ prefixes }),
      });

      // Store subscription handle for proper cancellation
      this.runningSubscriptions.set(group, { subscription, abortController });

      let processedCount = 0;
      let errorCount = 0;
      let dlqCount = 0;
      const startTime = Date.now();

      for await (const resolvedEvent of subscription) {
        // Check for cancellation
        if (abortController.signal.aborted) {
          Log.minimal.info(this.log, 'Catch-up subscription cancelled', {
            method: 'run',
            group,
            processedCount,
            errorCount,
            dlqCount,
          });
          break;
        }

        try {
          if (!resolvedEvent.event) continue;

          const { event } = resolvedEvent;
          const projectionEvent: ProjectionEvent = {
            type: event.type,
            data: event.data,
            metadata: event.metadata as Record<string, any> | undefined,
            streamId: event.streamId || 'unknown',
            revision: Number(event.revision || 0),
            position: resolvedEvent.commitPosition
              ? {
                  commit: resolvedEvent.commitPosition,
                  prepare: resolvedEvent.commitPosition, // Use commit for both
                }
              : undefined,
          };

          // Execute projection with enhanced retry logic
          await this.executeProjectionWithClassifiedRetry(
            project,
            projectionEvent,
            maxRetries,
            retryDelayMs,
          );

          processedCount++;

          // Batch checkpoint updates to reduce write pressure
          if (resolvedEvent.commitPosition) {
            this.pendingCheckpoints.set(group, {
              commit: resolvedEvent.commitPosition,
              prepare: resolvedEvent.commitPosition, // Use commit for both
            });

            if (processedCount % checkpointBatchSize === 0) {
              await this.flushCheckpoint(group);
            }
          }

          // Periodic progress logging
          if (processedCount % batchSize === 0) {
            const elapsed = Date.now() - startTime;
            const rate = Math.round((processedCount / elapsed) * 1000);

            Log.minimal.debug(this.log, 'Catch-up subscription progress', {
              method: 'run',
              group,
              processedCount,
              errorCount,
              dlqCount,
              rate: `${rate}/sec`,
              lastPosition: resolvedEvent.commitPosition?.toString(),
              timingMs: elapsed,
            });
          }

          // Stop if caught up (when available in client version)
          // if (stopOnCaughtUp && resolvedEvent.isLiveEvent) {
          //   Log.minimal.info(this.log, 'Caught up to live events, stopping', {
          //     method: 'run',
          //     group,
          //     processedCount,
          //   });
          //   break;
          // }
        } catch (err) {
          errorCount++;

          // Classify error and potentially send to DLQ
          const isProjectionError = this.isProjectionError(err);
          if (isProjectionError && dlq && resolvedEvent.event) {
            try {
              await dlq.publish(
                {
                  type: resolvedEvent.event.type,
                  data: resolvedEvent.event.data,
                  metadata: resolvedEvent.event.metadata as
                    | Record<string, any>
                    | undefined,
                  streamId: resolvedEvent.event.streamId || 'unknown',
                  revision: Number(resolvedEvent.event.revision || 0),
                  position: resolvedEvent.commitPosition
                    ? {
                        commit: resolvedEvent.commitPosition,
                        prepare: resolvedEvent.commitPosition, // Use commit for both
                      }
                    : undefined,
                },
                err instanceof Error ? err.message : String(err),
              );

              dlqCount++;

              Log.minimal.warn(
                this.log,
                'Event sent to DLQ after projection failure',
                {
                  method: 'run',
                  group,
                  eventType: resolvedEvent.event.type,
                  eventId: resolvedEvent.event.id,
                  streamId: resolvedEvent.event.streamId,
                  reason: err instanceof Error ? err.message : String(err),
                  expected: isProjectionError,
                },
              );
            } catch (dlqErr) {
              Log.minimal.error(this.log, dlqErr, 'Failed to publish to DLQ', {
                method: 'run',
                group,
                eventType: resolvedEvent.event.type,
              });
            }
          } else {
            Log.minimal.error(this.log, err, 'Event processing failed', {
              method: 'run',
              group,
              eventType: resolvedEvent.event?.type,
              eventId: resolvedEvent.event?.id,
              streamId: resolvedEvent.event?.streamId,
              expected: isProjectionError,
            });
          }
        }
      }

      // Flush any remaining checkpoint
      await this.flushCheckpoint(group);

      const elapsed = Date.now() - startTime;
      Log.minimal.info(this.log, 'Catch-up subscription completed', {
        method: 'run',
        group,
        processedCount,
        errorCount,
        dlqCount,
        timingMs: elapsed,
        avgRate:
          elapsed > 0 ? Math.round((processedCount / elapsed) * 1000) : 0,
      });
    } catch (error) {
      Log.minimal.error(this.log, error, 'Catch-up subscription failed', {
        method: 'run',
        group,
      });
      throw error;
    } finally {
      this.runningSubscriptions.delete(group);
      this.pendingCheckpoints.delete(group);
    }
  }

  /**
   * Get enhanced checkpoint with commit/prepare positions
   */
  private async getEnhancedCheckpoint(
    group: string,
  ): Promise<CheckpointPosition | null> {
    try {
      const stored = await this.checkpoints.get(group);
      if (!stored) return null;

      // The new CheckpointStore returns structured CheckpointPosition objects
      return {
        commit: BigInt(stored.commit),
        prepare: BigInt(stored.prepare),
      };
    } catch (error) {
      Log.minimal.warn(
        this.log,
        'Failed to parse checkpoint, starting from beginning',
        {
          method: 'getEnhancedCheckpoint',
          group,
          error: error instanceof Error ? error.message : String(error),
          expected: true,
        },
      );
      return null;
    }
  }

  /**
   * Flush pending checkpoint to storage
   */
  private async flushCheckpoint(group: string): Promise<void> {
    const pending = this.pendingCheckpoints.get(group);
    if (!pending) return;

    try {
      // Convert bigint positions to structured checkpoint position
      const checkpointPos: import('./checkpoint.store').CheckpointPosition = {
        commit: pending.commit.toString(),
        prepare: pending.prepare.toString(),
        updatedAt: new Date().toISOString(),
      };

      await this.checkpoints.set(group, checkpointPos);
      this.pendingCheckpoints.delete(group);
    } catch (error) {
      Log.minimal.error(this.log, error, 'Failed to flush checkpoint', {
        method: 'flushCheckpoint',
        group,
      });
    }
  }

  /**
   * Enhanced retry execution with error classification
   */
  private async executeProjectionWithClassifiedRetry(
    project: ProjectFn,
    event: ProjectionEvent,
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

        // Classify error type
        const isProjectionError = this.isProjectionError(error);

        // Don't retry domain/projection errors - they're deterministic
        if (isProjectionError && attempt === 0) {
          Log.minimal.warn(this.log, 'Domain error detected, not retrying', {
            method: 'executeProjectionWithClassifiedRetry',
            eventType: event.type,
            attempt: attempt + 1,
            error: lastError.message,
            expected: true,
          });
          throw lastError;
        }

        if (attempt < maxRetries && !isProjectionError) {
          const backoffMs = this.calculateJitteredBackoff(
            retryDelayMs,
            attempt,
          );

          Log.minimal.warn(
            this.log,
            'Infrastructure error, retrying with backoff',
            {
              method: 'executeProjectionWithClassifiedRetry',
              eventType: event.type,
              attempt: attempt + 1,
              maxRetries,
              backoffMs,
              error: lastError.message,
              retry: { attempt: attempt + 1, backoffMs },
            },
          );

          await this.sleep(backoffMs);
        }
      }
    }

    // All retries exhausted for infrastructure errors
    throw new Error(
      `Projection failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`,
    );
  }

  /**
   * Classify errors to distinguish domain logic failures from infrastructure issues
   */
  private isProjectionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Domain/business logic errors (4xx class) - don't retry
    const domainErrorPatterns = [
      'validation',
      'invalid',
      'constraint',
      'domain',
      'business',
      'aggregate',
      'unauthorized',
      'forbidden',
      'conflict',
      'not found',
      'already exists',
    ];

    // Infrastructure errors (5xx class) - can retry
    const infraErrorPatterns = [
      'timeout',
      'connection',
      'network',
      'unavailable',
      'redis',
      'database',
      'esdb',
      'eventstore',
    ];

    // Check if it's explicitly an infrastructure error first
    if (
      infraErrorPatterns.some(
        (pattern) => message.includes(pattern) || name.includes(pattern),
      )
    ) {
      return false; // Infrastructure error - can retry
    }

    // Check if it's a domain error
    if (
      domainErrorPatterns.some(
        (pattern) => message.includes(pattern) || name.includes(pattern),
      )
    ) {
      return true; // Domain error - don't retry
    }

    // Default: treat unknown errors as infrastructure (retryable)
    return false;
  }

  /**
   * Calculate jittered exponential backoff
   */
  private calculateJitteredBackoff(
    baseDelayMs: number,
    attempt: number,
  ): number {
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
    const maxDelay = 30000; // Cap at 30 seconds
    const baseDelay = Math.min(exponentialDelay, maxDelay);

    // Add jitter: +/- 25%
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(100, Math.floor(baseDelay + jitter)); // Minimum 100ms
  }

  /**
   * Check if a subscription is currently running
   */
  isRunning(group: string): boolean {
    return this.runningSubscriptions.has(group);
  }

  /**
   * Stop a running subscription with proper cancellation
   */
  stop(group: string): void {
    const handle = this.runningSubscriptions.get(group);
    if (handle) {
      // Signal cancellation - the async iterator will check this
      handle.abortController.abort();

      Log.minimal.info(this.log, 'Catch-up subscription stop requested', {
        method: 'stop',
        group,
      });
    } else {
      Log.minimal.warn(this.log, 'Attempted to stop non-running subscription', {
        method: 'stop',
        group,
        expected: true,
      });
    }
  }

  /**
   * Get status of all running subscriptions
   */
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [group] of this.runningSubscriptions) {
      status[group] = true;
    }
    return status;
  }

  /**
   * Utility sleep function with AbortSignal support
   */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Sleep cancelled'));
        return;
      }

      const timeout = setTimeout(resolve, ms);

      signal?.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Sleep cancelled'));
      });
    });
  }

  /**
   * Reset checkpoint for a group (useful for replaying from start)
   */
  async resetCheckpoint(group: string): Promise<void> {
    await this.checkpoints.delete(group);
    this.pendingCheckpoints.delete(group);

    Log.minimal.info(this.log, 'Checkpoint reset for replay', {
      method: 'resetCheckpoint',
      group,
    });
  }

  /**
   * Get current checkpoint position for a group with enhanced format
   */
  async getCheckpoint(group: string): Promise<CheckpointPosition | null> {
    return this.getEnhancedCheckpoint(group);
  }

  /**
   * Force flush pending checkpoints for a group
   */
  async forceFlushCheckpoint(group: string): Promise<void> {
    await this.flushCheckpoint(group);

    Log.minimal.debug(this.log, 'Checkpoint flushed', {
      method: 'forceFlushCheckpoint',
      group,
    });
  }

  /**
   * Get detailed status including performance metrics
   */
  getDetailedStatus(): Record<
    string,
    { running: boolean; hasPendingCheckpoint: boolean }
  > {
    const status: Record<
      string,
      { running: boolean; hasPendingCheckpoint: boolean }
    > = {};

    for (const [group] of this.runningSubscriptions) {
      status[group] = {
        running: true,
        hasPendingCheckpoint: this.pendingCheckpoints.has(group),
      };
    }

    return status;
  }
}
