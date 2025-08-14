import { Module, Global } from '@nestjs/common';
import { EventStoreModule } from './eventstore/eventstore.module';
import { BullMQModule } from './queue/bullmq.module';
import { EventStoreService } from './eventstore/eventstore.service';
import { SnapshotRepository } from './eventstore/snapshot.repository';
import { AggregateRepository } from './eventstore/aggregate.repository';
import { RedisCheckpointStore } from './projections/checkpoint.store';
import { CatchUpRunner } from './projections/catchup.runner';
import { PersistentRunner } from './projections/persistent.runner';
import { RedisOutboxRepository } from './outbox/redis-outbox.repository';
import { OutboxPublisher } from '../application/outbox/outbox.publisher';

@Global()
@Module({
  imports: [EventStoreModule, BullMQModule],
  providers: [
    // EventStore infrastructure
    SnapshotRepository,
    AggregateRepository,

    // Projection infrastructure
    RedisCheckpointStore,
    CatchUpRunner,
    PersistentRunner,

    // Outbox infrastructure
    RedisOutboxRepository,
    OutboxPublisher,

    // Checkpoint store provider
    {
      provide: 'CheckpointStore',
      useExisting: RedisCheckpointStore,
    },
  ],
  exports: [
    EventStoreService,
    SnapshotRepository,
    AggregateRepository,
    RedisCheckpointStore,
    CatchUpRunner,
    PersistentRunner,
    RedisOutboxRepository,
    OutboxPublisher,
    'CheckpointStore',
  ],
})
export class InfrastructureModule {}
