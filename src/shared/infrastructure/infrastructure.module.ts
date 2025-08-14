import { Module, Global } from '@nestjs/common';
import { EventStoreModule } from './eventstore/eventstore.module';
import { EventStoreService } from './eventstore/eventstore.service';

import { BullMQModule } from './queue/bullmq.module';
import { SnapshotRepository } from './eventstore/snapshot.repository';
import { AggregateRepository } from './eventstore/aggregate.repository';

import { RedisCheckpointStore } from './projections/checkpoint.store';
import { CatchUpRunner } from './projections/catchup.runner';
import { PersistentRunner } from './projections/persistent.runner';

import { RedisOutboxRepository } from './outbox/redis-outbox.repository';
import { OutboxPublisher } from '../application/outbox/outbox.publisher';

import Redis from 'ioredis';
import { EventStoreDBClient } from '@eventstore/db-client';
import type { Logger } from 'pino';
import { APP_LOGGER } from '../logging';

// ===== INTERFACE TOKENS FOR DEPENDENCY INJECTION =====
export const CHECKPOINT_STORE = 'CHECKPOINT_STORE';
export const OUTBOX_REPOSITORY = 'OUTBOX_REPOSITORY';
export const EVENTSTORE_CLIENT = 'EVENTSTORE_CLIENT';

@Global()
@Module({
  imports: [
    EventStoreModule, // Must export EventStoreService and EventStoreDBClient
    BullMQModule, // Must export 'BullMQ_Redis_Client' and queue tokens
  ],
  providers: [
    // ----- EventStore Client Provider -----
    // Extract EventStoreDBClient from EventStoreService for explicit injection
    {
      provide: EVENTSTORE_CLIENT,
      inject: [EventStoreService],
      useFactory: (eventStoreService: EventStoreService) => {
        // Access the private client property via service method
        return eventStoreService.getClient();
      },
    },

    // ----- EventStore Infrastructure -----
    // SnapshotRepository needs EventStoreDBClient + Redis (hot cache)
    {
      provide: SnapshotRepository,
      inject: [EVENTSTORE_CLIENT, 'IORedis', APP_LOGGER],
      useFactory: (
        esdbClient: EventStoreDBClient,
        redis: Redis,
        logger: Logger,
      ) => {
        return new SnapshotRepository<any>(esdbClient, logger, redis);
      },
    },

    // AggregateRepository depends on EventStoreService + SnapshotRepository
    AggregateRepository,

    // ----- Projections Infrastructure -----
    // RedisCheckpointStore with environment-aware prefix
    {
      provide: RedisCheckpointStore,
      inject: ['IORedis', APP_LOGGER],
      useFactory: (redis: Redis, logger: Logger) => {
        const envPrefix = process.env.NODE_ENV
          ? `${process.env.NODE_ENV}:`
          : '';
        return new RedisCheckpointStore(redis, logger, envPrefix);
      },
    },
    { provide: CHECKPOINT_STORE, useExisting: RedisCheckpointStore },

    // Projection runners with structured logging
    CatchUpRunner,
    PersistentRunner,

    // ----- Outbox Infrastructure -----
    // RedisOutboxRepository with explicit Redis injection
    {
      provide: RedisOutboxRepository,
      inject: ['IORedis', APP_LOGGER],
      useFactory: (redis: Redis, logger: Logger) => {
        return new RedisOutboxRepository(redis, logger);
      },
    },
    { provide: OUTBOX_REPOSITORY, useExisting: RedisOutboxRepository },

    // OutboxPublisher depends on outbox repo + queue(s)
    OutboxPublisher,
  ],
  exports: [
    // Core services
    EventStoreService,
    EVENTSTORE_CLIENT,

    // EventStore infrastructure
    SnapshotRepository,
    AggregateRepository,

    // Projections infrastructure
    RedisCheckpointStore,
    CHECKPOINT_STORE,
    CatchUpRunner,
    PersistentRunner,

    // Outbox infrastructure
    RedisOutboxRepository,
    OUTBOX_REPOSITORY,
    OutboxPublisher,
  ],
})
export class InfrastructureModule {}
