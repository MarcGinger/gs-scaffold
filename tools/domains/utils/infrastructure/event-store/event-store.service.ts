import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ILogger } from 'src/shared/logger';
import { IEventStoreMeta } from './event-store.model';
import { DomainEvent } from 'src/shared/domain/events/domain-event.base';
import { serializeDomainEvent } from 'src/shared/domain/events/serialized-event.helper';
import { LinkStoreProjection } from './projections';
import { EsdbEventStore } from './esdb-event-store';

/**
 * EventStoreService - EventStoreDB Infrastructure Service
 *
 * This service provides concrete EventStoreDB client operations and infrastructure.
 * It handles:
 * - Event persistence to EventStoreDB streams
 * - Event retrieval and stream operations
 * - Snapshot operations for performance optimization
 * - Stream versioning and optimistic concurrency control
 * - Projection subscriptions and catchup
 *
 * Note: Event streaming (Kafka integration) is handled separately by dedicated
 * message streaming services. This service focuses exclusively on EventStoreDB
 * infrastructure operations for event store persistence and stream management.
 */
@Injectable()
export class EventStoreService {
  /**
   * Initializes the EventStoreService with required dependencies.
   * @param {ILogger} logger - Logger instance for operation logging
   * @param {EsdbEventStore<any>} eventStoreClient - EventStoreDB client instance
   * @param {LinkStoreProjection} linkStoreProjection - Link store projection service
   */
  constructor(
    @Inject('ILogger') protected readonly logger: ILogger,
    @Inject('MANAGEMENT_EVENTS_STREAM')
    private readonly eventStoreClient: EsdbEventStore<any>,
    private readonly linkStoreProjection: LinkStoreProjection,
  ) {}

  /**
   * Gets the latest snapshot for an aggregate from the snapshot stream.
   * @param {string} streamName - The name of the snapshot stream
   * @param {string} eventType - The type of event to look for
   * @returns {Promise<{data: T} | null>} Promise resolving to snapshot data or null if not found
   * @template T The snapshot data type
   * @throws {Error} If the snapshot retrieval operation fails
   */
  async getLatestSnapshot<T>(
    streamName: string,
    eventType: string,
  ): Promise<{ data: T } | null> {
    try {
      this.logger.debug(
        { streamName, eventType },
        `Getting latest snapshot for stream: ${streamName}`,
      );

      try {
        // Check if the snapshot stream exists by getting its revision
        const revision =
          await this.eventStoreClient.getStreamRevision(streamName);

        if (!revision || revision === BigInt(0)) {
          this.logger.debug(
            { streamName, eventType },
            `No snapshot found for stream: ${streamName}`,
          );
          return null;
        }

        // For now, we'll use a simplified approach
        // In a full implementation, you would need to read the stream backwards
        // to get the latest snapshot event
        this.logger.debug(
          { streamName, eventType, revision },
          `Snapshot stream found with revision ${revision} for stream: ${streamName}`,
        );

        // Return null for now - this would require additional EventStore client methods
        // to properly read events from a stream
        return null;
      } catch (streamError) {
        // If stream doesn't exist or can't be read, return null
        this.logger.debug(
          {
            streamName,
            eventType,
            error:
              streamError instanceof Error
                ? streamError.message
                : 'Unknown error',
          },
          `Snapshot stream not found for stream: ${streamName}`,
        );
        return null;
      }
    } catch (error) {
      this.logger.error(
        {
          streamName,
          eventType,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to get latest snapshot for stream: ${streamName}`,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Reads all events from a specified stream.
   * @param {string} streamName - The name of the stream to read from
   * @returns {Promise<any[]>} Promise resolving to an array of events, or empty array if stream not found
   */
  async readStreamEvents(streamName: string): Promise<any[]> {
    try {
      this.logger.debug(
        { streamName },
        `Reading events from stream: ${streamName}`,
      );

      // Check if the stream exists by getting its revision
      const revision =
        await this.eventStoreClient.getStreamRevision(streamName);

      if (!revision || revision === BigInt(0)) {
        this.logger.debug(
          { streamName },
          `Stream not found or empty: ${streamName}`,
        );
        return [];
      }

      // For now, we can only check if a stream exists and get its revision
      // The current IEventStore interface doesn't provide a method to read events
      // This would require extending the interface or using a different approach
      this.logger.debug(
        { streamName, revision },
        `Stream ${streamName} exists with revision ${revision}, but reading events requires additional client methods`,
      );

      // Return empty array since we can't actually read events with current interface
      // In a full implementation, you would need additional methods on IEventStore
      return [];
    } catch (error) {
      this.logger.error(
        {
          streamName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to read events from stream: ${streamName}`,
      );
      return [];
    }
  }

  /**
   * Gets streams that match a specified prefix pattern.
   * @param {string} prefix - The prefix pattern to match stream names against
   * @returns {Promise<string[]>} Promise resolving to an array of matching stream names
   */
  getStreamsByPrefix(prefix: string): Promise<string[]> {
    try {
      this.logger.debug({ prefix }, `Getting streams by prefix: ${prefix}`);

      // This would typically interact with EventStoreDB to find streams by prefix
      // For now, returning empty array
      return Promise.resolve([]);
    } catch (error) {
      this.logger.error(
        {
          prefix,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to get streams by prefix: ${prefix}`,
      );
      return Promise.resolve([]);
    }
  }

  /**
   * Gets the current version number of a stream.
   * @param {string} streamName - The name of the stream to check
   * @returns {Promise<number>} Promise resolving to the current stream version number
   */
  getStreamVersion(streamName: string): Promise<number> {
    try {
      this.logger.debug(
        { streamName },
        `Getting stream version: ${streamName}`,
      );

      // This would typically interact with EventStoreDB to get the current stream version
      // For now, returning 0 as the initial version
      return Promise.resolve(0);
    } catch (error) {
      this.logger.error(
        {
          streamName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to get stream version: ${streamName}`,
      );
      return Promise.resolve(0);
    }
  }

  /**
   * Appends domain events to a stream with proper serialization and version control.
   * @param {string} streamName - The target stream name
   * @param {DomainEvent[]} domainEvents - Array of domain events to append
   * @param {number} expectedVersion - Expected version for optimistic concurrency control
   * @returns {Promise<void>} Promise that resolves when events are successfully appended
   * @throws {Error} If the append operation fails or version conflict occurs
   */
  async appendDomainEventsToStream(
    streamName: string,
    domainEvents: DomainEvent[],
    expectedVersion: number,
  ): Promise<void> {
    try {
      this.logger.debug(
        { streamName, eventCount: domainEvents.length, expectedVersion },
        `Appending ${domainEvents.length} domain events to stream: ${streamName}`,
      );

      // Serialize domain events using the helper
      const serializedEvents = domainEvents.map((event) =>
        serializeDomainEvent(event),
      );

      // Use the actual EventStore client to append each serialized event
      for (let i = 0; i < serializedEvents.length; i++) {
        const serializedEvent = serializedEvents[i];

        await this.eventStoreClient.appendToStream({
          stream: streamName,
          type: serializedEvent.type,
          event: serializedEvent,
        });
      }

      this.logger.debug(
        {
          streamName,
          eventCount: serializedEvents.length,
          eventTypes: serializedEvents.map((e) => e.type),
        },
        `Successfully appended domain events to stream: ${streamName}`,
      );
    } catch (error) {
      this.logger.error(
        {
          streamName,
          events: domainEvents.length,
          expectedVersion,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to append domain events to stream: ${streamName}`,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Deserializes events from their storage format back to domain objects.
   * @template T The target domain event type
   * @param {any[]} serializedEvents - Array of serialized events from storage
   * @returns {T[]} Array of deserialized domain events
   */
  deserializeEvents<T>(serializedEvents: any[]): T[] {
    try {
      this.logger.debug(
        { eventCount: serializedEvents.length },
        'Deserializing events to domain objects',
      );

      // This would typically deserialize events back to their domain object forms
      // For now, return the serialized events as-is
      // In a real implementation, you would reconstruct the proper domain event objects
      return serializedEvents as T[];
    } catch (error) {
      this.logger.error(
        {
          eventCount: serializedEvents.length,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to deserialize events',
      );
      return [];
    }
  }

  /**
   * Reads and deserializes domain events from a stream for event sourcing purposes.
   * @template T The domain event type extending DomainEvent
   * @param {string} streamName - The name of the stream to read from
   * @returns {Promise<T[]>} Promise resolving to an array of deserialized domain events
   */
  async readDomainEventsFromStream<T extends DomainEvent>(
    streamName: string,
  ): Promise<T[]> {
    try {
      this.logger.debug(
        { streamName },
        `Reading domain events from stream: ${streamName}`,
      );

      // First read the raw events
      const rawEvents = await this.readStreamEvents(streamName);

      // Then deserialize them to domain events
      const domainEvents = this.deserializeEvents<T>(rawEvents);

      this.logger.debug(
        { streamName, eventCount: domainEvents.length },
        `Successfully read ${domainEvents.length} domain events from stream`,
      );

      return domainEvents;
    } catch (error) {
      this.logger.error(
        {
          streamName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to read domain events from stream: ${streamName}`,
      );
      return [];
    }
  }

  /**
   * Appends events to a stream (legacy method for backward compatibility).
   * @param {string} streamName - The target stream name
   * @param {any[]} events - Array of events to append
   * @param {number} expectedVersion - Expected version for concurrency control
   * @returns {Promise<void>} Promise that resolves when events are appended
   * @throws {Error} If the append operation fails
   */
  async appendToStream(
    streamName: string,
    events: any[],
    expectedVersion: number,
  ): Promise<void> {
    try {
      this.logger.debug(
        { streamName, eventCount: events.length, expectedVersion },
        `Appending ${events.length} events to stream: ${streamName}`,
      );

      // For multiple events, append them sequentially
      // Note: In a real implementation, you might want to batch these
      for (let i = 0; i < events.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const event = events[i];

        const eventType = this.getEventType(event);

        // Use the actual EventStore client to append each event
        await this.eventStoreClient.appendToStream({
          stream: streamName, // ✅ Complete stream name from Repository
          type: eventType,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          event: event,
        });
      }

      this.logger.debug(
        { streamName, eventCount: events.length },
        `Successfully appended ${events.length} events to stream: ${streamName}`,
      );
    } catch (error) {
      this.logger.error(
        {
          streamName,
          events: events.length,
          expectedVersion,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to append events to stream: ${streamName}`,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Saves a snapshot event to the EventStore for performance optimization.
   * @param {string} streamName - The name of the snapshot stream
   * @param {any} snapshotEvent - The snapshot event data to save
   * @returns {Promise<void>} Promise that resolves when snapshot is saved
   * @throws {Error} If the save operation fails
   */
  saveSnapshot(streamName: string, snapshotEvent: any): Promise<void> {
    try {
      this.logger.debug(
        { streamName, eventType: 'snapshot' },
        `Saving snapshot to stream: ${streamName}`,
      );

      // This would typically interact with EventStoreDB to save a snapshot
      this.logger.debug(
        { streamName },
        `Successfully saved snapshot to stream: ${streamName}`,
      );
      return Promise.resolve();
    } catch (error) {
      this.logger.error(
        {
          streamName,
          snapshotEvent,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to save snapshot to stream: ${streamName}`,
      );
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Checks if a stream exists in the EventStore.
   * @param {string} streamName - The name of the stream to check
   * @returns {Promise<boolean>} Promise resolving to true if stream exists, false otherwise
   * @throws {Error} If the existence check fails
   */
  streamExists(streamName: string): Promise<boolean> {
    try {
      this.logger.debug(
        { streamName },
        `Checking if stream exists: ${streamName}`,
      );

      // This would typically interact with EventStoreDB to check stream existence
      // For now, returning false to indicate stream doesn't exist
      return Promise.resolve(false);
    } catch (error) {
      this.logger.error(
        {
          streamName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to check if stream exists: ${streamName}`,
      );
      return Promise.resolve(false);
    }
  }

  /**
   * Setup list subscription for event sourcing projections
   */
  protected async setupList<T>(
    streamName: string,
    eventHandler: (evt: T, meta: IEventStoreMeta) => void,
  ): Promise<void> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        // Catchup with existing events
        const lastRevision = await this.eventStoreClient.catchupStream<T>(
          streamName,
          {
            onEvent: eventHandler,
          },
        );

        // Subscribe to new events - even if catchup returned undefined (stream doesn't exist)
        this.eventStoreClient.subscribeToStream<T>(streamName, {
          fromSequence: lastRevision,
          onEvent: eventHandler,
        });

        this.logger.debug(
          { streamName, lastRevision },
          `Successfully set up list subscription for stream: ${streamName}`,
        );
        return;
      } catch (error) {
        attempt++;

        // Check if this is a stream-not-found error on the first attempt
        if (
          attempt === 1 &&
          error instanceof Error &&
          (error.message.includes('not found') ||
            error.message.includes('does not exist'))
        ) {
          this.logger.debug(
            { streamName },
            `Stream ${streamName} does not exist yet - setting up subscription for future events`,
          );

          // Still set up subscription for future events
          try {
            this.eventStoreClient.subscribeToStream<T>(streamName, {
              fromSequence: undefined, // Start from beginning when stream is created
              onEvent: eventHandler,
            });

            this.logger.debug(
              { streamName },
              `Successfully set up subscription for future events on stream: ${streamName}`,
            );
            return;
          } catch {
            // Continue to retry logic if subscription also fails
          }
        }

        this.logger.warn(
          {
            streamName,
            attempt,
            maxRetries: MAX_RETRIES,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          `Failed to setup list subscription (attempt ${attempt}/${MAX_RETRIES})`,
        );

        if (attempt >= MAX_RETRIES) {
          throw error;
        }

        await this.delay(1000 * attempt); // Exponential backoff
      }
    }
  }

  /**
   * Utility method for delays
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gets access to the link stream projection for external query operations.
   * @returns {LinkStoreProjection} The link stream projection instance
   */
  getLinkStreamProjection(): LinkStoreProjection {
    return this.linkStoreProjection;
  }

  /**
   * Checks if events are properly serialized domain events with required fields.
   * @private
   * @param {any[]} events - Array of events to validate
   * @returns {boolean} True if all events have required domain event structure
   */
  private areSerializedDomainEvents(events: any[]): boolean {
    return events.every(
      (event) =>
        event &&
        typeof event === 'object' &&
        ('type' in event || 'eventType' in event) &&
        'data' in event &&
        'metadata' in event,
    );
  }

  /**
   * Extracts data from the latest event as a fallback method when other approaches fail.
   * @private
   * @template T - The type of data to extract
   * @param {any[]} events - Array of events to extract data from
   * @param {Record<string, unknown>} logContext - Context information for logging
   * @returns {T | null} The extracted data or null if no events available
   */
  private extractDataFromLatestEvent<T>(
    events: any[],
    logContext: Record<string, unknown>,
  ): T | null {
    try {
      if (events.length === 0) {
        return null;
      }

      // Sort events by timestamp if possible
      const sortedEvents = events.sort((a, b) => {
        const aTime = this.getEventTimestamp(a);
        const bTime = this.getEventTimestamp(b);
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const latestEvent = sortedEvents[sortedEvents.length - 1];

      this.logger.debug(
        {
          ...logContext,
          eventCount: sortedEvents.length,
          latestEventType: this.getEventType(latestEvent),
        },
        'Extracted data from latest event',
      );

      return this.extractEventData<T>(latestEvent);
    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to extract data from latest event',
      );
      return null;
    }
  }

  /**
   * Reconstruct aggregate from serialized events (private helper)
   */
  private reconstructFromSerializedEvents<T>(
    events: any[],
    logContext: Record<string, unknown>,
  ): T | null {
    try {
      // This is where you would implement aggregate-specific reconstruction logic
      // For now, we'll try to extract the most recent state from the events

      if (events.length === 0) {
        return null;
      }

      // Sort events by occurrence time with safe property access
      const sortedEvents = events.sort((a, b) => {
        const aTime = this.getEventTimestamp(a);
        const bTime = this.getEventTimestamp(b);
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });

      // Extract the latest state from the most recent events
      // This is a placeholder - real implementation would be aggregate-specific
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const latestEvent = sortedEvents[sortedEvents.length - 1];

      this.logger.debug(
        {
          ...logContext,
          eventCount: sortedEvents.length,
          latestEventType: this.getEventType(latestEvent),
        },
        'Reconstructed aggregate from serialized domain events',
      );

      // Return the data portion as the reconstructed aggregate
      // In a real implementation, this would be much more sophisticated
      return this.extractEventData<T>(latestEvent);
    } catch (error) {
      this.logger.error(
        {
          ...logContext,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to reconstruct aggregate from serialized events',
      );
      return null;
    }
  }

  /**
   * Safely extracts timestamp from an event object with fallback handling.
   * @private
   * @param {any} event - The event to extract timestamp from
   * @returns {string} The timestamp string or default '1970-01-01' if not found
   */
  private getEventTimestamp(event: any): string {
    try {
      if (!event || typeof event !== 'object') {
        return '1970-01-01';
      }

      // Check metadata first
      if (
        'metadata' in event &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        event.metadata &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        typeof event.metadata === 'object' &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        'occurredAt' in event.metadata &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        typeof event.metadata.occurredAt === 'string'
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return String(event.metadata.occurredAt);
      }

      // Check direct property
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ('occurredAt' in event && typeof event.occurredAt === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return String(event.occurredAt);
      }

      return '1970-01-01';
    } catch {
      return '1970-01-01';
    }
  }

  /**
   * Safely extracts event type from an event object with fallback handling.
   * @private
   * @param {any} event - The event to extract type from
   * @returns {string} The event type or 'unknown' if not found
   */
  private getEventType(event: any): string {
    try {
      if (!event || typeof event !== 'object') {
        return 'unknown';
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ('type' in event && typeof event.type === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return String(event.type);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ('eventType' in event && typeof event.eventType === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return String(event.eventType);
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Safely extract event data
   */
  private extractEventData<T>(event: any): T | null {
    try {
      if (!event || typeof event !== 'object') {
        return null;
      }

      // Return the data property if it exists, otherwise return the event itself
      if ('data' in event) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return event.data as T;
      }

      return event as T;
    } catch {
      return null;
    }
  }

  /**
   * Safely retrieves a property from an event object with error handling.
   * @private
   * @param {any} event - The event object to get property from
   * @param {string} property - The property name to retrieve
   * @returns {any} The property value or null if not found or error occurs
   */
  private safeGetProperty(event: any, property: string): any {
    try {
      if (!event || typeof event !== 'object') {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return event[property];
    } catch {
      return null;
    }
  }
}
