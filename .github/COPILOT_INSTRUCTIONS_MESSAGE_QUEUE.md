# Production Message Queue System — Clean Architecture Roadmap (NestJS + DDD + CQRS + BullMQ)

> **Greenfield Implementation Roadmap**: This specification defines our production-ready generic message queue system with clean architecture principles, domain-driven design, and technology-agnostic abstractions.

---

## 🎯 **System Goals**

- ✅ **Domain-Driven Architecture** with each service owning its queue operations
- ✅ **Technology-Agnostic Abstraction** enabling queue provider swapping
- ✅ **Type-Safe Operations** with full TypeScript generics support
- ✅ **Production BullMQ Integration** with Redis backing
- ✅ **Clean Module Boundaries** with explicit separation of concerns
- ✅ **Scalable Worker Patterns** for async processing
- ✅ **Comprehensive Monitoring** with health checks and metrics

---

## 🏗️ **Architecture Overview**

Our system follows clean architecture with strict boundaries:

```
┌─────────────────────────────────────────────────────────────────┐
│                        DOMAIN LAYER                             │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────┐  │
│  │ Transaction   │ │ Notification  │ │    Slack Worker       │  │
│  │   Module      │ │    Module     │ │      Module           │  │
│  │               │ │               │ │                       │  │
│  │ • Commands    │ │ • Handlers    │ │ • Processors          │  │
│  │ • Queries     │ │ • Templates   │ │ • Formatters          │  │
│  │ • Services    │ │ • Routing     │ │ • Delivery            │  │
│  └───────┬───────┘ └───────┬───────┘ └───────────┬───────────┘  │
└──────────┼─────────────────┼─────────────────────┼──────────────┘
           │                 │                     │
           ▼                 ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE LAYER                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Generic Queue Abstraction                      │ │
│  │  IGenericQueue<T> → BullMQGenericQueue → Redis/BullMQ       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Key Principles:**

- ✅ **Domain modules own their queue operations** (no shared strategies)
- ✅ **Infrastructure provides only execution capability** (IGenericQueue port)
- ✅ **Clean boundaries** with dependency inversion
- ✅ **Technology swappable** (BullMQ → RabbitMQ → SQS)

---

## 📁 **File Structure**

```
src/shared/message-queue/
├── domain/
│   └── interfaces/
│       ├── generic-queue.interface.ts    # ✅ Core abstraction
│       └── queue-job.types.ts           # ✅ Job definitions
├── infrastructure/
│   ├── adapters/
│   │   ├── bullmq-generic-queue.adapter.ts  # ✅ Production BullMQ
│   │   └── simple-bullmq.adapter.ts         # 🔧 Development stub
│   ├── providers/
│   │   └── queue-registry.provider.ts       # ✅ Queue management
│   └── tokens/
│       └── queue.tokens.ts                  # ✅ DI symbols
├── generic-message-queue.module.ts          # ✅ Infrastructure module
├── README.md                               # 📖 Usage documentation
└── ARCHITECTURE.md                         # 📖 Design decisions

# Domain implementations:
src/bull-transaction/
├── domain/
│   └── interfaces/
│       └── transaction-message-queue.interface.ts
├── infrastructure/
│   └── services/
│       └── transaction-message-queue.service.ts  # ✅ Domain-specific impl
└── transaction.module.ts

src/core-slack-worker/
├── application/
│   └── handlers/
│       └── slack-message.handler.ts              # ✅ Message processing
├── infrastructure/
│   └── services/
│       └── slack-queue.service.ts                # ✅ Domain-specific impl
└── core-slack-worker.module.ts

src/notifications/
└── (similar domain-driven structure)
```

---

## 🔧 **Core Infrastructure**

### DI Tokens (`shared/tokens/queue.tokens.ts`)

```ts
// ✅ Symbol-based tokens prevent collisions
export const QUEUE_TOKENS = {
  GENERIC_QUEUE: Symbol('IGenericQueue'),
  QUEUE_REGISTRY: Symbol('QUEUE_REGISTRY'),
  QUEUE_CONFIG: Symbol('QUEUE_CONFIG'),
} as const;

export type QueueTokens = typeof QUEUE_TOKENS;
```

### Generic Queue Interface (`domain/interfaces/generic-queue.interface.ts`)

```ts
export interface IGenericQueue<T = any> {
  // Core operations
  add(name: string, data: T, options?: QueueJobOptions): Promise<QueueJob<T>>;
  addBulk(
    jobs: Array<{ name: string; data: T; options?: QueueJobOptions }>,
  ): Promise<QueueJob<T>[]>;

  // Job management
  getJob(jobId: string): Promise<QueueJob<T> | null>;
  removeJob(jobId: string): Promise<void>;

  // Queue operations
  pause(): Promise<void>;
  resume(): Promise<void>;
  clean(
    grace: number,
    status: 'completed' | 'failed' | 'active',
  ): Promise<void>;

  // Monitoring
  getStats(): Promise<QueueStats>;
}

export interface QueueJobOptions {
  delay?: number;
  attempts?: number;
  priority?: number; // ⚠️ BullMQ: Lower numbers = higher priority
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: number;
  removeOnFail?: number;
  jobId?: string;
}

export interface QueueJob<T = any> {
  id: string;
  name: string;
  data: T;
  opts: QueueJobOptions;
  progress: number;
  returnvalue?: any;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}
```

### Priority Constants (`domain/constants/priority.constants.ts`)

```ts
/**
 * ⚠️ BullMQ Priority Semantics: LOWER numbers = HIGHER priority
 */
export const PRIORITY_LEVELS = {
  CRITICAL: 1, // System alerts, failures
  HIGH: 3, // User notifications, time-sensitive
  NORMAL: 5, // Standard business operations
  LOW: 7, // Background processing
  BULK: 10, // Bulk operations, cleanup
} as const;

export type PriorityLevel =
  (typeof PRIORITY_LEVELS)[keyof typeof PRIORITY_LEVELS];
```

### Queue Names (`domain/constants/queue-names.constants.ts`)

```ts
/**
 * Standardized queue naming: kebab-case, resource-based
 */
export const QUEUE_NAMES = {
  // Transaction processing
  TRANSACTION_PROCESSING: 'transaction-processing',
  TRANSACTION_SETTLEMENT: 'transaction-settlement',

  // Notifications
  NOTIFICATION_EMAIL: 'notification-email',
  NOTIFICATION_PUSH: 'notification-push',

  // Slack integration
  SLACK_MESSAGES: 'slack-messages',
  SLACK_ALERTS: 'slack-alerts',

  // Background processing
  DATA_PROCESSING: 'data-processing',
  FILE_PROCESSING: 'file-processing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
```

---

## 🏭 **Production BullMQ Adapter**

### BullMQ Implementation (`infrastructure/adapters/bullmq-generic-queue.adapter.ts`)

```ts
import { Queue, Job, QueueOptions } from 'bullmq';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  IGenericQueue,
  QueueJob,
  QueueJobOptions,
  QueueStats,
} from '../domain/interfaces';

@Injectable()
export class BullMQGenericQueue implements IGenericQueue, OnModuleDestroy {
  constructor(private readonly bullQueue: Queue) {}

  async add<T = any>(
    name: string,
    data: T,
    options?: QueueJobOptions,
  ): Promise<QueueJob<T>> {
    const job = await this.bullQueue.add(name, data, {
      delay: options?.delay,
      attempts: options?.attempts || 3,
      priority: options?.priority || PRIORITY_LEVELS.NORMAL,
      removeOnComplete: options?.removeOnComplete || 100,
      removeOnFail: options?.removeOnFail || 50,
      jobId: options?.jobId,
      backoff: options?.backoff
        ? {
            type: options.backoff.type,
            delay: options.backoff.delay,
          }
        : { type: 'exponential', delay: 2000 },
    });

    return {
      id: job.id!,
      name: job.name,
      data: job.data,
      opts: {
        delay: options?.delay,
        attempts: options?.attempts,
        priority: options?.priority,
        removeOnComplete: options?.removeOnComplete,
        removeOnFail: options?.removeOnFail,
        jobId: job.id,
      },
      progress: typeof job.progress === 'number' ? job.progress : 0,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  async addBulk<T = any>(
    jobs: Array<{ name: string; data: T; options?: QueueJobOptions }>,
  ): Promise<QueueJob<T>[]> {
    const bullJobs = jobs.map((job) => ({
      name: job.name,
      data: job.data,
      opts: {
        priority: job.options?.priority || PRIORITY_LEVELS.NORMAL,
        attempts: job.options?.attempts || 3,
        // ... other options
      },
    }));

    const addedJobs = await this.bullQueue.addBulk(bullJobs);
    return addedJobs.map((job) => ({
      id: job.id!,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: 0,
    }));
  }

  async getJob<T = any>(jobId: string): Promise<QueueJob<T> | null> {
    const job = await this.bullQueue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id!,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: await job.progress(),
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  async removeJob(jobId: string): Promise<void> {
    const job = await this.bullQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  async getStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.bullQueue.getWaiting(),
      this.bullQueue.getActive(),
      this.bullQueue.getCompleted(),
      this.bullQueue.getFailed(),
      this.bullQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  async pause(): Promise<void> {
    await this.bullQueue.pause();
  }

  async resume(): Promise<void> {
    await this.bullQueue.resume();
  }

  async clean(
    grace: number,
    status: 'completed' | 'failed' | 'active',
  ): Promise<void> {
    await this.bullQueue.clean(grace, 100, status);
  }

  async onModuleDestroy() {
    await this.bullQueue.close();
  }
}
```

### Queue Registry Provider (`infrastructure/providers/queue-registry.provider.ts`)

```ts
import { Provider } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_TOKENS, QUEUE_NAMES } from '../constants';
import { BullMQGenericQueue } from '../adapters/bullmq-generic-queue.adapter';

export const QueueRegistryProvider: Provider = {
  provide: QUEUE_TOKENS.QUEUE_REGISTRY,
  useFactory: () => {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    const registry = new Map<string, BullMQGenericQueue>();

    // Register all production queues
    Object.values(QUEUE_NAMES).forEach((queueName) => {
      const bullQueue = new Queue(queueName, {
        connection: redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      registry.set(queueName, new BullMQGenericQueue(bullQueue));
    });

    return registry;
  },
};
```

---

## 🏢 **Domain Implementation Examples**

### Transaction Domain (`bull-transaction/`)

#### Domain Interface (`domain/interfaces/transaction-message-queue.interface.ts`)

```ts
export interface TransactionSettlementData {
  txId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  merchantId: string;
}

export interface TransactionValidationData {
  txId: string;
  rules: string[];
  riskScore: number;
}

export interface ITransactionMessageQueue {
  enqueueSettlement(
    data: TransactionSettlementData,
    correlationId?: string,
  ): Promise<void>;
  enqueueValidation(
    data: TransactionValidationData,
    correlationId?: string,
  ): Promise<void>;
  enqueueRefund(
    data: TransactionRefundData,
    correlationId?: string,
  ): Promise<void>;
}
```

#### Infrastructure Implementation (`infrastructure/services/transaction-message-queue.service.ts`)

```ts
@Injectable()
export class TransactionMessageQueueService
  implements ITransactionMessageQueue
{
  private readonly logger = new Logger(TransactionMessageQueueService.name);

  constructor(
    @Inject(QUEUE_TOKENS.QUEUE_REGISTRY)
    private readonly queueRegistry: Map<string, IGenericQueue>,
  ) {}

  private getQueue(): IGenericQueue {
    const queue = this.queueRegistry.get(QUEUE_NAMES.TRANSACTION_PROCESSING);
    if (!queue) {
      throw new Error('Transaction processing queue not found');
    }
    return queue;
  }

  async enqueueSettlement(
    data: TransactionSettlementData,
    correlationId?: string,
  ): Promise<void> {
    this.logger.log(`Enqueuing settlement for transaction ${data.txId}`);

    await this.getQueue().add('transaction.settlement.v1', data, {
      attempts: 5,
      priority: PRIORITY_LEVELS.HIGH,
      backoff: { type: 'exponential', delay: 5000 },
      jobId: correlationId || `settlement-${data.txId}`,
    });

    this.logger.log(`Settlement job enqueued for transaction ${data.txId}`);
  }

  async enqueueValidation(
    data: TransactionValidationData,
    correlationId?: string,
  ): Promise<void> {
    this.logger.log(`Enqueuing validation for transaction ${data.txId}`);

    await this.getQueue().add('transaction.validation.v1', data, {
      attempts: 2,
      priority: PRIORITY_LEVELS.NORMAL,
      jobId: correlationId || `validation-${data.txId}`,
    });

    this.logger.log(`Validation job enqueued for transaction ${data.txId}`);
  }

  async enqueueRefund(
    data: TransactionRefundData,
    correlationId?: string,
  ): Promise<void> {
    this.logger.log(`Enqueuing refund for transaction ${data.txId}`);

    await this.getQueue().add('transaction.refund.v1', data, {
      attempts: 3,
      priority: PRIORITY_LEVELS.HIGH,
      jobId: correlationId || `refund-${data.txId}`,
    });

    this.logger.log(`Refund job enqueued for transaction ${data.txId}`);
  }
}
```

#### Module Configuration (`transaction.module.ts`)

```ts
@Module({
  imports: [
    GenericMessageQueueModule, // Import infrastructure
    // ... other imports
  ],
  providers: [
    // Domain services
    TransactionApplicationService,

    // Infrastructure bindings
    {
      provide: 'ITransactionMessageQueue',
      useClass: TransactionMessageQueueService,
    },

    // ... other providers
  ],
})
export class TransactionModule {}
```

### Slack Worker Domain (`core-slack-worker/`)

#### Message Handler (`application/handlers/slack-message.handler.ts`)

```ts
@Injectable()
export class SlackMessageHandler {
  private readonly logger = new Logger(SlackMessageHandler.name);

  constructor(
    @Inject(QUEUE_TOKENS.QUEUE_REGISTRY)
    private readonly queueRegistry: Map<string, IGenericQueue>,
    private readonly slackClient: SlackApiService,
  ) {}

  async sendChannelMessage(message: SlackChannelMessage): Promise<void> {
    const queue = this.queueRegistry.get(QUEUE_NAMES.SLACK_MESSAGES);
    if (!queue) {
      throw new Error('Slack messages queue not found');
    }

    await queue.add('slack.channel.send.v1', message, {
      priority: message.urgent ? PRIORITY_LEVELS.HIGH : PRIORITY_LEVELS.NORMAL,
      attempts: 3,
      jobId: `slack-${message.channel}-${Date.now()}`,
    });

    this.logger.log(`Slack message queued for channel ${message.channel}`);
  }

  async sendAlert(alert: SlackAlert): Promise<void> {
    const queue = this.queueRegistry.get(QUEUE_NAMES.SLACK_ALERTS);
    if (!queue) {
      throw new Error('Slack alerts queue not found');
    }

    await queue.add('slack.alert.send.v1', alert, {
      priority: PRIORITY_LEVELS.CRITICAL,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      jobId: `alert-${alert.type}-${Date.now()}`,
    });

    this.logger.log(`Slack alert queued: ${alert.type}`);
  }
}
```

---

## 🔧 **Infrastructure Module**

### Generic Message Queue Module (`generic-message-queue.module.ts`)

```ts
@Module({
  providers: [
    // Infrastructure providers
    QueueRegistryProvider,

    // DI configurations
    {
      provide: QUEUE_TOKENS.GENERIC_QUEUE,
      useFactory: (registry: Map<string, IGenericQueue>) => {
        return registry.get(QUEUE_NAMES.DATA_PROCESSING);
      },
      inject: [QUEUE_TOKENS.QUEUE_REGISTRY],
    },
  ],
  exports: [QUEUE_TOKENS.QUEUE_REGISTRY, QUEUE_TOKENS.GENERIC_QUEUE],
})
export class GenericMessageQueueModule {}
```

---

## 🔗 **Integration with Domain Events**

### Domain Event to Queue Mapping Pattern

Our message queues integrate seamlessly with EventStoreDB domain events:

```ts
// ✅ Event Handler triggering async queue processing
@EventHandler(PaymentCompletedV1Event)
export class PaymentQueueTriggerHandler {
  private readonly logger = new Logger(PaymentQueueTriggerHandler.name);

  constructor(
    private readonly notificationQueue: INotificationMessageQueue,
    private readonly slackQueue: ISlackMessageQueue,
    private readonly transactionQueue: ITransactionMessageQueue,
  ) {}

  async handle(event: PaymentCompletedV1Event, metadata: EventStoreMetaProps) {
    this.logger.log({
      operation: 'QUEUE_TRIGGER_FROM_DOMAIN_EVENT',
      correlationId: metadata.correlationId,
      eventType: event.constructor.name,
      paymentId: event.paymentId,
    });

    // ✅ Trigger async email notification
    await this.notificationQueue.enqueueEmail(
      {
        type: 'payment.completed',
        userId: event.userId,
        paymentId: event.paymentId,
        amount: event.amountMinor,
        currency: event.currency,
      },
      {
        correlationId: metadata.correlationId,
        source: 'domain.payment.completed',
        timestamp: new Date(),
        user: metadata.userId ? { id: metadata.userId } : undefined,
        tenantId: metadata.tenantId,
      },
    );

    // ✅ Trigger Slack alert for high-value payments
    if (event.amountMinor > 100000) {
      await this.slackQueue.sendAlert(
        {
          type: 'high_value_payment',
          amount: event.amountMinor,
          currency: event.currency,
          paymentId: event.paymentId,
          merchantName: event.merchantName,
        },
        {
          correlationId: metadata.correlationId,
          source: 'domain.payment.high_value',
          timestamp: new Date(),
          priority: PRIORITY_LEVELS.HIGH,
        },
      );
    }

    // ✅ Trigger settlement processing for completed payments
    await this.transactionQueue.enqueueSettlement(
      {
        paymentId: event.paymentId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        settlementDate: event.settlementDate,
      },
      {
        correlationId: metadata.correlationId,
        source: 'domain.payment.settlement',
        timestamp: new Date(),
        delay: this.calculateSettlementDelay(event.settlementDate),
      },
    );
  }

  private calculateSettlementDelay(settlementDate: Date): number {
    const now = new Date();
    const delay = settlementDate.getTime() - now.getTime();
    return Math.max(0, delay); // Don't allow negative delays
  }
}
```

### Queue Interface Contract Template

```ts
// ✅ Domain-specific queue interface
export interface INotificationMessageQueue {
  enqueueEmail(
    data: EmailNotificationData,
    metadata: StandardJobMetadata,
    options?: QueueJobOptions,
  ): Promise<QueueJob>;

  enqueueSms(
    data: SmsNotificationData,
    metadata: StandardJobMetadata,
    options?: QueueJobOptions,
  ): Promise<QueueJob>;

  enqueuePush(
    data: PushNotificationData,
    metadata: StandardJobMetadata,
    options?: QueueJobOptions,
  ): Promise<QueueJob>;
}

// ✅ Implementation using generic queue
@Injectable()
export class NotificationMessageQueueService
  implements INotificationMessageQueue
{
  private readonly logger = new Logger(NotificationMessageQueueService.name);

  constructor(
    @Inject('NOTIFICATION_QUEUE')
    private readonly queue: IGenericQueue<QueueJobData>,
  ) {}

  async enqueueEmail(
    data: EmailNotificationData,
    metadata: StandardJobMetadata,
    options: QueueJobOptions = {},
  ): Promise<QueueJob> {
    return this.queue.add(
      'email',
      {
        payload: data,
        metadata: {
          ...metadata,
          source: metadata.source || 'notification.email',
        },
      },
      {
        ...options,
        priority: options.priority || PRIORITY_LEVELS.NORMAL,
      },
    );
  }
}
```

---

## 🔄 **Outbox Pattern Retry Alignment**

### Consistent Backoff Strategy

Align queue retry behavior with your Outbox pattern for operational consistency:

```ts
// ✅ Shared retry configuration matching Outbox pattern
export const QUEUE_RETRY_CONFIG = {
  attempts: 5, // Same as Outbox max attempts
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // Start at 2s like Outbox
    maxDelay: 15 * 60 * 1000, // Cap at 15m like Outbox
    jitter: true, // Add jitter like Outbox
  },
} as const;

// ✅ BullMQ adapter configuration
export class BullMQGenericQueueAdapter<T> implements IGenericQueue<T> {
  constructor(
    private readonly queue: Queue<T>,
    private readonly config: QueueConfig,
  ) {
    // Configure default job options with Outbox-aligned retry
    this.queue.setDefaultJobOptions({
      attempts: QUEUE_RETRY_CONFIG.attempts,
      backoff: QUEUE_RETRY_CONFIG.backoff,
      removeOnComplete: 50, // Keep recent successes
      removeOnFail: 20, // Keep recent failures for debugging
    });
  }

  async add(
    jobName: string,
    data: T,
    options: QueueJobOptions = {},
  ): Promise<QueueJob> {
    return this.queue.add(jobName, data, {
      ...options,
      // ✅ Override defaults if specified
      attempts: options.attempts || QUEUE_RETRY_CONFIG.attempts,
      delay: options.delay || 0,
      priority: options.priority || PRIORITY_LEVELS.NORMAL,
    });
  }
}
```

### Failure Categorization

```ts
// ✅ Consistent failure handling with Outbox pattern
export enum QueueFailureType {
  RETRYABLE = 'retryable', // Temporary issues (network, rate limits)
  PERMANENT = 'permanent', // Business logic errors, invalid data
  CIRCUIT_BREAKER = 'circuit_open', // Downstream service unavailable
}

export interface QueueFailureContext {
  failureType: QueueFailureType;
  originalError: Error;
  attemptNumber: number;
  nextRetryAt?: Date;
  shouldDeadLetter: boolean;
}

// ✅ Worker error handling template
@Processor('notification-email')
export class EmailNotificationWorker {
  @Process('email')
  async processEmail(job: Job<QueueJobData<EmailNotificationData>>) {
    try {
      await this.emailService.send(job.data.payload);

      this.logger.log({
        operation: 'QUEUE_JOB_COMPLETED',
        correlationId: job.data.metadata.correlationId,
        jobId: job.id,
        jobName: job.name,
        duration: Date.now() - job.processedOn,
      });
    } catch (error) {
      const failureContext = this.categorizeFailure(error, job.attemptsMade);

      this.logger.error({
        operation: 'QUEUE_JOB_FAILED',
        correlationId: job.data.metadata.correlationId,
        jobId: job.id,
        jobName: job.name,
        failureType: failureContext.failureType,
        attemptNumber: failureContext.attemptNumber,
        error: error.message,
        shouldDeadLetter: failureContext.shouldDeadLetter,
      });

      if (failureContext.failureType === QueueFailureType.PERMANENT) {
        // Don't retry permanent failures
        throw new Error(`Permanent failure: ${error.message}`);
      }

      throw error; // Let BullMQ handle retryable failures
    }
  }

  private categorizeFailure(
    error: Error,
    attemptNumber: number,
  ): QueueFailureContext {
    // ✅ Business logic errors - don't retry
    if (
      error instanceof InvalidEmailAddressError ||
      error instanceof TemplateNotFoundError
    ) {
      return {
        failureType: QueueFailureType.PERMANENT,
        originalError: error,
        attemptNumber,
        shouldDeadLetter: true,
      };
    }

    // ✅ Rate limiting - retry with backoff
    if (error.message.includes('rate limit') || error.status === 429) {
      return {
        failureType: QueueFailureType.RETRYABLE,
        originalError: error,
        attemptNumber,
        shouldDeadLetter: attemptNumber >= QUEUE_RETRY_CONFIG.attempts,
      };
    }

    // ✅ Default to retryable
    return {
      failureType: QueueFailureType.RETRYABLE,
      originalError: error,
      attemptNumber,
      shouldDeadLetter: attemptNumber >= QUEUE_RETRY_CONFIG.attempts,
    };
  }
}
```

---

## 💀 **Dead Letter Integration**

### Operational Dead Letter Handling

Connect dead letter processing with your operational procedures and Outbox pattern:

```ts
// ✅ Dead letter metrics and alerting
export interface DeadLetterMetrics {
  queueName: string;
  jobName: string;
  jobId: string;
  failureReason: string;
  correlationId: string;
  tenantId?: string;
  finalAttemptAt: Date;
  totalAttempts: number;
  firstFailureAt: Date;
}

// ✅ Dead letter service for operational monitoring
@Injectable()
export class QueueDeadLetterService {
  private readonly logger = new Logger(QueueDeadLetterService.name);

  constructor(
    private readonly outbox: IIntegrationOutboxRepository,
    private readonly metrics: IMetricsService,
  ) {}

  async handleDeadLetter(job: Job<QueueJobData>, error: Error): Promise<void> {
    const deadLetterMetrics: DeadLetterMetrics = {
      queueName: job.queue.name,
      jobName: job.name,
      jobId: job.id,
      failureReason: error.message,
      correlationId: job.data.metadata.correlationId,
      tenantId: job.data.metadata.tenantId,
      finalAttemptAt: new Date(),
      totalAttempts: job.attemptsMade,
      firstFailureAt: new Date(job.timestamp + (job.opts.delay || 0)),
    };

    // ✅ Structured logging for operational visibility
    this.logger.error({
      operation: 'QUEUE_JOB_DEAD_LETTER',
      ...deadLetterMetrics,
      payload: job.data.payload,
    });

    // ✅ Emit metrics for alerting
    this.metrics.counter('queue.job.dead_letter.total', 1, {
      queue_name: deadLetterMetrics.queueName,
      job_name: deadLetterMetrics.jobName,
      failure_reason: this.categorizeFailureReason(error),
    });

    // ✅ Send dead letter notification via Outbox for ops team
    await this.outbox.enqueue({
      integrationType: 'webhook:ops-alerts',
      eventType: 'queue.job.dead_letter.v1',
      payload: deadLetterMetrics,
      metadata: {
        correlationId: job.data.metadata.correlationId,
        source: 'queue.dead_letter_handler',
        occurredAt: new Date().toISOString(),
        tenantId: job.data.metadata.tenantId,
      },
    });

    // ✅ Store in dead letter table for manual recovery
    await this.storeDeadLetterForRecovery(deadLetterMetrics, job.data);
  }

  private categorizeFailureReason(error: Error): string {
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('rate limit')) return 'rate_limit';
    if (error.message.includes('authentication')) return 'auth_failure';
    if (error.message.includes('invalid')) return 'validation_error';
    return 'unknown';
  }

  private async storeDeadLetterForRecovery(
    metrics: DeadLetterMetrics,
    jobData: QueueJobData,
  ): Promise<void> {
    // Store in database table for ops team manual recovery
    // This enables reprocessing of dead letters after fixes
  }
}

// ✅ Dead letter queue configuration
@Processor('dead-letter-queue')
export class DeadLetterQueueWorker {
  constructor(private readonly deadLetterService: QueueDeadLetterService) {}

  @OnGlobalQueueFailed()
  async handleGlobalQueueFailed(jobId: string, err: Error) {
    // BullMQ will move failed jobs here after max attempts
    const job = await Job.fromId(this.queue, jobId);
    if (job) {
      await this.deadLetterService.handleDeadLetter(job, err);
    }
  }

  @Process('manual-reprocess')
  async reprocessDeadLetter(
    job: Job<{ originalJobData: QueueJobData; reason: string }>,
  ) {
    // Manual reprocessing endpoint for ops team
    const { originalJobData, reason } = job.data;

    this.logger.log({
      operation: 'DEAD_LETTER_MANUAL_REPROCESS',
      correlationId: originalJobData.metadata.correlationId,
      reason,
      originalJobId: job.id,
    });

    // Re-enqueue to original queue with fresh attempt counter
    // Implementation depends on specific queue routing logic
  }
}
```

---

## 🧪 **Testing Integration with Domain Events**

### Unit Testing Event Handler Queue Integration

```ts
// ✅ Unit test for event handler queue integration
describe('PaymentQueueTriggerHandler', () => {
  let handler: PaymentQueueTriggerHandler;
  let mockNotificationQueue: jest.Mocked<INotificationMessageQueue>;
  let mockSlackQueue: jest.Mocked<ISlackMessageQueue>;
  let mockTransactionQueue: jest.Mocked<ITransactionMessageQueue>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PaymentQueueTriggerHandler,
        {
          provide: 'INotificationMessageQueue',
          useValue: {
            enqueueEmail: jest.fn(),
            enqueueSms: jest.fn(),
          },
        },
        {
          provide: 'ISlackMessageQueue',
          useValue: {
            sendAlert: jest.fn(),
          },
        },
        {
          provide: 'ITransactionMessageQueue',
          useValue: {
            enqueueSettlement: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get(PaymentQueueTriggerHandler);
    mockNotificationQueue = module.get('INotificationMessageQueue');
    mockSlackQueue = module.get('ISlackMessageQueue');
    mockTransactionQueue = module.get('ITransactionMessageQueue');
  });

  describe('handle PaymentCompletedV1Event', () => {
    it('should trigger notification queue on payment completion', async () => {
      // Arrange
      const event = new PaymentCompletedV1Event({
        paymentId: 'pay_123',
        userId: 'user_456',
        amountMinor: 50000, // $500.00
        currency: 'USD',
        merchantName: 'Test Merchant',
        settlementDate: new Date('2025-08-15'),
      });

      const metadata: EventStoreMetaProps = {
        correlationId: 'test-correlation-123',
        source: 'payment.domain',
        occurredAt: '2025-08-12T10:30:00Z',
        userId: 'user_456',
        tenantId: 'tenant_789',
      };

      // Act
      await handler.handle(event, metadata);

      // Assert
      expect(mockNotificationQueue.enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment.completed',
          paymentId: 'pay_123',
          userId: 'user_456',
          amountMinor: 50000,
          currency: 'USD',
        }),
        expect.objectContaining({
          correlationId: 'test-correlation-123',
          source: 'domain.payment.completed',
          tenantId: 'tenant_789',
        }),
      );

      expect(mockTransactionQueue.enqueueSettlement).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay_123',
          amountMinor: 50000,
          currency: 'USD',
        }),
        expect.objectContaining({
          correlationId: 'test-correlation-123',
          source: 'domain.payment.settlement',
        }),
      );
    });

    it('should trigger Slack alert for high-value payments', async () => {
      // Arrange
      const highValueEvent = new PaymentCompletedV1Event({
        paymentId: 'pay_456',
        userId: 'user_789',
        amountMinor: 150000, // $1,500.00 - triggers alert
        currency: 'USD',
        merchantName: 'High Value Merchant',
        settlementDate: new Date('2025-08-15'),
      });

      const metadata: EventStoreMetaProps = {
        correlationId: 'high-value-correlation-456',
        source: 'payment.domain',
        occurredAt: '2025-08-12T10:30:00Z',
      };

      // Act
      await handler.handle(highValueEvent, metadata);

      // Assert
      expect(mockSlackQueue.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'high_value_payment',
          amount: 150000,
          currency: 'USD',
          paymentId: 'pay_456',
          merchantName: 'High Value Merchant',
        }),
        expect.objectContaining({
          correlationId: 'high-value-correlation-456',
          source: 'domain.payment.high_value',
          priority: PRIORITY_LEVELS.HIGH,
        }),
      );
    });

    it('should NOT trigger Slack alert for normal-value payments', async () => {
      // Arrange
      const normalValueEvent = new PaymentCompletedV1Event({
        paymentId: 'pay_789',
        amountMinor: 50000, // $500.00 - below threshold
        currency: 'USD',
        merchantName: 'Normal Merchant',
        settlementDate: new Date('2025-08-15'),
      });

      const metadata: EventStoreMetaProps = {
        correlationId: 'normal-correlation-789',
        source: 'payment.domain',
        occurredAt: '2025-08-12T10:30:00Z',
      };

      // Act
      await handler.handle(normalValueEvent, metadata);

      // Assert
      expect(mockSlackQueue.sendAlert).not.toHaveBeenCalled();
    });
  });
});

// ✅ Integration test with real queue processing
describe('NotificationQueue Integration', () => {
  let app: INestApplication;
  let notificationQueue: INotificationMessageQueue;
  let emailService: jest.Mocked<IEmailService>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // Use test configuration with in-memory Redis
        GenericMessageQueueModule.forRootAsync({
          useFactory: () => ({
            connection: {
              host: 'localhost',
              port: 6380, // Test Redis instance
              db: 15, // Test database
            },
            defaultJobOptions: QUEUE_RETRY_CONFIG,
          }),
        }),
        NotificationModule,
      ],
    })
      .overrideProvider('IEmailService')
      .useValue({
        send: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    notificationQueue = app.get('INotificationMessageQueue');
    emailService = app.get('IEmailService');
  });

  afterAll(async () => {
    await app.close();
  });

  it('should process email notification job end-to-end', async () => {
    // Arrange
    const emailData: EmailNotificationData = {
      type: 'payment.completed',
      recipientEmail: 'user@example.com',
      templateId: 'payment_completed_v1',
      templateData: {
        paymentId: 'pay_123',
        amount: '$500.00',
        merchantName: 'Test Merchant',
      },
    };

    const metadata: StandardJobMetadata = {
      correlationId: 'integration-test-123',
      source: 'integration.test',
      timestamp: new Date(),
    };

    // Act
    const job = await notificationQueue.enqueueEmail(emailData, metadata);

    // Wait for job processing (with timeout)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Assert
    expect(job.id).toBeDefined();
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment.completed',
        recipientEmail: 'user@example.com',
      }),
    );
  });

  it('should handle job failure and retry correctly', async () => {
    // Arrange
    emailService.send.mockRejectedValueOnce(
      new Error('Temporary service unavailable'),
    );
    emailService.send.mockResolvedValueOnce(undefined); // Success on retry

    const emailData: EmailNotificationData = {
      type: 'payment.completed',
      recipientEmail: 'retry@example.com',
      templateId: 'payment_completed_v1',
      templateData: { paymentId: 'pay_retry' },
    };

    const metadata: StandardJobMetadata = {
      correlationId: 'retry-test-456',
      source: 'integration.test',
      timestamp: new Date(),
    };

    // Act
    await notificationQueue.enqueueEmail(emailData, metadata);

    // Wait for initial failure and retry
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Assert
    expect(emailService.send).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });
});

// ✅ E2E test with domain event flow
describe('Payment Domain Event to Queue E2E', () => {
  let app: INestApplication;
  let eventStore: IEventStore;
  let paymentAggregate: PaymentAggregate;

  beforeAll(async () => {
    // Setup test app with real components
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    eventStore = app.get(EventStore);
  });

  it('should complete payment and trigger all expected queue jobs', async () => {
    // Arrange
    const paymentId = `pay_e2e_${Date.now()}`;
    const correlationId = `e2e_test_${Date.now()}`;

    paymentAggregate = PaymentAggregate.create({
      paymentId,
      userId: 'user_e2e',
      amountMinor: 200000, // $2,000 - triggers Slack alert
      currency: 'USD',
      merchantId: 'merchant_e2e',
    });

    // Act - Complete payment (triggers domain event)
    paymentAggregate.complete('txn_123', new Date('2025-08-15'));

    await eventStore.saveEvents(
      paymentId,
      paymentAggregate.getUncommittedEvents(),
      -1,
      { correlationId, source: 'e2e.test' },
    );

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Assert - Verify all expected queue jobs were triggered
    // This would require queue inspection utilities or test doubles
    // Implementation depends on your specific testing strategy
  });
});
```

---

## 🧪 **Testing Strategy**

### Unit Testing Domain Services

```ts
describe('TransactionMessageQueueService', () => {
  let service: TransactionMessageQueueService;
  let mockQueue: jest.Mocked<IGenericQueue>;
  let queueRegistry: Map<string, IGenericQueue>;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn(),
      addBulk: jest.fn(),
      getJob: jest.fn(),
      removeJob: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      clean: jest.fn(),
      getStats: jest.fn(),
    };

    queueRegistry = new Map();
    queueRegistry.set(QUEUE_NAMES.TRANSACTION_PROCESSING, mockQueue);

    const module = await Test.createTestingModule({
      providers: [
        TransactionMessageQueueService,
        {
          provide: QUEUE_TOKENS.QUEUE_REGISTRY,
          useValue: queueRegistry,
        },
      ],
    }).compile();

    service = module.get<TransactionMessageQueueService>(
      TransactionMessageQueueService,
    );
  });

  it('should enqueue settlement with correct priority', async () => {
    const settlementData: TransactionSettlementData = {
      txId: 'tx-123',
      amount: 100.0,
      currency: 'USD',
      paymentMethod: 'credit_card',
      merchantId: 'merchant-456',
    };

    await service.enqueueSettlement(settlementData, 'corr-789');

    expect(mockQueue.add).toHaveBeenCalledWith(
      'transaction.settlement.v1',
      settlementData,
      expect.objectContaining({
        priority: PRIORITY_LEVELS.HIGH,
        attempts: 5,
        jobId: 'corr-789',
      }),
    );
  });

  it('should handle validation with normal priority', async () => {
    const validationData: TransactionValidationData = {
      txId: 'tx-123',
      rules: ['amount_check', 'fraud_detection'],
      riskScore: 0.3,
    };

    await service.enqueueValidation(validationData);

    expect(mockQueue.add).toHaveBeenCalledWith(
      'transaction.validation.v1',
      validationData,
      expect.objectContaining({
        priority: PRIORITY_LEVELS.NORMAL,
        attempts: 2,
        jobId: 'validation-tx-123',
      }),
    );
  });
});
```

### Integration Testing

```ts
describe('BullMQGenericQueue Integration', () => {
  let adapter: BullMQGenericQueue;
  let testQueue: Queue;

  beforeEach(async () => {
    const redisConfig = {
      host: process.env.TEST_REDIS_HOST || 'localhost',
      port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
    };

    testQueue = new Queue('test-queue', { connection: redisConfig });
    adapter = new BullMQGenericQueue(testQueue);
  });

  afterEach(async () => {
    await adapter.onModuleDestroy();
  });

  it('should add job with correct BullMQ priority semantics', async () => {
    const jobData = { test: 'data' };

    const job = await adapter.add('test.job.v1', jobData, {
      priority: PRIORITY_LEVELS.CRITICAL, // Should be 1 (highest)
    });

    expect(job.id).toBeDefined();
    expect(job.name).toBe('test.job.v1');

    // Verify BullMQ job has correct priority (lower = higher)
    const bullJob = await testQueue.getJob(job.id);
    expect(bullJob?.opts.priority).toBe(1);
  });

  it('should handle bulk operations', async () => {
    const jobs = [
      {
        name: 'bulk.job.v1',
        data: { id: 1 },
        options: { priority: PRIORITY_LEVELS.HIGH },
      },
      {
        name: 'bulk.job.v1',
        data: { id: 2 },
        options: { priority: PRIORITY_LEVELS.LOW },
      },
    ];

    const addedJobs = await adapter.addBulk(jobs);

    expect(addedJobs).toHaveLength(2);
    expect(addedJobs[0].data.id).toBe(1);
    expect(addedJobs[1].data.id).toBe(2);
  });
});
```

---

## 📊 **Monitoring & Health Checks**

### Health Check Implementation

```ts
@Injectable()
export class MessageQueueHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(QUEUE_TOKENS.QUEUE_REGISTRY)
    private readonly queueRegistry: Map<string, IGenericQueue>,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const results = {};

    for (const [queueName, queue] of this.queueRegistry) {
      try {
        const stats = await queue.getStats();
        results[queueName] = {
          status: 'up',
          ...stats,
        };
      } catch (error) {
        results[queueName] = {
          status: 'down',
          error: error.message,
        };
      }
    }

    const allHealthy = Object.values(results).every(
      (result: any) => result.status === 'up',
    );

    if (allHealthy) {
      return this.getStatus(key, true, results);
    } else {
      throw new HealthCheckError('Message queues failed', results);
    }
  }
}
```

---

## 🎯 **Job Naming Conventions**

### Semantic Job Names with Versioning

```ts
// ✅ CORRECT: Semantic action with versioning
'transaction.settlement.v1';
'notification.email.send.v2';
'slack.alert.critical.v1';
'data.cleanup.expired.v1';
'file.process.image.v3';

// ❌ WRONG: Generic or unclear names
'process-data';
'handle-event';
'slack-message';
'notification';
```

### Metadata Standards

```ts
interface StandardJobMetadata {
  correlationId: string; // ✅ Required for tracing
  user: IUserToken | SystemUser; // ✅ User context (supports system jobs)
  source: string; // ✅ Originating service
  timestamp: Date; // ✅ Job creation time
  businessContext?: any; // ✅ Domain-specific data
}

// ✅ For system-initiated jobs (cron, background tasks, etc.)
interface SystemUser {
  sub: 'system';
  tenant: string;
  roles: ['system'];
  displayName: 'System';
}

// ✅ Example usage with real user
await queue.add('transaction.settlement.v1', settlementData, {
  priority: PRIORITY_LEVELS.HIGH,
  jobId: `settlement-${txId}-${Date.now()}`,
  // Metadata embedded in job data
  metadata: {
    correlationId: 'tx-12345-settlement',
    user: {
      sub: 'user-john-uuid',
      tenant: 'org-acme',
      roles: ['customer', 'premium'],
      displayName: 'John Doe',
      email: 'john@acme.com',
      // ...complete IUserToken shape
    },
    source: 'transaction-service',
    timestamp: new Date(),
    businessContext: {
      transactionType: 'payment',
      riskLevel: 'low',
    },
  },
});

// ✅ Example usage with system user
await queue.add('data.cleanup.expired.v1', cleanupData, {
  priority: PRIORITY_LEVELS.LOW,
  metadata: {
    correlationId: 'cleanup-daily-run',
    user: {
      sub: 'system',
      tenant: 'org-acme',
      roles: ['system'],
      displayName: 'System',
    },
    source: 'background-scheduler',
    timestamp: new Date(),
    businessContext: {
      jobType: 'maintenance',
      schedule: 'daily',
    },
  },
});
```

---

## 📋 **Architecture Decision Records**

### ADR-001: Domain-Owned Queue Operations

**Decision**: Each domain module owns its queue operations rather than using shared strategies.

**Rationale**:

- **Better encapsulation**: Domain logic stays within domain boundaries
- **Cleaner dependencies**: No shared strategy classes between domains
- **Easier testing**: Each domain can mock its own queue dependencies
- **Scalable**: New domains don't affect existing queue operations

**Implementation**:

- Each domain defines its own message queue interface
- Infrastructure implements the interface using IGenericQueue
- No shared strategy pattern or cross-domain dependencies

### ADR-002: Symbol-Based DI Tokens

**Decision**: Use Symbol-based dependency injection tokens instead of strings.

**Rationale**:

- **Collision prevention**: Symbols are unique and prevent naming conflicts
- **Type safety**: Better TypeScript support and IDE assistance
- **Refactoring safety**: Changes to token names caught at compile time

### ADR-003: BullMQ as Primary Queue Provider

**Decision**: Standardize on BullMQ with Redis backing for production.

**Rationale**:

- **Proven reliability**: Battle-tested in production environments
- **Rich feature set**: Job priorities, delays, retries, monitoring
- **Active ecosystem**: Good maintenance and community support
- **Redis integration**: Leverage existing Redis infrastructure

---

## 🚀 **Production Deployment Checklist**

### Environment Configuration

```env
# Redis Configuration
REDIS_HOST=prod-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure-password
REDIS_DB=0

# Queue Configuration
QUEUE_CONCURRENCY=10
QUEUE_RETRY_ATTEMPTS=3
QUEUE_DEFAULT_TIMEOUT=30000

# Monitoring
QUEUE_METRICS_ENABLED=true
QUEUE_HEALTH_CHECK_INTERVAL=30000
```

### Production Readiness

- [ ] **Redis cluster configured** with high availability
- [ ] **Queue monitoring** integrated with application observability
- [ ] **Dead letter queues** configured for failed jobs
- [ ] **Worker scaling** configured based on queue load
- [ ] **Alerting** set up for queue failures and backlogs
- [ ] **Job retention policies** configured for completed/failed jobs
- [ ] **Performance testing** completed under expected load
- [ ] **Disaster recovery** procedures documented

---

## 📚 **Additional Resources**

- **[BullMQ Documentation](https://docs.bullmq.io/)** - Official BullMQ guide
- **[Redis Best Practices](https://redis.io/docs/manual/patterns/)** - Redis optimization
- **[NestJS Queues](https://docs.nestjs.com/techniques/queues)** - NestJS queue integration
- **[Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)** - Architectural principles

---

**Status**: 🎯 **Production Roadmap**  
**Architecture**: ✅ **Clean & Domain-Driven**  
**Implementation**: 🏗️ **Greenfield Ready**  
**Last Updated**: August 11, 2025
