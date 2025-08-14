import {
  EventStoreDBClient,
  jsonEvent,
  START,
  NO_STREAM,
  WrongExpectedVersionError,
  ReadStreamOptions,
  BACKWARDS,
  FORWARDS,
  ReadAllOptions,
  PersistentSubscriptionToStreamSettings,
} from '@eventstore/db-client';
import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { ConfigManager } from '../../shared/config/config.manager';
import { Log } from '../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../shared/logging/logging.providers';
import { EventEnvelope } from '../../domain/common/events';

@Injectable()
export class EventStoreService {
  private readonly client: EventStoreDBClient;

  constructor(
    private readonly configManager: ConfigManager,
    @Inject(APP_LOGGER) private readonly baseLogger: Logger,
  ) {
    // Get EventStore connection from centralized config
    const esdbConn = this.getEsdbConnectionString();
    this.client = new EventStoreDBClient({ endpoint: esdbConn });

    Log.info(this.baseLogger, 'EventStoreService initialized', {
      component: 'EventStoreService',
      method: 'constructor',
      esdbEndpoint: esdbConn.replace(/\/\/.*@/, '//***@'), // Hide credentials if any
    });
  }

  /**
   * Get EventStore connection string from centralized config
   */
  private getEsdbConnectionString(): string {
    return (
      this.configManager.get('ESDB_CONNECTION_STRING') ??
      this.configManager.get('ESDB_ENDPOINT') ??
      'esdb://localhost:2113?tls=false'
    );
  }

  /**
   * Get the underlying EventStoreDBClient for direct access
   * Used by infrastructure providers that need the raw client
   */
  getClient(): EventStoreDBClient {
    return this.client;
  }

  /**
   * Append events with optimistic concurrency + structured logging + jittered backoff
   */
  async append<T>(
    streamId: string,
    events: Array<EventEnvelope<T>>,
    expectedRevision: bigint | typeof NO_STREAM,
    retries = 2,
  ) {
    const toJson = (e: EventEnvelope<T>) =>
      jsonEvent({
        type: e.type,
        data: e.data as any,
        metadata: e.metadata,
      });

    const correlationId = events[0]?.metadata?.correlationId;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.client.appendToStream(
          streamId,
          events.map(toJson),
          { expectedRevision },
        );

        Log.debug(this.baseLogger, 'append.success', {
          component: 'EventStoreService',
          method: 'append',
          streamId,
          nextExpectedRevision: result.nextExpectedRevision?.toString(),
          correlationId,
          eventCount: events.length,
        });

        return result;
      } catch (err) {
        if (err instanceof WrongExpectedVersionError && attempt < retries) {
          Log.warn(this.baseLogger, 'append.retry.wrongExpectedVersion', {
            component: 'EventStoreService',
            method: 'append',
            streamId,
            attempt,
            retries,
            correlationId,
          });

          // Jittered exponential backoff to reduce contention
          const baseDelay = 50 * Math.pow(2, attempt);
          const jitter = Math.random() * 0.3; // +/- 30% jitter
          const delay = Math.min(baseDelay * (1 + jitter), 500);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        Log.error(this.baseLogger, err as Error, 'append.failed', {
          component: 'EventStoreService',
          method: 'append',
          streamId,
          correlationId,
          attempt,
        });
        throw err;
      }
    }
  }

  /**
   * Read a stream forward (default direction)
   */
  readStream(streamId: string, options?: ReadStreamOptions) {
    return this.client.readStream(streamId, {
      direction: FORWARDS,
      ...options,
    });
  }

  /**
   * Read stream backwards (tail-first) using typed constant
   */
  readStreamBackwards(streamId: string, options?: ReadStreamOptions) {
    return this.client.readStream(streamId, {
      direction: BACKWARDS,
      ...options,
    });
  }

  /**
   * Read $all stream (lightweight; useful for health/checkpoint)
   */
  readAll(options?: ReadAllOptions) {
    return this.client.readAll({ direction: FORWARDS, ...options });
  }

  /**
   * Subscribe to $all with filters (used by projection runners)
   */
  subscribeToAll(options: Parameters<EventStoreDBClient['subscribeToAll']>[0]) {
    return this.client.subscribeToAll(options);
  }

  /**
   * Get stream metadata (typed pass-through)
   */
  async getStreamMetadata(streamId: string) {
    return this.client.getStreamMetadata(streamId);
  }

  /**
   * Set stream metadata (typed pass-through)
   */
  async setStreamMetadata(streamId: string, metadata: Record<string, any>) {
    return this.client.setStreamMetadata(streamId, metadata);
  }

  /**
   * Persistent subscription utilities with proper typing
   */
  persistent = {
    create: (
      stream: string,
      group: string,
      settings?: Partial<PersistentSubscriptionToStreamSettings>,
    ) =>
      this.client.createPersistentSubscriptionToStream(
        stream,
        group,
        settings as PersistentSubscriptionToStreamSettings,
      ),

    connect: (stream: string, group: string) =>
      this.client.subscribeToPersistentSubscriptionToStream(stream, group),

    update: (
      stream: string,
      group: string,
      settings: Partial<PersistentSubscriptionToStreamSettings>,
    ) =>
      this.client.updatePersistentSubscriptionToStream(
        stream,
        group,
        settings as PersistentSubscriptionToStreamSettings,
      ),

    delete: (stream: string, group: string) =>
      this.client.deletePersistentSubscriptionToStream(stream, group),
  };

  /**
   * Health check - avoids $stats (may be disabled/privileged)
   * Uses lightweight readAll instead
   */
  async ping(): Promise<boolean> {
    try {
      const iter = this.readAll({ fromPosition: START, maxCount: 1 });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of iter) break;

      Log.debug(this.baseLogger, 'eventstore.ping.success', {
        component: 'EventStoreService',
        method: 'ping',
      });
      return true;
    } catch (error) {
      Log.error(this.baseLogger, error as Error, 'eventstore.ping.failed', {
        component: 'EventStoreService',
        method: 'ping',
      });
      return false;
    }
  }

  /**
   * Close the EventStore connection gracefully
   */
  async close(): Promise<void> {
    await this.client.dispose();
    Log.info(this.baseLogger, 'EventStoreService disposed', {
      component: 'EventStoreService',
      method: 'close',
    });
  }
}
