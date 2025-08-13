# COPILOT_INSTRUCTIONS — Outbox + BullMQ + EventStoreDB

> Authoritative guidance for generating code that implements our **Integration Outbox** with **BullMQ** dispatch and **EventStoreDB (ESDB)** as the domain event source. Aim: reliable, idempotent, horizontally scalable delivery of integration messages.

---

## 1) Scope & Goals

**In-scope**

- Mapping **ESDB domain events** → **integration outbox rows**
- Claiming, retrying, backoff, dead-lettering
- Dispatch via **BullMQ** workers (or direct adapters) to Kafka/Webhooks/Email/SMS/Slack/etc.
- End-to-end **idempotency** and **traceability** (correlation/tenant/user)

**Out of scope**

- Domain aggregate design (covered in general COPILOT doc)
- Non-outbox projections (Redis, SQL read models)

**Delivery guarantee**: At-least-once from ESDB to outbox; at-least-once from outbox to external systems; effective **exactly-once** with proper idempotency keys.

---

## 2) Architecture at a Glance

1. **ESDB** holds domain events (immutable, versioned).
2. **Outbox Projector** subscribes to ESDB (filtered by event-type/stream), maps relevant domain events to **integration messages**, and writes them into `integration_outbox` with status `PENDING`.
3. **Dispatcher** periodically **claims due** outbox rows using cooperative locking, then either:

   - **A)** Directly publishes via an adapter, or
   - **B)** Enqueues a minimal job onto **BullMQ** per channel (recommended for parallelism & isolation).

4. **Workers** perform the actual send, report back success/failure → repository marks `SENT` / schedules retry or `DEAD`.

> **Invariant**: Outbox is the **source of truth** for integration delivery state.

---

## 3) Data Shapes & Contracts

### 3.1 Outbox entity (TypeORM + Postgres)

```ts
export enum OutboxStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  SENT = 'SENT',
  FAILED = 'FAILED',
  DEAD = 'DEAD',
}

@Entity({ name: 'integration_outbox', schema: 'core_outbox' })
@Index(['dueAt', 'status'])
@Index(['status'])
@Index(['sourceStreamId', 'sourceEventId'], { unique: true }) // idempotency fence
export class IntegrationOutboxEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'varchar', length: 200 }) sourceStreamId!: string; // ESDB stream
  @Column({ type: 'varchar', length: 100 }) sourceEventId!: string; // ESDB eventId

  @Column({ type: 'varchar', length: 120 }) integrationType!: string; // e.g., 'kafka:payments'
  @Column({ type: 'varchar', length: 120 }) eventType!: string; // e.g., 'payment.completed.v1'

  @Column({ type: 'jsonb' }) payload!: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true }) headers?: Record<string, any>;

  @Column({ type: 'varchar', length: 60, nullable: true }) tenantId?: string;
  @Column({ type: 'varchar', length: 60, nullable: true }) userId?: string;
  @Column({ type: 'varchar', length: 120, nullable: true })
  correlationId?: string;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  dueAt!: Date;
  @Column({ type: 'int', default: 0 }) attempts!: number;
  @Column({ type: 'int', default: 10 }) maxAttempts!: number;

  @Column({ type: 'varchar', length: 20, default: OutboxStatus.PENDING })
  status!: OutboxStatus;
  @Column({ type: 'timestamp with time zone', nullable: true }) lockedAt?: Date;
  @Column({ type: 'varchar', length: 120, nullable: true }) lockedBy?: string;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
  @Column({ type: 'timestamp with time zone', nullable: true }) sentAt?: Date;
  @Column({ type: 'text', nullable: true }) lastError?: string;
}
```

> Unique `(sourceStreamId, sourceEventId)` guarantees that the **same ESDB event** is enqueued **only once**.

### 3.2 Repository contract

```ts
export interface EnqueueOutboxProps {
  sourceStreamId: string;
  sourceEventId: string;
  integrationType: string; // routing, e.g. 'kafka:payments' | 'webhook:partnerX'
  eventType: string; // semantic type, e.g. 'payment.completed.v1'
  payload: Record<string, any>;
  headers?: Record<string, any>;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  dueAt?: Date;
  maxAttempts?: number; // default 10
}

export abstract class OutboxRepository {
  abstract enqueue(item: EnqueueOutboxProps): Promise<IntegrationOutboxEntity>;
  abstract claimDueBatch(
    workerId: string,
    limit: number,
  ): Promise<IntegrationOutboxEntity[]>;
  abstract markSent(id: string): Promise<void>;
  abstract markFailed(
    id: string,
    error: string,
    nextDueAt: Date,
    attempts: number,
  ): Promise<void>;
  abstract deadLetter(id: string, error: string): Promise<void>;
  abstract release(id: string): Promise<void>;
}
```

### 3.3 ESDB metadata (required fields on serialized events)

```ts
export interface EventStoreMetaProps {
  correlationId: string; // trace across services
  tenantId?: string; // multi-tenant segregation
  userId?: string; // actor (may be service user)
  source: string; // originating module/service
  occurredAt: string; // ISO timestamp
  headers?: Record<string, any>; // ext. tracing, idempotencyKey, etc.
}
```

---

## 4) ESDB → Outbox Mapping (Projector)

**Pattern**: subscribe to ESDB using a filtered `$all` (event-type prefix or regex) or persistent subscription with checkpointing. For each matching domain event, **map** to an integration outbox item.

```ts
@Injectable()
export class EsdbToOutboxProjector {
  constructor(
    private readonly esdb: EventStoreService, // wrapper around ESDB client
    private readonly outbox: OutboxRepository,
    private readonly mapper: IntegrationEventMapper,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {}

  async start() {
    await this.esdb.subscribeByEventTypePrefix(
      ['payment.', 'account.'],
      async (evt) => {
        const mapped = this.mapper.map(evt); // null if ignore
        if (!mapped) return;

        try {
          await this.outbox.enqueue({
            sourceStreamId: evt.streamId,
            sourceEventId: evt.id,
            integrationType: mapped.integrationType,
            eventType: mapped.eventType,
            payload: mapped.payload,
            headers: { ...(mapped.headers ?? {}), idempotencyKey: evt.id },
            correlationId: evt.meta?.correlationId,
            tenantId: evt.meta?.tenantId,
            userId: evt.meta?.userId,
            dueAt: new Date(),
          });
        } catch (err: any) {
          // Unique constraint means already enqueued → safe to ignore
          this.logger.warn({
            msg: 'Outbox enqueue failed',
            err: String(err),
            eventId: evt.id,
          });
        }
      } /* checkpoint store */,
    );
  }
}
```

**Mapping rule of thumb**

- Keep **payload minimal** (identifiers + required fields). Do not embed large blobs.
- Preserve **eventType** and **correlationId**.
- Add an **idempotencyKey** suitable for the target system (often `sourceEventId`).

---

## 5) Claiming & Concurrency (TypeORM + Postgres)

Use `SKIP LOCKED` with a pessimistic write lock to enable multi-worker concurrency without double-claims.

```ts
async claimDueBatch(workerId: string, limit: number) {
  return this.ds.transaction(async (mngr) => {
    const rows = await mngr
      .createQueryBuilder(IntegrationOutboxEntity, 'o')
      .setLock('pessimistic_write')
      .useTransaction(true)
      .where('o.status = :s', { s: OutboxStatus.PENDING })
      .andWhere('o.dueAt <= now()')
      .orderBy('o.dueAt', 'ASC')
      .limit(limit)
      .skipLocked()
      .getMany();

    if (!rows.length) return [];

    const now = new Date();
    await Promise.all(rows.map(r => mngr.update(
      IntegrationOutboxEntity,
      { id: r.id, status: OutboxStatus.PENDING },
      { status: OutboxStatus.CLAIMED, lockedBy: workerId, lockedAt: now },
    )));

    return rows.map(r => ({ ...r, status: OutboxStatus.CLAIMED, lockedBy: workerId, lockedAt: now }));
  });
}
```

> **SQLite/MySQL**: If `SKIP LOCKED` isn’t available, fall back to an atomic update with a `WHERE status='PENDING' AND dueAt<=now()` condition and `RETURNING`/`ROW_COUNT()` to emulate claiming.

---

## 6) Dispatch Strategy

Two supported strategies:

**A) Direct dispatch in the dispatcher loop**

- Pros: fewer moving parts
- Cons: long-running calls block the loop; less parallelism

**B) Enqueue claimed items onto BullMQ queues (recommended)**

- Pros: parallel workers per channel; retries/visibility; isolation per integration
- Cons: one more layer

**Routing**

- `integrationType` defines adapter & queue name, e.g. `kafka:payments`, `webhook:partnerX`, `email:transactional`.
- Convention: Queue name = `outbox:<integrationType>` (colon replaced with dash for Redis if preferred).

```ts
@Injectable()
export class OutboxDispatcherService {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly queueRouter: QueueRouter, // knows how to resolve BullMQ queues per integrationType
    @Inject('ILogger') private readonly logger: ILogger,
  ) {}

  private readonly workerId = `outbox-${process.pid}`;

  async tick(limit = 100) {
    const batch = await this.outbox.claimDueBatch(this.workerId, limit);
    for (const item of batch) {
      try {
        const queue = this.queueRouter.resolve(item.integrationType);
        await queue.add(
          item.eventType, // job name
          {
            outboxId: item.id,
            eventType: item.eventType,
            payload: item.payload,
            headers: item.headers,
            tenantId: item.tenantId,
            correlationId: item.correlationId,
            sourceEventId: item.sourceEventId,
          },
          {
            jobId: item.id, // idempotent enqueue
            attempts: 1, // retries handled by outbox, not BullMQ
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
        // Do not mark SENT yet — wait for worker callback/webhook
      } catch (err: any) {
        await this.handleFailure(item, err);
      }
    }
  }

  private async handleFailure(item: IntegrationOutboxEntity, err: any) {
    const attempts = (item.attempts ?? 0) + 1;
    const nextDueAt = this.backoff(attempts);
    if (attempts >= item.maxAttempts) {
      await this.outbox.deadLetter(item.id, String(err?.message ?? err));
    } else {
      await this.outbox.markFailed(
        item.id,
        String(err?.message ?? err),
        nextDueAt,
        attempts,
      );
    }
  }

  private backoff(attempts: number) {
    const base = Math.min(60_000 * 2 ** (attempts - 1), 15 * 60_000); // cap 15m
    const jitter = Math.floor(Math.random() * 10_000);
    return new Date(Date.now() + base + jitter);
  }
}
```

---

## 7) BullMQ Workers

**Job data shape (keep small)**

```ts
interface OutboxJobData {
  outboxId: string;
  eventType: string;
  payload: Record<string, any>;
  headers?: Record<string, any>;
  tenantId?: string;
  correlationId?: string;
  sourceEventId: string; // idempotency key downstream
}
```

**Worker responsibilities**

1. Translate `payload` to target protocol format
2. Call adapter (Kafka/Webhook/etc.) with **idempotency key**
3. On success → `outbox.markSent(outboxId)`
4. On failure → **do not throw to BullMQ for retries** (we centralize retries in outbox). Instead call `outbox.markFailed(...)`

```ts
const worker = new Worker<OutboxJobData>(
  'outbox-kafka-payments',
  async (job) => {
    const {
      outboxId,
      payload,
      headers,
      sourceEventId,
      tenantId,
      correlationId,
    } = job.data;
    try {
      await kafkaAdapter.publish({
        topic: 'payments',
        key: sourceEventId, // idempotency at broker/consumer side
        value: payload,
        headers: { ...(headers ?? {}), correlationId, tenantId },
      });
      await outbox.markSent(outboxId);
    } catch (err: any) {
      const attempts = (await repo.getAttempts(outboxId)) + 1; // or pass attempts in job
      const nextDueAt = backoff(attempts);
      if (attempts >= MAX_ATTEMPTS)
        await outbox.deadLetter(outboxId, String(err));
      else await outbox.markFailed(outboxId, String(err), nextDueAt, attempts);
    }
  },
  { connection: redisConnection },
);
```

> **Why not BullMQ retries?** We want a **single source of retry truth** (the outbox), independent of the worker queue mechanics. This simplifies observability and ensures retries are visible in one place.

---

## 8) Idempotency Strategy

- **Outbox fence**: `(sourceStreamId, sourceEventId)` unique index prevents duplicate enqueue.
- **Downstream**: use `sourceEventId` as the **message key** (Kafka), **Idempotency-Key** (HTTP), or dedupe key (email/SMS provider) when available.
- **Worker job**: set `jobId = outboxId` to avoid duplicate queueing.

---

## 9) Configuration & ENV

```env
# ESDB
ESDB_CONNECTION_STRING=esdb+discover://...
ESDB_SUBSCRIPTION_PREFIX=payment.

# OUTBOX
OUTBOX_CLAIM_BATCH_SIZE=100
OUTBOX_MAX_ATTEMPTS=10
OUTBOX_TICK_INTERVAL_MS=1000
OUTBOX_DEADLETTER_TOPIC=outbox.dead

# REDIS / BullMQ
REDIS_HOST=localhost
REDIS_PORT=6379

# ADAPTERS (examples)
KAFKA_BROKERS=broker1:9092,broker2:9092
WEBHOOK_TIMEOUT_MS=5000
```

**Guidelines**

- No secrets in code; read via ConfigService.
- Per-channel config lives in adapter modules.

---

## 10) Observability & Logging

Use `ILogger` and include at least: `correlationId`, `tenantId`, `userId?`, `source`, `operation`, `phase`.

- **Projector**: `operation=OUTBOX_ENQUEUE`, phases `START|SUCCESS|DUPLICATE|ERROR`
- **Dispatcher**: `operation=OUTBOX_CLAIM`, `OUTBOX_ENQUEUE_JOB`, `OUTBOX_DIRECT_SEND`
- **Worker**: `operation=OUTBOX_DELIVER`, outcomes `SENT|FAILED|DEAD`

**Metrics** (suggested counters/gauges)

- `outbox_pending_total`, `outbox_claimed_total`, `outbox_sent_total`, `outbox_failed_total`, `outbox_dead_total`
- `outbox_claim_duration_ms`, `outbox_delivery_duration_ms`

---

## 11) Error Handling & Backoff

- Exponential backoff with jitter: `min(60s * 2^(n-1), 15m) + [0..10s]`.
- Detect **non-retryable** errors (4xx from webhook) → dead-letter immediately.
- Preserve `lastError` (truncate to 5k chars to protect DB).

---

## 12) Multi-Tenancy & Throttling

- Store `tenantId` in outbox rows and propagate in headers.
- Optional: segment queues by tenant: `outbox:<integrationType>:<tenant>` when isolation needed.
- Add per-tenant rate limiting in workers if required by partner SLAs.

---

## 13) Migrations (SQL example)

```sql
CREATE SCHEMA IF NOT EXISTS core_outbox;
CREATE TABLE IF NOT EXISTS core_outbox.integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_stream_id varchar(200) NOT NULL,
  source_event_id varchar(100) NOT NULL,
  integration_type varchar(120) NOT NULL,
  event_type varchar(120) NOT NULL,
  payload jsonb NOT NULL,
  headers jsonb,
  tenant_id varchar(60),
  user_id varchar(60),
  correlation_id varchar(120),
  due_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 10,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  locked_at timestamptz,
  locked_by varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_source ON core_outbox.integration_outbox (source_stream_id, source_event_id);
CREATE INDEX IF NOT EXISTS ix_outbox_status_due ON core_outbox.integration_outbox (status, due_at);
```

---

## 14) Module Wiring (NestJS)

```
src/
  integration-outbox/
    domain/
      outbox.repository.ts
    infrastructure/
      entities/integration-outbox.entity.ts
      outbox.repository.typeorm.ts
      queue-router.ts
    application/
      esdb-to-outbox.projector.ts
      outbox-dispatcher.service.ts
      workers/
        kafka-payments.worker.ts
        webhook-partnerx.worker.ts
```

- Register `IntegrationOutboxEntity` in TypeORM module.
- Provide `OutboxRepository` with `TypeormOutboxRepository`.
- Provide `QueueRouter` with channel-specific BullMQ queues.
- Start `EsdbToOutboxProjector` on module init with a checkpoint store.
- Schedule `OutboxDispatcherService.tick()` via Cron or a BullMQ repeatable job.

---

## 15) Testing Strategy

**Unit**

- `IntegrationEventMapper.map(evt)` → expected `EnqueueOutboxProps`
- Backoff function edge cases; classify non-retryable errors

**Integration**

- Repository claim semantics (concurrency) — simulate two claimers → no overlap
- Projector idempotency on duplicate ESDB events (unique index holds)

**E2E**

- Emit test ESDB events → assert outbox row → dispatcher → worker → adapter spy → `SENT`
- Failure path → retries → `DEAD` after `maxAttempts`

> Use ESDB & Redis test containers. Adapters mocked (or local brokers/web servers).

---

## 16) Do / Don’t (Copilot Guardrails)

**Do**

- Keep job payloads small; pass IDs not blobs
- Centralize retries in **outbox**, not BullMQ
- Use `jobId = outboxId`
- Always include tracing fields (correlationId, tenantId)
- Cap backoff; add jitter

**Don’t**

- Don’t mutate event schemas or outbox rows in place for historical records
- Don’t perform business logic in workers; they are delivery-only
- Don’t block the dispatcher with long I/O — use BullMQ path
- Don’t log PII; prefer IDs

---

## 17) Example Copilot Prompts

- “Generate a **TypeORM OutboxRepository** with `enqueue`, `claimDueBatch` using `skipLocked`, `markSent`, `markFailed`, and `deadLetter`.”
- “Create an **ESDB → Outbox projector** subscribing by event-type prefix `payment.` and mapping `payment.completed.v1` to `kafka:payments` outbox rows; include correlation/tenant/user metadata.”
- “Scaffold an **Outbox dispatcher** that claims up to 100 items and enqueues jobs to BullMQ queues named `outbox:<integrationType>` with `jobId = outboxId`.”
- “Write a **BullMQ worker** for `outbox:kafka:payments` that publishes to Kafka with `key=sourceEventId`, then marks the outbox row as `SENT` on success or schedules retry on failure.”
- “Add **unit tests** for backoff calculation and idempotent enqueue (duplicate ESDB event does not create a second outbox row).”

---

## 18) Quick Checklist

- [ ] ESDB events carry `correlationId`, `tenantId`, `userId`, `source`, `occurredAt`
- [ ] Outbox unique `(sourceStreamId, sourceEventId)`
- [ ] Dispatcher uses `SKIP LOCKED` claim pattern
- [ ] Retries handled in outbox, not BullMQ
- [ ] Idempotency downstream via `sourceEventId`
- [ ] Logging with tracing fields; no PII
- [ ] Dead-letter after `maxAttempts`
- [ ] Tests for concurrency, idempotency, backoff

---

### Final note

Keep **Outbox** as the operational ledger for integration delivery. BullMQ is the execution engine; ESDB is the historical truth. Build adapters thin, deterministic, and idempotent.
