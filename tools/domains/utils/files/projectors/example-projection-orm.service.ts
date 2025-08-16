import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ILogger } from 'src/shared/logger';
import { IEventStream } from 'src/event-stream';
import { ProjectionEntity, ProjectionCheckpointEntity } from 'src/entities';

import { IProjection } from 'src/domain/entities/projection.model';
import { EsdbOrmProjectorBase } from './esdb-orm-projector.base';

@Injectable()
export class ExampleProjectionOrmService extends EsdbOrmProjectorBase<
  IProjection,
  ProjectionEntity,
  ProjectionCheckpointEntity
> {
  protected readonly streamName = 'core.projection.v1';

  constructor(
    @InjectRepository(ProjectionEntity)
    entityRepository: Repository<ProjectionEntity>,
    @InjectRepository(ProjectionCheckpointEntity)
    checkpointRepository: Repository<ProjectionCheckpointEntity>,
    logger: ILogger,
    eventStream: IEventStream<IProjection>,
  ) {
    super(logger, eventStream, entityRepository, checkpointRepository);
  }

  protected isEventType(data: unknown): data is IProjection {
    return (
      typeof data === 'object' &&
      data !== null &&
      'theKey' in data &&
      'name' in data
    );
  }

  protected async upsertEntity(
    event: IProjection,
    tenant: string,
  ): Promise<void> {
    let entity = await this.entityRepository.findOne({
      where: { theKey: event.theKey, tenant },
    });
    if (!entity) {
      entity = this.entityRepository.create({
        theKey: event.theKey,
        name: event.name,
        tenant,
      });
    } else {
      entity.name = event.name;
      entity.tenant = tenant;
    }
    await this.entityRepository.save(entity);
  }

  protected async getStreamCheckpoint(
    stream: string,
  ): Promise<bigint | undefined> {
    const checkpoint = await this.checkpointRepository.findOne({
      where: { id: stream },
    });
    if (checkpoint && checkpoint.revision) {
      try {
        return BigInt(checkpoint.revision);
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
    let checkpoint = await this.checkpointRepository.findOne({
      where: { id: stream },
    });
    if (!checkpoint) {
      checkpoint = this.checkpointRepository.create({
        id: stream,
        revision: revision.toString(),
      });
    } else {
      checkpoint.revision = revision.toString();
    }
    await this.checkpointRepository.save(checkpoint);
  }
}
