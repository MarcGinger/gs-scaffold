import {
  EventStoreDBClient,
  EventType,
  END,
  BACKWARDS,
  StreamNotFoundError,
  START,
  FORWARDS,
  ResolvedEvent,
  StreamSubscription,
  jsonEvent,
  JSONType,
} from '@eventstore/db-client';
import { Injectable } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { ILogger } from 'src/shared/logger';
import { randomUUID } from 'crypto';
import { IEventStore, StoreSubscriptionOptions } from './event-store.model';

/**
 * EventStore implementation using EventStoreDB client.
 * Provides event sourcing capabilities with CQRS support.
 * @template T The event data type
 */
@Injectable()
export class EsdbEventStore<T> implements IEventStore<T> {
  private static eventstoreDBClient: EventStoreDBClient;

  /**
   * Creates and returns a singleton EventStoreDB client instance.
   * @returns {EventStoreDBClient} The EventStoreDB client
   */
  public static create(): EventStoreDBClient {
    if (!this.eventstoreDBClient) {
      EsdbEventStore.eventstoreDBClient = EventStoreDBClient.connectionString(
        process.env.EVENSTORE_URL || '',
      );
    }
    return EsdbEventStore.eventstoreDBClient;
  }

  private client: EventStoreDBClient;

  serviceName: string = '';
  private subscriptions: Subscription[] = [];
  private isShuttingDown = false;

  /**
   * Initializes a new EsdbEventStore instance.
   * @param {string} serviceName - The name of the service using this store
   * @param {ILogger} logger - Logger instance for operation logging
   */
  constructor(
    serviceName: string,
    private logger: ILogger,
  ) {
    this.serviceName = serviceName;
    this.client = EsdbEventStore.create();
  }

  /**
   * Appends events to a stream.
   * @param {Object} payload - The payload containing stream, type, and event data
   * @param {string} payload.stream - The stream name
   * @param {string} payload.type - The event type
   * @param {Partial<T> | (T | undefined)[]} payload.event - The event data
   * @returns {Promise<void>} Promise that resolves when events are appended
   */
  appendToStream(payload: {
    stream: string;
    type: string;
    event: Partial<T> | (T | undefined)[];
  }): Promise<void> {
    // Delegate to the existing write method
    return this.write({
      stream: payload.stream,
      type: payload.type,
      event: payload.event as T | T[], // Cast to match write method signature
    });
  }

  /**
   * Subscribes to a stream with live updates.
   * @template T The event data type
   * @param {string} stream - The stream name to subscribe to
   * @param {StoreSubscriptionOptions<T>} opts - Subscription options
   * @returns {Subscription} RxJS subscription for managing the stream subscription
   */
  subscribeToStream<T>(
    stream: string,
    opts: StoreSubscriptionOptions<T>,
  ): Subscription {
    // Delegate to the existing subscribe method
    return this.subscribe(stream, opts);
  }

  /**
   * Performs catchup reading from a stream to replay historical events.
   * @template T The event data type
   * @param {string} stream - The stream name to read from
   * @param {StoreSubscriptionOptions<T>} opts - Catchup options including start position and event handler
   * @returns {Promise<bigint | undefined>} Promise resolving to the last revision processed
   */
  catchupStream<T>(
    stream: string,
    opts: StoreSubscriptionOptions<T>,
  ): Promise<bigint | undefined> {
    // Delegate to the existing catchup method
    return this.catchup(stream, opts);
  }

  /**
   * Gets the current revision number of a stream.
   * @param {string} stream - The stream name
   * @returns {Promise<bigint | null>} Promise resolving to the stream revision or null if not found
   */
  getStreamRevision(stream: string): Promise<bigint | null> {
    // Delegate to the existing getLastRevision method
    return this.getLastRevision(stream);
  }

  /**
   * Shuts down the EventStore by unsubscribing from all active subscriptions.
   * Sets the shutdown flag to prevent new subscriptions from being created.
   */
  public shutdown() {
    this.isShuttingDown = true;
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.logger.log(
      this.createLogContext('shutdown', 'all', this.serviceName),
      'EsdbEventStore: All subscriptions unsubscribed and shutdown triggered.',
    );
  }

  /**
   * Writes events to a stream with proper metadata handling.
   * Extracts domain and stream metadata from events and merges with infrastructure metadata.
   * @param {Object} payload - The write payload
   * @param {string} payload.stream - The target stream name
   * @param {string} payload.type - The event type
   * @param {T | T[]} payload.event - Single event or array of events to write
   * @returns {Promise<void>} Promise that resolves when events are successfully written
   * @throws {Error} If the write operation fails
   */
  async write(payload: {
    stream: string;
    type: string;
    event: T | T[];
  }): Promise<void> {
    const { stream, type, event } = payload;
    const events: T[] = Array.isArray(event) ? event : [event];

    const configurationEvents = events.map((evt) => {
      // Extract domain metadata if present, then remove it from data
      const eventData = evt as Record<string, unknown>;
      const domainMetadata =
        (eventData._domainMetadata as Record<string, unknown>) || {};
      const streamMetadata =
        (eventData._streamMetadata as Record<string, unknown>) || {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _domainMetadata, _streamMetadata, ...cleanData } = eventData;

      return jsonEvent({
        type,
        data: cleanData as unknown as JSONType,

        metadata: {
          // ✅ Merge domain metadata with infrastructure metadata
          ...domainMetadata,
          // ✅ Infrastructure metadata from Repository declarations (not assumptions)
          correlationId: randomUUID(),
          causationId: 'optional', // Can be enhanced later for command sourcing
          aggregateType: (streamMetadata.aggregateType as string) || 'unknown', // ✅ From Repository
          context: (streamMetadata.context as string) || 'unknown', // ✅ From Repository
          version: (streamMetadata.version as string) || 'unknown', // ✅ From Repository
          service: this.serviceName,
        },
      });
    });

    try {
      await this.client.appendToStream(stream, configurationEvents);

      const logContext = this.createLogContext(
        'write',
        stream,
        this.serviceName,
      );
      this.logger.log(
        logContext,
        `Successfully wrote events to stream "${payload.stream}".`,
      );
    } catch (error) {
      const logContext = this.createLogContext(
        'write',
        stream,
        this.serviceName,
      );
      const errorContext = this.createErrorContext(logContext, error, {
        payload,
      });
      this.logger.error(
        {
          ...errorContext,
        },
        `Failed to write events to stream "${payload.stream}"`,
      );
      throw error;
    }
  }

  /**
   * Performs catchup reading from a stream to replay historical events.
   * Reads events from a specified starting point and processes them sequentially.
   * @template T The event data type
   * @param {string} stream - The stream name to read from
   * @param {StoreSubscriptionOptions<T>} opts - Options including fromSequence and onEvent handler
   * @returns {Promise<bigint | undefined>} Promise resolving to the last revision processed, or undefined if stream not found
   * @throws {Error} If a non-StreamNotFoundError occurs during reading
   */
  async catchup<T>(
    stream: string,
    opts: StoreSubscriptionOptions<T>,
  ): Promise<bigint | undefined> {
    const { fromSequence, onEvent } = opts;

    let revision: bigint | undefined = undefined;

    try {
      const eventsPage = this.client.readStream(stream, {
        fromRevision: fromSequence ?? START,
        direction: FORWARDS,
        resolveLinkTos: true,
      });

      for await (const resolved of eventsPage) {
        if (!resolved.event) return;
        if (resolved.link?.revision) {
          revision = resolved.link.revision;
        }

        // ✅ DDD PRINCIPLE: Parse entity-level stream format: context.aggregate.version-tenant-entity
        // Example: context.aggregate.v1-tenant123-ENTITY_ID
        const streamParts = resolved.event.streamId.split('-');
        const tenant =
          streamParts.length > 1 ? streamParts[1] : 'unknown-tenant';

        // For entity-level streams, key is the entity identifier (last part of stream)
        // Example: "ENTITY_ID" from "context.aggregate.v1-tenant123-ENTITY_ID"
        const key =
          streamParts.length > 2
            ? streamParts[streamParts.length - 1]
            : 'unknown-key';

        const type = resolved.event.type;
        const date = new Date(resolved.event.created);

        const isLive = false;
        const evt = resolved.event.data as T;
        const sequence = resolved.event.position!.commit; // position.commit is the sequence
        onEvent(evt, {
          stream,
          tenant,
          key,
          type,
          date,
          sequence,
          revision,
          isLive,
        });
      }
      return revision !== undefined ? revision : undefined;
    } catch (err) {
      if (err instanceof StreamNotFoundError) {
        const logContext = this.createLogContext(
          'catchup',
          stream,
          this.serviceName,
        );
        const errorContext = this.createErrorContext(logContext, err);
        this.logger.warn(
          {
            ...errorContext,
          },
          `Store "${stream}" not found during catchup; it may not exist yet.`,
        );
        return undefined;
      } else {
        const logContext = this.createLogContext(
          'catchup',
          stream,
          this.serviceName,
        );
        const errorContext = this.createErrorContext(logContext, err);
        this.logger.error(
          {
            ...errorContext,
            message: `Error reading stream "${stream}": ${err}`,
          },
          `Error reading stream "${stream}": ${err}`,
        );
        throw err; // re-throw the error to stop the loop
      }
    }
  }

  /**
   * Creates a live subscription to a stream that continues to receive new events.
   * Automatically handles reconnection on errors with exponential backoff.
   * @template T The event data type
   * @param {string} stream - The stream name to subscribe to
   * @param {StoreSubscriptionOptions<T>} opts - Subscription options including fromSequence and onEvent handler
   * @returns {Subscription} RxJS subscription that can be used to unsubscribe
   */
  subscribe<T>(
    stream: string,
    opts: StoreSubscriptionOptions<T>,
  ): Subscription {
    const { fromSequence, onEvent } = opts;

    let esdbSubscription: StreamSubscription;
    const startSubscription = () => {
      if (this.isShuttingDown) return;
      // Create a catch‑up subscription
      esdbSubscription = this.client.subscribeToStream(stream, {
        fromRevision: fromSequence ?? START,
        resolveLinkTos: true,
      });

      esdbSubscription.on('data', (resolved: ResolvedEvent) => {
        if (!resolved.event) return;

        // ✅ DDD PRINCIPLE: Parse entity-level stream format: context.aggregate.version-tenant-entity
        // Example: context.aggregate.v1-tenant123-ENTITY_ID
        const streamParts = resolved.event.streamId.split('-');
        const tenant =
          streamParts.length > 1 ? streamParts[1] : 'unknown-tenant';

        // For entity-level streams, key is the entity identifier (last part of stream)
        // Example: "ENTITY_ID" from "context.aggregate.v1-tenant123-ENTITY_ID"
        const key =
          streamParts.length > 2
            ? streamParts[streamParts.length - 1]
            : 'unknown-key';

        const type = resolved.event.type;
        const date = new Date(resolved.event.created);

        const isLive = true;
        const evt = resolved.event.data as T;
        const sequence = resolved.event.position!.commit; // position.commit is the sequence
        const revision = resolved.link?.revision;
        onEvent(evt, {
          stream,
          tenant,
          key,
          type,
          date,
          sequence,
          revision,
          isLive,
        });
      });

      esdbSubscription.on('error', (error) => {
        if (this.isShuttingDown) return;
        const logContext = this.createLogContext(
          'subscriptionError',
          stream,
          this.serviceName,
        );
        const errorContext = this.createErrorContext(logContext, error);
        this.logger.error(
          {
            ...errorContext,
          },
          `Subscription to "${stream}" error:`,
        );
        // clean up before retrying
        esdbSubscription.unsubscribe().catch((unsubError) => {
          const logContext = this.createLogContext(
            'unsubscribe',
            stream,
            this.serviceName,
          );
          const errorContext = this.createErrorContext(logContext, unsubError);
          this.logger.error(
            {
              ...errorContext,
            },
            `Error while unsubscribing:`,
          );
        });

        // back-off
        void this.delay(5_000).then((): void => {
          if (!this.isShuttingDown) startSubscription();
        });
      });
    };
    startSubscription();
    const rxSub = new Subscription(() => {
      void esdbSubscription.unsubscribe().catch((err) => {
        const logContext = this.createLogContext(
          'unsubscribe',
          stream,
          this.serviceName,
        );
        const errorContext = this.createErrorContext(logContext, err);
        this.logger.error(
          {
            ...errorContext,
          },
          `Error while unsubscribing:`,
        );
      });
    });
    this.subscriptions.push(rxSub);
    return rxSub;
  }

  /**
   * Lists events from a stream with optional pagination.
   * @template T The event data type
   * @param {string} stream - The stream name to read from
   * @param {Object} [options] - Optional pagination settings
   * @param {number} [options.limit] - Maximum number of events to return
   * @param {number} [options.fromPosition] - Starting position to read from
   * @returns {Promise<T[]>} Promise resolving to an array of event data
   */
  async list<T>(
    stream: string,
    options?: {
      limit?: number;
      fromPosition?: number;
    },
  ): Promise<T[]> {
    const { limit, fromPosition } = options || {};
    const events: T[] = [];

    const read = this.client.readStream(stream, {
      fromRevision: fromPosition ? BigInt(fromPosition) : START,
      direction: FORWARDS,
      maxCount: limit,
      resolveLinkTos: true,
    });

    for await (const resolved of read) {
      // resolved.event is of type RecordedEvent<T> | undefined
      if (resolved.event) {
        events.push(resolved.event.data as T);
      }
    }

    return events;
  }

  /**
   * Gets the latest (most recent) event from a stream by reading backwards from the end.
   * @template T The event data type
   * @param {string} stream - The stream name to read from
   * @returns {Promise<T | null>} Promise resolving to the latest event data or null if stream is empty
   */
  async getLatestSnapshot<T>(stream: string): Promise<T | null> {
    try {
      const read = this.client.readStream(stream, {
        fromRevision: END,
        direction: BACKWARDS,
        maxCount: 1,
        resolveLinkTos: true,
      });

      for await (const resolved of read) {
        if (resolved.event) {
          return resolved.event.data as T;
        }
      }

      return null; // Stream is empty or doesn't exist
    } catch (error) {
      const logContext = this.createLogContext(
        'getLatestSnapshot',
        stream,
        this.serviceName,
      );
      this.logger.warn(
        {
          ...logContext,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to read latest snapshot from stream: ${stream}`,
      );
      return null;
    }
  }

  /**
   * Attempts to read the most recent event from the "connection" stream.
   * If the stream does not exist, resolves immediately.
   * On any other error, retries after a delay.
   * @returns {Promise<void>} Promise that resolves when connection is established or confirmed
   */
  async getConnection(): Promise<void> {
    const STREAM_NAME = 'connection';
    const RETRY_DELAY_MS = 5000; // 5 seconds
    while (true) {
      try {
        // Read backwards from the end to get the latest event
        const subscription = this.client.readStream<EventType>('connection', {
          fromRevision: END,
          direction: BACKWARDS,
        });

        for await (const { event } of subscription) {
          // We got at least one event → consider "connected"
          const logContext = this.createLogContext(
            'getConnection',
            STREAM_NAME,
            this.serviceName,
          );
          this.logger.log(
            logContext,
            `Connected @ revision ${event?.revision}`,
          );
          return;
        }

        // If we exit the loop without any events (empty stream),
        // treat it as a successful connection
        const logContext = this.createLogContext(
          'getConnection',
          STREAM_NAME,
          this.serviceName,
        );
        this.logger.log(
          logContext,
          `Store "${STREAM_NAME}" is empty; treating as connected.`,
        );
        return;
      } catch (err: unknown) {
        if (err instanceof StreamNotFoundError) {
          // No such stream → first‑time connection; resolve
          const logContext = this.createLogContext(
            'getConnection',
            STREAM_NAME,
            this.serviceName,
          );
          this.logger.log(
            logContext,
            `Store "${STREAM_NAME}" not found; initializing connection.`,
          );
          return;
        }

        // Unexpected error → log and retry
        const logContext = this.createLogContext(
          'getConnection',
          STREAM_NAME,
          this.serviceName,
        );
        const errorContext = this.createErrorContext(logContext, err);
        this.logger.error(
          {
            ...errorContext,
          },
          `Error reading stream "${STREAM_NAME}", retrying in ${RETRY_DELAY_MS}ms`,
        );
        await this.delay(RETRY_DELAY_MS);
        // loop and retry
      }
    }
  }

  /**
   * Simple promise-based delay helper for retry mechanisms.
   * @private
   * @param {number} ms - Number of milliseconds to delay
   * @returns {Promise<void>} Promise that resolves after the specified delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gets the last revision number of a stream by reading the most recent event.
   * @param {string} streamName - The name of the stream to check
   * @returns {Promise<bigint | null>} Promise resolving to the last revision or null if stream is empty/not found
   */
  async getLastRevision(streamName: string): Promise<bigint | null> {
    // Read one event backwards starting from END
    try {
      const readResult = this.client.readStream(streamName, {
        direction: BACKWARDS,
        fromRevision: END,
        maxCount: 1,
      });

      for await (const resolvedEvent of readResult) {
        if (resolvedEvent.event) {
          const logContext = this.createLogContext(
            'getLastRevision',
            streamName,
            this.serviceName,
          );
          this.logger.log(
            logContext,
            `Last revision in '${streamName}' is ${resolvedEvent.event.revision}`,
          );
          return resolvedEvent.event.revision;
        }
      }

      const logContext = this.createLogContext(
        'getLastRevision',
        streamName,
        this.serviceName,
      );
      this.logger.log(
        logContext,
        `Store '${streamName}' not found or is empty.`,
      );
      return null;
    } catch (error) {
      const logContext = this.createLogContext(
        'getLastRevision',
        streamName,
        this.serviceName,
      );
      const errorContext = this.createErrorContext(logContext, error);
      this.logger.error(
        {
          ...errorContext,
        },
        `Error reading last revision from stream '${streamName}': ${error}`,
      );
      return null;
    }
  }

  /**
   * Creates a standard operation log context.
   * @protected
   * @param {string} method - Operation method name
   * @param {string} [component] - Component or service name
   * @param {string} [operationId] - Optional operationId for correlation (if not provided, a UUID is generated)
   * @param {Record<string, unknown>} [logContext] - Additional context to include
   * @returns {Record<string, unknown>} Log context object
   */
  protected createLogContext(
    method: string,
    component?: string,
    operationId?: string,
    logContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      operationId: operationId ?? randomUUID(),
      method,
      // ...(stream && { stream }),
      component: component ?? 'Service',
      ...logContext,
    };
  }

  /**
   * Creates a standard error context for logging.
   * @protected
   * @param {Record<string, unknown>} logContext - Base log context
   * @param {unknown} error - Error that was caught
   * @param {unknown} [props] - Optional operation props (will be sanitized)
   * @returns {Record<string, unknown>} Error context for logging
   */
  protected createErrorContext(
    logContext: Record<string, unknown>,
    error: unknown,
    props?: unknown,
  ): Record<string, unknown> {
    const errorContext: Record<string, unknown> = {
      ...logContext,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
    };
    if (props !== undefined) {
      errorContext.props = props;
    }
    return errorContext;
  }
}
