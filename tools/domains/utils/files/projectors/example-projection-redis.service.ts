import { Injectable } from '@nestjs/common';
import { ILogger } from 'src/shared/logger';
import { IEventStream } from 'src/event-stream';
import { RedisUtilityService } from 'src/redis';
import { IProjection } from 'src/domain/entities/projection.model';
import { EsdbRedisProjectorBase } from './esdb-redis-projector.base';

@Injectable()
export class ExampleProjectionRedisService extends EsdbRedisProjectorBase<IProjection> {
  protected readonly streamName = 'core.projection.v1';

  constructor(
    logger: ILogger,
    eventStream: IEventStream<IProjection>,
    redisUtilityService: RedisUtilityService,
  ) {
    super(logger, eventStream, redisUtilityService);
  }

  protected isEventType(data: unknown): data is IProjection {
    return (
      typeof data === 'object' &&
      data !== null &&
      'theKey' in data &&
      'name' in data
    );
  }

  protected async upsertRedisState(
    event: IProjection,
    tenant: string,
  ): Promise<void> {
    await this.redisUtilityService.write(
      this.buildProjectorUser(tenant),
      'projection',
      event.theKey,
      { name: event.name },
    );
  }

  protected async getStreamCheckpoint(
    stream: string,
  ): Promise<bigint | undefined> {
    // Checkpoint is per category, not per tenant. Use a fixed user (e.g., tenant: 'core')
    const value = await this.redisUtilityService.getOne<{ revision: string }>(
      this.buildProjectorUser('core'),
      'projection:checkpoints',
      stream,
    );
    if (value && value.revision) {
      try {
        return BigInt(value.revision);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  protected async setStreamCheckpoint(
    stream: string,
    revision: bigint,
  ): Promise<void> {
    await this.redisUtilityService.write(
      this.buildProjectorUser('core'),
      'projection:checkpoints',
      stream,
      { revision: revision.toString() },
    );
  }
}
