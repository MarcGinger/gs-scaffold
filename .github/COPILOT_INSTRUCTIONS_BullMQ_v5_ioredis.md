# COPILOT_INSTRUCTIONS — BullMQ v5 + ioredis (Direct Wiring)

> How we wire **BullMQ v5** directly with **ioredis** in NestJS (v11), aligned with our outbox-driven architecture. Keep workers lean, deterministic, and observable. BullMQ is the execution engine; retries and idempotency live in the outbox pattern.

---

## 1) Scope & Principles

**In scope**
- Creating **shared ioredis connections** and passing them into BullMQ `Queue`, `Worker`, and `QueueEvents` directly.
- Standard **job envelope** (metadata + payload) for consistent tracing.
- **Producers** (adding jobs), **Workers** (processing), **QueueEvents** (observability).
- Operational concerns: rate limiting, concurrency, graceful shutdown, health checks, logging, metrics.

**Out of scope**
- ESDB domain modeling or the Integration Outbox repository (covered elsewhere). Treat the outbox as the source of truth for retries and delivery state.

**Design principles**
- **Small payloads:** pass IDs and small scalars. Store large data elsewhere.
- **Idempotency by design:** use stable `jobId` and downstream idempotency keys; **do not** rely on BullMQ retries when using our outbox pattern.
- **Separation of concerns:** producers enqueue, workers deliver; outbox controls retry cadence.
- **Observability-first:** emit structured logs and key events by default.

---

## 2) Versions & Runtime

- **NestJS:** v11+
- **Node.js:** v20+
- **BullMQ:** v5.x
- **Redis client:** **ioredis** (single, TLS, sentinel, or cluster).

No `QueueScheduler` is needed in v5. Use `Queue`, `Worker`, and `QueueEvents` with shared ioredis connections.

---

## 3) Job Envelope & Metadata

All jobs carry a minimal, standard envelope for tracing across services and tenants.

```ts
// src/shared/message-queue/job.types.ts
export interface StandardJobMetadata {
  correlationId: string;   // required for end-to-end tracing
  source: string;          // originating module/service (e.g., 'NotificationModule')
  timestamp: string;       // ISO 8601
  tenantId?: string;       // multi-tenant context
  userId?: string;         // actor if relevant
  businessContext?: any;   // small, non-sensitive context
}

export interface AppJob<TPayload = Record<string, unknown>> {
  meta: StandardJobMetadata;
  payload: TPayload;       // small; pass IDs where possible
}
```

**Rule of thumb:** job payloads should be < 10 KB. Use IDs to fetch data if needed.

---

## 4) Redis Module (shared ioredis providers)

We use **two** connections:
- **Producer connection:** `enableOfflineQueue: false` (fail fast if Redis is down).
- **Worker/events connection:** allow offline queue & retries to tolerate brief outages.

```ts
// src/shared/redis/redis.module.ts
import { Module } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';

export const REDIS_PRODUCER = Symbol('REDIS_PRODUCER');
export const REDIS_WORKER = Symbol('REDIS_WORKER');

@Module({
  providers: [
    {
      provide: REDIS_PRODUCER,
      useFactory: (): Redis =>
        new IORedis(process.env.REDIS_URL!, {
          enableOfflineQueue: false, // producers should fail fast
          keyPrefix: process.env.REDIS_PREFIX ?? 'app:dev:',
          maxRetriesPerRequest: 1,
        }),
    },
    {
      provide: REDIS_WORKER,
      useFactory: (): Redis =>
        new IORedis(process.env.REDIS_URL!, {
          keyPrefix: process.env.REDIS_PREFIX ?? 'app:dev:',
          maxRetriesPerRequest: null, // allow long-running commands
          // tls: { rejectUnauthorized: true }, // if using TLS
        }),
    },
  ],
  exports: [REDIS_PRODUCER, REDIS_WORKER],
})
export class RedisModule {}
```

> For **Sentinel** or **Cluster**, construct connections with the corresponding ioredis constructors and keep the same DI tokens.

---

## 5) BullMQ Module (direct wiring, no wrapper)

Provide queue factories, worker factories, and `QueueEvents`. Centralize defaults here.

```ts
// src/shared/message-queue/bullmq.module.ts
import { Module, Inject, Global } from '@nestjs/common';
import { Queue, QueueEvents, Worker, type Processor, type QueueOptions, type WorkerOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS_PRODUCER, REDIS_WORKER } from '../redis/redis.module';

export const QUEUE_FACTORY = Symbol('QUEUE_FACTORY');
export const WORKER_FACTORY = Symbol('WORKER_FACTORY');
export const EVENTS_FACTORY = Symbol('EVENTS_FACTORY');

@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: QUEUE_FACTORY,
      useFactory: (@Inject(REDIS_PRODUCER) producer: Redis) => {
        return (name: string, opts: Omit<QueueOptions, 'connection'> = {}) =>
          new Queue(name, { connection: producer, defaultJobOptions: { removeOnComplete: true }, ...opts });
      },
      inject: [REDIS_PRODUCER],
    },
    {
      provide: WORKER_FACTORY,
      useFactory: (@Inject(REDIS_WORKER) workerConn: Redis) => {
        return <T = any>(
          name: string,
          processor: Processor<T>,
          opts: Partial<WorkerOptions> = {},
        ) => {
          const worker = new Worker<T>(name, processor, {
            connection: workerConn,
            // Sensible defaults; tweak per queue
            concurrency: 8,
            lockDuration: 30_000, // match expected job duration
            // limiter: { max: 100, duration: 1000 }, // enable if rate-limiting is needed
            ...opts,
          });
          return worker;
        };
      },
      inject: [REDIS_WORKER],
    },
    {
      provide: EVENTS_FACTORY,
      useFactory: (@Inject(REDIS_WORKER) workerConn: Redis) => {
        return (name: string) => new QueueEvents(name, { connection: workerConn });
      },
      inject: [REDIS_WORKER],
    },
  ],
  exports: [QUEUE_FACTORY, WORKER_FACTORY, EVENTS_FACTORY],
})
export class BullmqModule {}
```

---

## 6) Queue Router & Naming

Keep queue names stable and human-readable. If integrating with the outbox, route by `integrationType`.

```ts
// src/shared/message-queue/queue-router.ts
import { Injectable, Inject } from '@nestjs/common';
import { QUEUE_FACTORY } from './bullmq.module';

type QueueFactoryFn = (name: string) => any;

@Injectable()
export class QueueRouter {
  constructor(@Inject(QUEUE_FACTORY) private readonly createQueue: QueueFactoryFn) {}

  // Example: integrationType 'kafka:payments' -> 'outbox-kafka-payments'
  resolve(integrationType: string) {
    const safe = integrationType.replace(/:/g, '-');
    return this.createQueue(`outbox-${safe}`);
  }

  // For business queues
  notificationsEmail() { return this.createQueue('notifications-email'); }
  notificationsSlack() { return this.createQueue('notifications-slack'); }
}
```

---

## 7) Producers (adding jobs)

- **Idempotency:** set a stable `jobId` (e.g., outbox row ID or a correlation ID).
- **Retries:** when using the outbox pattern, set `attempts: 1` (retries happen via outbox rescheduling).

```ts
// src/modules/notifications/application/notifications.producer.ts
import { Injectable, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueRouter } from '../../../shared/message-queue/queue-router';
import { AppJob } from '../../../shared/message-queue/job.types';

@Injectable()
export class NotificationsProducer {
  constructor(private readonly queues: QueueRouter) {}

  async sendEmail(job: AppJob<{ messageId: string }>) {
    const queue: Queue = this.queues.notificationsEmail();
    await queue.add('send-email', job, {
      jobId: job.meta.correlationId, // or outboxId if tied to outbox
      attempts: 1,                   // retries handled elsewhere
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
```

**Delayed job**

```ts
await queue.add('send-email', job, { delay: 5_000, jobId: job.meta.correlationId, attempts: 1 });
```

**Repeatable job** (cron-style heartbeat)

```ts
await queue.add('dispatcher-tick', { meta, payload: {} }, {
  repeat: { cron: '*/1 * * * *' },
  removeOnComplete: true,
  jobId: `dispatcher-tick:${meta.tenantId ?? 'default'}`,
  attempts: 1,
});
```

> Even with repeatables, keep the work fast; push heavy work into dedicated workers and keep repeat ticks light.

---

## 8) Workers (processing)

Workers should be **delivery-only**. Business logic lives in use-cases; retries live in the outbox (if used).

```ts
// src/modules/notifications/workers/notifications-email.worker.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { WORKER_FACTORY, EVENTS_FACTORY } from '../../../shared/message-queue/bullmq.module';
import { ILogger } from '../../../shared/logger'; // your abstraction
import { AppJob } from '../../../shared/message-queue/job.types';

type WorkerFactoryFn = <T>(name: string, processor: (job: Job<T>) => Promise<void>) => Worker;
type EventsFactoryFn = (name: string) => any;

@Injectable()
export class NotificationsEmailWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | undefined;
  private events: any | undefined;

  constructor(
    @Inject(WORKER_FACTORY) private readonly createWorker: WorkerFactoryFn,
    @Inject(EVENTS_FACTORY) private readonly createEvents: EventsFactoryFn,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {}

  onModuleInit() {
    this.worker = this.createWorker<AppJob<{ messageId: string }>>('notifications-email', async (job) => {
      const { meta, payload } = job.data;
      const ctx = { ...meta, queue: 'notifications-email', jobId: job.id };

      this.logger.info({ ...ctx, phase: 'START' }, 'Email delivery start');
      try {
        // Translate payload -> adapter call
        // await emailAdapter.send(payload.messageId);
        this.logger.info({ ...ctx, phase: 'END' }, 'Email delivery success');
      } catch (err: any) {
        // Do not throw to trigger BullMQ retries if outbox controls retries.
        this.logger.warn({ ...ctx, phase: 'ERROR', err: String(err?.message ?? err) }, 'Email delivery failed');
        // Option A: Leave job failed to inspect in UI; Option B: rethrow to mark failed.
        // If using outbox control, generally: rethrow to mark failed then outbox will reschedule.
        throw err;
      }
    });

    this.events = this.createEvents('notifications-email');
    this.events.on('completed', ({ jobId, returnvalue }) =>
      this.logger.info({ queue: 'notifications-email', jobId, returnvalue }, 'Job completed'));
    this.events.on('failed', ({ jobId, failedReason }) =>
      this.logger.warn({ queue: 'notifications-email', jobId, failedReason }, 'Job failed'));
    this.events.on('stalled', ({ jobId }) =>
      this.logger.warn({ queue: 'notifications-email', jobId }, 'Job stalled'));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.events?.close();
  }
}
```

**Notes**
- If the **outbox** is the retry authority, set producer `attempts: 1`, and **throw on failure** in the worker to mark the BullMQ job failed (non-retried). The outbox will enqueue a new job on its next scheduled attempt.
- If you are **not** using outbox for a given queue, you can configure BullMQ retries via `attempts` & `backoff`.

---

## 9) Logging & Metrics

Always log with the tracing metadata (`correlationId`, `tenantId`, `source`, `timestamp`). Suggested counters/gauges:
- `bullmq_jobs_completed_total{queue}`
- `bullmq_jobs_failed_total{queue}`
- `bullmq_jobs_active{queue}`
- `bullmq_job_duration_ms{queue}`

Integrate with your Prometheus/Grafana pipeline via a small metrics adapter (optional).

---

## 10) Rate Limiting & Concurrency

- Prefer **worker-level `concurrency`** (e.g., 4–16) sized to external adapter capacity.
- For external API quotas, enable `limiter` on the worker:
  ```ts
  const worker = new Worker(name, processor, {
    connection,
    concurrency: 6,
    limiter: { max: 60, duration: 1000 }, // 60 jobs/sec cap
  });
  ```

---

## 11) Health Checks & Graceful Shutdown

**Health**
- `await producer.ping()` on the ioredis connection (or a simple `get`/`set` test key).
- Optionally check queue latency by counting waiting/active jobs (`Queue#getJobCounts`).

**Shutdown**
- Implement `onModuleDestroy`/`beforeApplicationShutdown` to `close()` all Workers, Queues, and QueueEvents.
- Allow in-flight jobs to finish; if you need hard timeouts, use `worker.close(true)`/process signals.

---

## 12) Configuration (ENV)

```env
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=app:dev:

# Example queue tuning
EMAIL_WORKER_CONCURRENCY=8
SLACK_WORKER_CONCURRENCY=4
```

Centralize reading via `@nestjs/config` and inject into worker/queue initializers.

---

## 13) Testing Strategy

**Unit**
- Test processors with mocked adapters; assert logs and error paths.

**Integration**
- Use a Docker Redis locally; verify `Queue.add` → `Worker` receives → `QueueEvents` fire.
- Test idempotent add (`jobId`) and ensure duplicate adds coalesce.

**E2E (with outbox)**
- Out of scope here; ensure that failed jobs trigger outbox rescheduling, not BullMQ retries.

---

## 14) Migration Tips (v4 → v5)

- No `QueueScheduler` required.
- Keep using `Queue.add` for repeatables (`repeat` option); validate cron & timezone behavior.
- Review worker options (e.g., `concurrency`, `lockDuration`), as defaults may differ slightly.

---

## 15) Quick Reference Snippets

**Create queue directly with shared producer connection**
```ts
const queue = new Queue('notifications-email', { connection: producerConn });
```

**Add idempotent job**
```ts
await queue.add('send-email', { meta, payload }, { jobId: meta.correlationId, attempts: 1 });
```

**Worker with concurrency & limiter**
```ts
const worker = new Worker('notifications-email', processor, {
  connection: workerConn,
  concurrency: 8,
  limiter: { max: 100, duration: 1000 },
});
```

**Queue events**
```ts
const events = new QueueEvents('notifications-email', { connection: workerConn });
events.on('completed', console.log);
events.on('failed', console.warn);
```

**Graceful shutdown**
```ts
await worker.close();
await events.close();
await queue.close();
```

---

## 16) Copilot Prompts

- “Create a NestJS **RedisModule** that provides two ioredis connections (producer & worker) with different options and exports them via DI tokens.”
- “Scaffold a **BullmqModule** exposing `QUEUE_FACTORY`, `WORKER_FACTORY`, and `EVENTS_FACTORY` that consume those Redis connections.”
- “Generate a **QueueRouter** that maps logical names like `notifications-email` and `outbox:<type>` to queues.”
- “Implement a **NotificationsEmailWorker** with structured logs, concurrency=8, and graceful shutdown.”
- “Add a **producer** that enqueues idempotent jobs with `jobId=correlationId` and `attempts=1`.”

---

### Final note

BullMQ v5 + ioredis works great without any extra Nest wrappers. Keep the module tiny, pass shared connections, and let the **outbox** control retries/idempotency while workers focus exclusively on delivery.
