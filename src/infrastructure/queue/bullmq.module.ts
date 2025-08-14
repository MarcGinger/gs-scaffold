import {
  Global,
  Module,
  DynamicModule,
  OnApplicationShutdown,
  Inject,
  Logger,
} from '@nestjs/common';
import {
  Queue,
  QueueEvents,
  QueueOptions,
  Worker,
  WorkerOptions,
} from 'bullmq';
import Redis, { RedisOptions } from 'ioredis';

/**
 * Configuration for individual queue
 */
export interface BullQueueConfig {
  name: string;
  defaultJobOptions?: QueueOptions['defaultJobOptions'];
  workerOptions?: Omit<WorkerOptions, 'connection'>;
}

/**
 * Worker processor configuration
 */
export interface BullWorkerConfig {
  queueName: string;
  processor: string | ((job: any) => Promise<any>);
  options?: Omit<WorkerOptions, 'connection'>;
}

/**
 * BullMQ module configuration options
 */
export interface BullModuleOptions {
  /** Redis connection URL (supports redis:// and rediss:// for TLS) */
  redisUrl?: string;
  /** Alternative explicit Redis options */
  redis?: RedisOptions;
  /** Redis key prefix for environment isolation (e.g., 'app:prod:') */
  keyPrefix?: string;
  /** Queue configurations */
  queues: BullQueueConfig[];
  /** Worker configurations (optional) */
  workers?: BullWorkerConfig[];
  /** Enable metrics collection and logging */
  enableMetrics?: boolean;
}

/**
 * Production-ready BullMQ module with:
 * - Dedicated connections per role (client, subscriber, blocking)
 * - QueueEvents for each queue with separate connections
 * - Graceful shutdown handling
 * - Environment-aware key namespacing
 * - Dynamic module registration
 * - Optional worker management
 * - TLS support (rediss://)
 * - Metrics collection
 */
@Global()
@Module({})
export class BullMQModule implements OnApplicationShutdown {
  private readonly logger = new Logger(BullMQModule.name);
  private static createdQueues: Queue[] = [];
  private static createdQueueEvents: QueueEvents[] = [];
  private static createdWorkers: Worker[] = [];
  private static providedRedisClients: Redis[] = [];

  constructor(
    @Inject('BULLMQ_MODULE_OPTIONS') private readonly opts: BullModuleOptions,
  ) {}

  /**
   * Register BullMQ module with dynamic configuration
   */
  static register(options: BullModuleOptions): DynamicModule {
    const providers = [
      {
        provide: 'BULLMQ_MODULE_OPTIONS',
        useValue: options,
      },
      // Base Redis client factory (for client role operations)
      {
        provide: 'BullMQ_Redis_Client',
        useFactory: () => {
          const connectionOptions =
            BullMQModule.createConnectionOptions(options);
          const client = new Redis(connectionOptions);
          BullMQModule.providedRedisClients.push(client);
          return client;
        },
      },
      // Connection options provider for BullMQ internal connection management
      {
        provide: 'BullMQ_Connection_Options',
        useFactory: () => BullMQModule.createConnectionOptions(options),
      },
      // Queue providers (one per configured queue)
      ...options.queues.map((queueConfig) => ({
        provide: `Queue:${queueConfig.name}`,
        inject: ['BullMQ_Connection_Options', 'BULLMQ_MODULE_OPTIONS'],
        useFactory: (
          connectionOptions: RedisOptions,
          moduleOpts: BullModuleOptions,
        ) => {
          // Use connection options so BullMQ manages role-specific connections internally
          const queue = new Queue(queueConfig.name, {
            connection: connectionOptions,
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 50,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              ...queueConfig.defaultJobOptions,
            },
          });

          BullMQModule.createdQueues.push(queue);

          // Set up metrics if enabled
          if (moduleOpts.enableMetrics) {
            BullMQModule.setupQueueMetrics(queue, queueConfig.name);
          }

          return queue;
        },
      })),
      // QueueEvents providers (one per queue with dedicated connections)
      ...options.queues.map((queueConfig) => ({
        provide: `QueueEvents:${queueConfig.name}`,
        inject: ['BULLMQ_MODULE_OPTIONS'],
        useFactory: (moduleOpts: BullModuleOptions) => {
          // Create dedicated Redis connection for QueueEvents
          const connectionOptions =
            BullMQModule.createConnectionOptions(moduleOpts);
          const eventsConnection = new Redis(connectionOptions);
          BullMQModule.providedRedisClients.push(eventsConnection);

          const queueEvents = new QueueEvents(queueConfig.name, {
            connection: eventsConnection,
            autorun: true,
          });

          BullMQModule.createdQueueEvents.push(queueEvents);

          // Set up event metrics if enabled
          if (moduleOpts.enableMetrics) {
            BullMQModule.setupQueueEventsMetrics(queueEvents, queueConfig.name);
          }

          return queueEvents;
        },
      })),
      // Worker providers (if configured)
      ...(options.workers || []).map((workerConfig) => ({
        provide: `Worker:${workerConfig.queueName}`,
        inject: ['BullMQ_Connection_Options'],
        useFactory: (connectionOptions: RedisOptions) => {
          const worker = new Worker(
            workerConfig.queueName,
            workerConfig.processor,
            {
              connection: connectionOptions,
              ...workerConfig.options,
            },
          );

          BullMQModule.createdWorkers.push(worker);
          return worker;
        },
      })),
    ];

    const exportsArray = [
      'BullMQ_Redis_Client',
      'BullMQ_Connection_Options',
      ...options.queues.map((q) => `Queue:${q.name}`),
      ...options.queues.map((q) => `QueueEvents:${q.name}`),
      ...(options.workers || []).map((w) => `Worker:${w.queueName}`),
      'BULLMQ_MODULE_OPTIONS',
    ];

    return {
      module: BullMQModule,
      providers,
      exports: exportsArray,
      global: true,
    };
  }

  /**
   * Create Redis connection options with BullMQ optimizations
   */
  private static createConnectionOptions(
    options: BullModuleOptions,
  ): RedisOptions {
    if (options.redis) {
      return {
        ...options.redis,
        keyPrefix: options.keyPrefix,
        maxRetriesPerRequest: null, // Required for BullMQ blocking operations
        lazyConnect: true,
        enableReadyCheck: false,
        enableOfflineQueue: false,
      };
    }

    const redisUrl = options.redisUrl || 'redis://localhost:6379';

    // Parse URL to extract connection details
    const url = new URL(redisUrl);
    const isTLS = url.protocol === 'rediss:';

    return {
      host: url.hostname,
      port: parseInt(url.port) || (isTLS ? 6380 : 6379),
      password: url.password || undefined,
      username: url.username || undefined,
      db: url.pathname ? parseInt(url.pathname.slice(1)) || 0 : 0,
      tls: isTLS ? {} : undefined,
      keyPrefix: options.keyPrefix,
      maxRetriesPerRequest: null, // Required for BullMQ
      lazyConnect: true,
      enableReadyCheck: false,
      enableOfflineQueue: false,
    };
  }

  /**
   * Set up queue metrics collection
   */
  private static setupQueueMetrics(queue: Queue, queueName: string): void {
    const logger = new Logger(`Queue:${queueName}`);

    // Helper to safely get job ID
    const getJobId = (job: any): string => {
      if (job && typeof job === 'object' && 'id' in job) {
        return String((job as { id: unknown }).id);
      }
      return 'unknown';
    };

    // Helper to safely get error message
    const getErrorMessage = (err: any): string => {
      if (err instanceof Error) {
        return err.message;
      }
      if (err && typeof err === 'object' && 'message' in err) {
        return String((err as { message: unknown }).message);
      }
      return String(err);
    };

    // Note: Some events may not be available on all Queue versions
    // Using basic logging without accessing job properties directly
    queue.on('waiting' as any, (job: any) => {
      logger.debug(`Job ${getJobId(job)} waiting in queue ${queueName}`);
    });

    queue.on('active' as any, (job: any) => {
      logger.debug(
        `Job ${getJobId(job)} started processing in queue ${queueName}`,
      );
    });

    queue.on('completed' as any, (job: any) => {
      logger.log(`Job ${getJobId(job)} completed in queue ${queueName}`);
    });

    queue.on('failed' as any, (job: any, err: any) => {
      logger.error(
        `Job ${getJobId(job)} failed in queue ${queueName}: ${getErrorMessage(err)}`,
      );
    });

    queue.on('stalled' as any, (job: any) => {
      logger.warn(`Job ${getJobId(job)} stalled in queue ${queueName}`);
    });
  }

  /**
   * Set up queue events metrics collection
   */
  private static setupQueueEventsMetrics(
    queueEvents: QueueEvents,
    queueName: string,
  ): void {
    const logger = new Logger(`QueueEvents:${queueName}`);

    queueEvents.on('waiting', ({ jobId }) => {
      logger.debug(`Job ${jobId} waiting in ${queueName}`);
    });

    queueEvents.on('active', ({ jobId, prev }) => {
      const waitTime = prev === 'waiting' ? Date.now() - parseInt(jobId) : 0;
      logger.debug(
        `Job ${jobId} active in ${queueName}, wait time: ${waitTime}ms`,
      );
    });

    queueEvents.on('completed', ({ jobId }) => {
      logger.log(`Job ${jobId} completed in ${queueName}`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`Job ${jobId} failed in ${queueName}: ${failedReason}`);
    });

    queueEvents.on('stalled', ({ jobId }) => {
      logger.warn(`Job ${jobId} stalled in ${queueName}`);
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(
        `Job ${jobId} progress in ${queueName}: ${JSON.stringify(data)}`,
      );
    });
  }

  /**
   * Graceful shutdown - close all BullMQ resources
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutting down BullMQ module (signal: ${signal})`);

    // Close workers first (stop processing new jobs)
    for (const worker of BullMQModule.createdWorkers.splice(0)) {
      try {
        this.logger.debug(`Closing worker for queue: ${worker.name}`);
        await worker.close();
      } catch (error) {
        this.logger.error(
          `Error closing worker: ${String(error instanceof Error ? error.message : error)}`,
        );
      }
    }

    // Close queues
    for (const queue of BullMQModule.createdQueues.splice(0)) {
      try {
        this.logger.debug(`Closing queue: ${queue.name}`);
        await queue.close();
      } catch (error) {
        this.logger.error(
          `Error closing queue: ${String(error instanceof Error ? error.message : error)}`,
        );
      }
    }

    // Close queue events
    for (const queueEvents of BullMQModule.createdQueueEvents.splice(0)) {
      try {
        this.logger.debug(`Closing queue events for: ${queueEvents.name}`);
        await queueEvents.close();
      } catch (error) {
        this.logger.error(
          `Error closing queue events: ${String(error instanceof Error ? error.message : error)}`,
        );
      }
    }

    // Close Redis clients
    for (const redis of BullMQModule.providedRedisClients.splice(0)) {
      try {
        this.logger.debug('Closing Redis connection');
        await redis.quit();
      } catch (error) {
        this.logger.error(
          `Error closing Redis connection: ${String(error instanceof Error ? error.message : error)}`,
        );
      }
    }

    this.logger.log('BullMQ module shutdown complete');
  }
}
