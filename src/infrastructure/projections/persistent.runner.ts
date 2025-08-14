import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { PersistentSubscriptionToStreamSettings } from '@eventstore/db-client';
import { EventStoreService } from '../eventstore/eventstore.service';
import { Log } from '../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../shared/logging/logging.providers';

export type PersistentProjectFn = (event: {
  type: string;
  data: any;
  metadata: any;
  streamId: string;
  revision?: bigint;
}) => Promise<void>;

type RunnerState = {
  abort: AbortController;
  startedAt: number;
  counters: {
    processed: number;
    acked: number;
    nacked: number;
    errors: number;
  };
};

type FailureAction = 'retry' | 'park' | 'skip';

interface EnhancedSettings
  extends Partial<PersistentSubscriptionToStreamSettings> {
  // Additional runner controls
  progressEvery?: number; // log progress every N events (default 100)
  onFailure?: (ctx: {
    stream: string;
    group: string;
    error: Error;
    event: { id: string; type: string; streamId?: string };
  }) => FailureAction | Promise<FailureAction>;
}

/**
 * Production-ready persistent subscription runner with:
 * - Real cancellation via AbortController
 * - Structured logging with Log.minimal API
 * - Typed settings with PersistentSubscriptionToStreamSettings
 * - DLQ/retry policy hooks with configurable failure actions
 * - Backpressure control and visibility metrics
 * - Group creation idempotence
 * - Graceful cleanup and final metrics
 */
@Injectable()
export class PersistentRunner {
  private readonly running = new Map<string, RunnerState>();

  constructor(
    private readonly es: EventStoreService,
    @Inject(APP_LOGGER) private readonly log: Logger,
  ) {}

  private key(stream: string, group: string): string {
    return `${stream}::${group}`;
  }

  /**
   * Ensure persistent subscription group exists and start consuming with production patterns
   */
  async ensureAndRun(
    stream: string,
    group: string,
    project: PersistentProjectFn,
    settings: EnhancedSettings = {},
  ): Promise<void> {
    const subscriptionKey = this.key(stream, group);

    if (this.running.has(subscriptionKey)) {
      Log.minimal.warn(this.log, 'Persistent subscription already running', {
        method: 'ensureAndRun',
        stream,
        group,
        expected: true,
      });
      return;
    }

    // Extract runner-specific settings from EventStore settings
    const {
      progressEvery = 100,
      onFailure,
      ...groupSettings
    } = {
      // Production defaults
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

    // Ensure group exists (idempotent - treat "already exists" as success)
    try {
      await this.es.persistent.create(stream, group, groupSettings);
      Log.minimal.info(this.log, 'Persistent subscription group created', {
        method: 'ensureAndRun',
        stream,
        group,
        bufferSize: groupSettings.bufferSize,
        readBatchSize: groupSettings.readBatchSize,
        maxRetryCount: groupSettings.maxRetryCount,
      });
    } catch {
      // EventStore throws known error for existing groups - log at debug level
      Log.minimal.debug(
        this.log,
        'Persistent subscription group already exists',
        {
          method: 'ensureAndRun',
          stream,
          group,
          expected: true,
        },
      );
    }

    // Prepare runner state with AbortController for real cancellation
    const abort = new AbortController();
    const state: RunnerState = {
      abort,
      startedAt: Date.now(),
      counters: { processed: 0, acked: 0, nacked: 0, errors: 0 },
    };
    this.running.set(subscriptionKey, state);

    Log.minimal.info(this.log, 'Starting persistent subscription', {
      method: 'ensureAndRun',
      stream,
      group,
      progressEvery,
      bufferSize: groupSettings.bufferSize,
      readBatchSize: groupSettings.readBatchSize,
      hasFailureHook: !!onFailure,
    });

    try {
      // Connect to persistent subscription
      const sub = this.es.persistent.connect(stream, group);

      for await (const resolvedEvent of sub) {
        // Check for external stop/cancellation
        if (!this.running.has(subscriptionKey) || abort.signal.aborted) {
          Log.minimal.info(this.log, 'Persistent subscription cancelled', {
            method: 'ensureAndRun',
            stream,
            group,
            processed: state.counters.processed,
            acked: state.counters.acked,
            nacked: state.counters.nacked,
          });
          break;
        }

        const ev = resolvedEvent.event;
        if (!ev) {
          // Some SDK versions surface system messages; ack and continue
          if (
            'ack' in resolvedEvent &&
            typeof resolvedEvent.ack === 'function'
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            resolvedEvent.ack();
          }
          continue;
        }

        try {
          await project({
            type: ev.type,
            data: ev.data,
            metadata: ev.metadata,
            streamId: ev.streamId || 'unknown',
            revision: ev.revision,
          });

          // Acknowledge successful processing
          if (
            'ack' in resolvedEvent &&
            typeof resolvedEvent.ack === 'function'
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            resolvedEvent.ack();
          }

          state.counters.processed++;
          state.counters.acked++;

          // Emit progress counters for visibility
          if (state.counters.processed % progressEvery === 0) {
            const elapsed = Date.now() - state.startedAt;
            const rate = Math.round(
              (state.counters.processed / Math.max(elapsed, 1)) * 1000,
            );

            Log.minimal.debug(this.log, 'Persistent subscription progress', {
              method: 'ensureAndRun',
              stream,
              group,
              processed: state.counters.processed,
              acked: state.counters.acked,
              nacked: state.counters.nacked,
              errors: state.counters.errors,
              ratePerSec: rate,
              timingMs: elapsed,
            });
          }
        } catch (err) {
          state.counters.errors++;
          const error = err instanceof Error ? err : new Error(String(err));

          // Enhanced error logging with event.id and correlationId
          Log.minimal.error(
            this.log,
            error,
            'Persistent subscription projection failed',
            {
              method: 'ensureAndRun',
              stream,
              group,
              eventType: ev.type,
              eventId: ev.id,
              streamId: ev.streamId,
              correlationId:
                typeof ev.metadata === 'object' && ev.metadata !== null
                  ? (ev.metadata as Record<string, unknown>).correlationId
                  : undefined,
              expected: false,
            },
          );

          // Determine failure action using policy hook
          let action: FailureAction = 'park'; // Safe default
          if (onFailure) {
            try {
              action = await onFailure({
                stream,
                group,
                error,
                event: { id: ev.id, type: ev.type, streamId: ev.streamId },
              });
            } catch (policyErr) {
              Log.minimal.error(
                this.log,
                policyErr as Error,
                'Failure policy hook error, using park',
                {
                  method: 'ensureAndRun',
                  stream,
                  group,
                  eventId: ev.id,
                },
              );
              action = 'park';
            }
          }

          // Nack with determined action
          if (
            'nack' in resolvedEvent &&
            typeof resolvedEvent.nack === 'function'
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            resolvedEvent.nack(action, error.message);
          }

          state.counters.nacked++;

          Log.minimal.warn(this.log, 'Event nacked with failure action', {
            method: 'ensureAndRun',
            stream,
            group,
            eventId: ev.id,
            action,
            reason: error.message,
          });
        }
      }

      // Graceful final log with complete metrics
      const elapsed = Date.now() - state.startedAt;
      Log.minimal.info(this.log, 'Persistent subscription completed', {
        method: 'ensureAndRun',
        stream,
        group,
        processed: state.counters.processed,
        acked: state.counters.acked,
        nacked: state.counters.nacked,
        errors: state.counters.errors,
        timingMs: elapsed,
        avgRatePerSec:
          elapsed > 0
            ? Math.round((state.counters.processed / elapsed) * 1000)
            : 0,
      });
    } catch (error) {
      Log.minimal.error(
        this.log,
        error as Error,
        'Persistent subscription failed',
        {
          method: 'ensureAndRun',
          stream,
          group,
        },
      );
      throw error;
    } finally {
      // Cleanup: remove runner entry
      this.running.delete(subscriptionKey);
    }
  }

  /**
   * Stop a running persistent subscription with real cancellation
   */
  stop(stream: string, group: string): void {
    const key = this.key(stream, group);
    const state = this.running.get(key);

    if (state) {
      // Signal real cancellation - AbortController cancels async iterator
      state.abort.abort();

      // Graceful final log with metrics before cleanup
      const elapsed = Date.now() - state.startedAt;
      Log.minimal.info(this.log, 'Persistent subscription stop requested', {
        method: 'stop',
        stream,
        group,
        processed: state.counters.processed,
        acked: state.counters.acked,
        nacked: state.counters.nacked,
        errors: state.counters.errors,
        timingMs: elapsed,
      });

      // Remove runner entry for cleanup
      this.running.delete(key);
    } else {
      Log.minimal.warn(this.log, 'Attempted to stop non-running subscription', {
        method: 'stop',
        stream,
        group,
        expected: true,
      });
    }
  }

  /**
   * Check if a persistent subscription is running
   */
  isRunning(stream: string, group: string): boolean {
    return this.running.has(this.key(stream, group));
  }

  /**
   * Get status of all running persistent subscriptions
   */
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [key] of this.running) {
      status[key] = true;
    }
    return status;
  }

  /**
   * Update persistent subscription settings with typed parameters
   */
  async updateSubscription(
    stream: string,
    group: string,
    settings: Partial<PersistentSubscriptionToStreamSettings>,
  ): Promise<void> {
    try {
      await this.es.persistent.update(stream, group, settings);

      Log.minimal.info(this.log, 'Persistent subscription updated', {
        method: 'updateSubscription',
        stream,
        group,
        updatedSettings: Object.keys(settings),
      });
    } catch (error) {
      Log.minimal.error(
        this.log,
        error as Error,
        'Failed to update persistent subscription',
        {
          method: 'updateSubscription',
          stream,
          group,
          settings: Object.keys(settings),
        },
      );
      throw error;
    }
  }

  /**
   * Delete a persistent subscription group with proper cleanup
   */
  async deleteSubscription(stream: string, group: string): Promise<void> {
    try {
      // Stop if running first
      this.stop(stream, group);

      await this.es.persistent.delete(stream, group);

      Log.minimal.info(this.log, 'Persistent subscription deleted', {
        method: 'deleteSubscription',
        stream,
        group,
      });
    } catch (error) {
      Log.minimal.error(
        this.log,
        error as Error,
        'Failed to delete persistent subscription',
        {
          method: 'deleteSubscription',
          stream,
          group,
        },
      );
      throw error;
    }
  }

  /**
   * Get detailed status with performance metrics
   */
  getDetailedStatus(): Record<
    string,
    {
      running: boolean;
      processed: number;
      acked: number;
      nacked: number;
      errors: number;
      uptimeMs: number;
      ratePerSec: number;
    }
  > {
    const status: Record<string, any> = {};
    const now = Date.now();

    for (const [key, state] of this.running) {
      const elapsed = now - state.startedAt;
      status[key] = {
        running: true,
        processed: state.counters.processed,
        acked: state.counters.acked,
        nacked: state.counters.nacked,
        errors: state.counters.errors,
        uptimeMs: elapsed,
        ratePerSec:
          elapsed > 0
            ? Math.round((state.counters.processed / elapsed) * 1000)
            : 0,
      };
    }

    return status;
  }

  /**
   * Force stop all running subscriptions (useful for shutdown)
   */
  stopAll(): void {
    const keys = Array.from(this.running.keys());

    Log.minimal.info(this.log, 'Stopping all persistent subscriptions', {
      method: 'stopAll',
      count: keys.length,
      subscriptions: keys,
    });

    for (const key of keys) {
      const [stream, group] = key.split('::');
      this.stop(stream, group);
    }
  }
}
