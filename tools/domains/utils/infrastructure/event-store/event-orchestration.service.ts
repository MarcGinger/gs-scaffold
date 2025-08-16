import { Injectable, Inject } from '@nestjs/common';
import { DomainEvent, serializeDomainEvent } from 'src/shared/domain';
import { ILogger } from 'src/shared/logger';
import { EsdbEventStore } from './esdb-event-store';
import { IEventStoreMeta } from './event-store.model';

@Injectable()
export class EventOrchestrationService {
  constructor(
    @Inject('ILogger') private readonly logger: ILogger,
    private readonly esdb: EsdbEventStore<any>,
  ) {}

  async appendDomainEventsToStream(
    stream: string,
    domainEvents: DomainEvent[],
    streamMetadata?: {
      context: string;
      aggregateType: string;
      version: string;
    },
  ): Promise<void> {
    for (let i = 0; i < domainEvents.length; i++) {
      const event = domainEvents[i];
      const serialized = serializeDomainEvent(event);

      // Create domain data with metadata for the infrastructure layer
      const eventWithMetadata = {
        ...serialized.data,
        _domainMetadata: serialized.metadata, // Pass domain metadata separately
        _streamMetadata: streamMetadata, // Pass stream metadata from Repository
      };

      await this.esdb.appendToStream({
        stream, // ✅ Complete stream name from Repository (e.g., "banking.currency.v1-tenant123-USD")
        type: serialized.type,
        event: eventWithMetadata,
      });
    }
  }

  async readDomainEventsFromStream<T extends DomainEvent>(
    stream: string,
  ): Promise<T[]> {
    const raw = await this.esdb.list<T>(stream);
    return this.deserializeEvents<T>(raw);
  }

  protected deserializeEvents<T>(events: any[]): T[] {
    return events as T[]; // You can delegate to a reusable EventDeserializer if needed
  }

  async setupProjection<T>(
    stream: string,
    handler: (event: T, meta: IEventStoreMeta) => void,
  ): Promise<void> {
    const revision = await this.esdb.catchupStream(stream, {
      onEvent: handler,
    });
    this.esdb.subscribeToStream(stream, {
      fromSequence: revision,
      onEvent: handler,
    });
  }
}
