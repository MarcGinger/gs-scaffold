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
  private readonly logger = new Logger(EventStoreService.name);
  private readonly client: EventStoreDBClient;

  constructor() {
    // Prefer connection via env (gRPC/TLS) and service discovery in prod
    this.client = new EventStoreDBClient({
      endpoint: process.env.ESDB_ENDPOINT || 'esdb://localhost:2113?tls=false',
    });
  }

  /**
   * Append events with optimistic concurrency + structured logging
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

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.client.appendToStream(
          streamId,
          events.map(toJson),
          { expectedRevision },
        );
        this.logger.debug(
          {
            streamId,
            nextExpectedRevision: result.nextExpectedRevision?.toString(),
            correlationId: events[0]?.metadata?.correlationId,
          },
          'append.success',
        );
        return result;
      } catch (err) {
        if (err instanceof WrongExpectedVersionError && attempt < retries) {
          this.logger.warn(
            {
              streamId,
              attempt,
              correlationId: events[0]?.metadata?.correlationId,
            },
            'append.retry.wrongExpectedVersion',
          );
          continue; // let caller reload aggregate and retry or bump snapshot policy
        }
        this.logger.error(
          {
            streamId,
            err: err instanceof Error ? err.message : String(err),
            correlationId: events[0]?.metadata?.correlationId,
          },
          'append.failed',
        );
        throw err;
      }
    }
  }

  /**
   * Read a stream forward from a given revision
   */
  readStream(streamId: string, options?: ReadStreamOptions) {
    return this.client.readStream(streamId, options);
  }

  /**
   * Read stream backwards (useful for getting latest events)
   */
  readStreamBackwards(streamId: string, options?: ReadStreamOptions) {
    return this.client.readStream(streamId, {
      ...options,
      direction: 'backwards',
    });
  }

  /**
   * Subscribe to $all with filters (used by projection runners)
   */
  subscribeToAll(options: Parameters<EventStoreDBClient['subscribeToAll']>[0]) {
    return this.client.subscribeToAll(options);
  }

  /**
   * Get stream metadata
   */
  async getStreamMetadata(streamId: string) {
    return this.client.getStreamMetadata(streamId);
  }

  /**
   * Set stream metadata
   */
  async setStreamMetadata(streamId: string, metadata: Record<string, any>) {
    return this.client.setStreamMetadata(streamId, metadata);
  }

  /**
   * Persistent subscription utilities
   */
  persistent = {
    create: (stream: string, group: string, settings = {}) =>
      this.client.createPersistentSubscriptionToStream(
        stream,
        group,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        settings as any,
      ),

    connect: (stream: string, group: string, options?: any) =>
      this.client.subscribeToPersistentSubscriptionToStream(
        stream,
        group,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion
        options as any,
      ),

    update: (stream: string, group: string, settings: any) =>
      this.client.updatePersistentSubscriptionToStream(
        stream,
        group,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion
        settings as any,
      ),

    delete: (stream: string, group: string) =>
      this.client.deletePersistentSubscriptionToStream(stream, group),
  };

  /**
   * Health check - ping the EventStore connection
   */
  async ping(): Promise<boolean> {
    try {
      // Try to read from $stats to check connection
      const read = this.client.readStream('$stats', {
        fromRevision: START,
        maxCount: 1,
      });

      // Just attempt to get the first event or handle if stream doesn't exist
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of read) {
        break;
      }
      return true;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'eventstore.ping.failed',
      );
      return false;
    }
  }

  /**
   * Close the EventStore connection
   */
  async close(): Promise<void> {
    await this.client.dispose();
  }
}
