import { Global, Module } from '@nestjs/common';
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'IORedis',
      useFactory: () => {
        const redis = new Redis(
          process.env.REDIS_URL || 'redis://localhost:6379',
          {
            // BullMQ requires maxRetriesPerRequest to be null for blocking operations
            maxRetriesPerRequest: null,
          },
        );
        return redis;
      },
    },
    {
      provide: 'NotificationQueue',
      inject: ['IORedis'],
      useFactory: (connection: Redis) =>
        new Queue('notification', {
          connection,
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        }),
    },
    {
      provide: 'ProjectionQueue',
      inject: ['IORedis'],
      useFactory: (connection: Redis) =>
        new Queue('projection', {
          connection,
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        }),
    },
    {
      provide: 'QueueEvents',
      inject: ['IORedis'],
      useFactory: (connection: Redis) =>
        new QueueEvents('notification', { connection }),
    },
  ],
  exports: ['IORedis', 'NotificationQueue', 'ProjectionQueue', 'QueueEvents'],
})
export class BullMQModule {}
