import { OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { IEventStream, IEventStreamOptionsMeta } from 'src/event-stream';
import { ILogger } from 'src/shared/logger';
import { Repository, ObjectLiteral } from 'typeorm';

export abstract class EsdbOrmProjectorBase<
    TEvent,
    TEntity extends ObjectLiteral,
    TCheckpointEntity extends ObjectLiteral,
  >
  implements OnModuleInit, OnModuleDestroy
{
  protected abstract readonly streamName: string;
  protected subscription: Subscription | undefined;

  constructor(
    @Inject('ILogger') protected readonly logger: ILogger,
    @Inject('MANAGEMENT_EVENTS_STREAM')
    protected readonly eventStream: IEventStream<TEvent>,
    protected readonly entityRepository: Repository<TEntity>,
    protected readonly checkpointRepository: Repository<TCheckpointEntity>,
  ) {}

  async onModuleInit() {
    await this.subscribeToProjectionStream(this.streamName);
  }

  async subscribeToProjectionStream(stream: string) {
    if (this.subscription) {
      this.logger.warn(
        {
          service: this.constructor.name,
          method: 'subscribeToProjectionStream',
          stream,
        },
        `Stream already active: ${stream}`,
      );
      return;
    }
    let lastCheckpoint: bigint | undefined;
    try {
      lastCheckpoint = await this.getStreamCheckpoint(`$ce-${stream}`);
    } catch (error) {
      this.logger.error(
        {
          service: this.constructor.name,
          method: 'getStreamCheckpoint',
          stream,
          error,
        },
        `Error getting checkpoint for stream ${stream}`,
      );
      lastCheckpoint = undefined;
    }
    try {
      this.subscription = this.eventStream.subscribe(`$ce-${stream}`, {
        fromSequence: lastCheckpoint ? lastCheckpoint + 1n : undefined,
        onEvent: (data, meta) => {
          void this.handleEvent(data, meta);
        },
      });
    } catch (error) {
      this.logger.error(
        {
          service: this.constructor.name,
          method: 'subscribeToProjectionStream',
          stream,
          error,
        },
        `Error subscribing to stream ${stream}`,
      );
    }
  }

  protected abstract isEventType(data: unknown): data is TEvent;
  protected abstract upsertEntity(event: TEvent, tenant: string): Promise<void>;

  protected async handleEvent(data: unknown, meta: IEventStreamOptionsMeta) {
    const { stream: metaStream, revision, tenant } = meta;
    if (!this.isEventType(data)) {
      this.logger.warn(
        { service: this.constructor.name, method: 'handleEvent' },
        'Event data missing required properties',
      );
      return;
    }
    try {
      await this.upsertEntity(data, tenant);
    } catch (error) {
      this.logger.error(
        { service: this.constructor.name, method: 'upsertEntity', error },
        'Error upserting entity',
      );
    }
    if (typeof metaStream === 'string' && revision != null) {
      try {
        await this.setStreamCheckpoint(metaStream, revision);
      } catch (error) {
        this.logger.error(
          {
            service: this.constructor.name,
            method: 'setStreamCheckpoint',
            error,
          },
          'Error setting stream checkpoint',
        );
      }
    }
  }

  protected abstract getStreamCheckpoint(
    stream: string,
  ): Promise<bigint | undefined>;
  protected abstract setStreamCheckpoint(
    stream: string,
    revision: bigint,
  ): Promise<void>;

  onModuleDestroy() {
    if (
      this.subscription &&
      typeof this.subscription.unsubscribe === 'function'
    ) {
      this.subscription.unsubscribe();
    }
    this.subscription = undefined;
    this.logger.log(
      { service: this.constructor.name, method: 'onModuleDestroy' },
      'Subscription cleared on destroy',
    );
  }
}
