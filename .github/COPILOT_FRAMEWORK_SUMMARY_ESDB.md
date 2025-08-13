# COPILOT_INSTRUCTIONS.md — Durable, Shared EventStoreDB Service for NestJS

> Production-grade guidance so GitHub Copilot can scaffold correct, consistent code across the platform.

---

## Scope

This document standardizes how we write to, read from, and project out of **EventStoreDB (ESDB)** using NestJS. It covers:

- Stream & event naming, metadata, and idempotency
- **Append** with optimistic concurrency + retries
- **Aggregate load** with snapshot catch-up
- **SnapshotRepository** stored in ESDB (Redis-accelerated)
- **Catch-up** & **Persistent** subscription runners with checkpointing
- **Outbox → BullMQ v5** bridge (shared ioredis)
- Resilience, metrics, logging, and test strategy

All examples assume **NestJS v11**, **@eventstore/db-client** latest, **BullMQ v5**, and **ioredis**.

---

## TL;DR Checklists

### Writes (Command Side)

- ✅ Use `expectedRevision` everywhere (optimistic concurrency)
- ✅ Include `commandId` in metadata for **idempotency**
- ✅ Never mutate old events; version event types (e.g., `.v1`, `.v2`)
- ✅ On `WrongExpectedVersion` → reload, revalidate, decide, re-append (or reject)
- ✅ External effects via **Outbox → BullMQ** (never inline side effects in command)

### Reads (Query Side / Aggregates)

- ✅ Load latest **snapshot** (if any), then read stream from `snapshot.version + 1`
- ✅ Upcast legacy events in-memory (pure functions)
- ✅ Snapshot on thresholds (event count / load time / state size)

### Projections (Read Models)

- ✅ Consume **filtered `$all`** by eventType prefix (not `$ce-*`)
- ✅ Keep a durable **checkpoint** (Redis or SQL) and **idempotent** handlers
- ✅ Partition work by `streamId` hash to preserve per-aggregate order

### Observability & Resilience

- ✅ CorrelationId, CausationId, CommandId in every log/event
- ✅ Backoff & circuit breakers on ESDB connection
- ✅ Metrics: write latency, subscription lag, projector success/fail, parked counts

---

## Naming & Keys

### Stream ID (aggregate instance)

```
<context>.<aggregate>.v<aggSchema>-<tenant>-<entityId>
# e.g. banking.currency.v1-core-USD
```

### Snapshot Stream ID

```
snap.<context>.<aggregate>.v<aggSchema>-<tenant>-<entityId>
# e.g. snap.banking.currency.v1-core-USD
```

### Event Type (semantic + versioned)

```
<context>.<aggregate>.<action>.v<eventSchema>
# e.g. banking.currency.created.v1
```

---

## Shared Types

```ts
// domain/events.ts
export type EventMeta = {
  eventId: string; // GUID
  correlationId: string; // trace across services
  causationId: string; // prior event/command id
  commandId: string; // idempotency key
  tenant: string; // 'core', 'acme', ...
  user?: { id: string; email?: string; name?: string };
  source: string; // service/module name
  occurredAt: string; // ISO timestamp
  schemaVersion: number; // payload schema version
  contentType?: 'application/json+domain';
};

export type EventEnvelope<T> = {
  type: string; // event type name (versioned)
  data: T; // payload
  metadata: EventMeta; // uniform envelope
};

export type Snapshot<TState> = {
  aggregate: string; // banking.currency
  aggregateSchema: number; // e.g., 1
  tenant: string;
  entityId: string;
  state: TState; // serialized aggregate state
  version: number; // aggregate version at capture
  streamPosition: bigint; // commit/prepare or revision marker
  takenAt: string; // ISO timestamp
};
```

---

## EventStore Module (NestJS)

```ts
// infrastructure/eventstore/eventstore.module.ts
import { Module, Global } from '@nestjs/common';
import { EventStoreService } from './eventstore.service';

@Global()
@Module({
  providers: [EventStoreService],
  exports: [EventStoreService],
})
export class EventStoreModule {}
```

```ts
// infrastructure/eventstore/eventstore.service.ts
import {
  EventStoreDBClient,
  jsonEvent,
  JSONEventType,
  START,
  NO_STREAM,
  appendToStreamOpts,
  WrongExpectedVersionError,
  ReadStreamOptions,
} from '@eventstore/db-client';
import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope } from '../../domain/events';

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);
  private readonly client: EventStoreDBClient;

  constructor() {
    // Prefer connection via env (gRPC/TLS) and service discovery in prod
    this.client = new EventStoreDBClient({
      endpoint: process.env.ESDB_ENDPOINT!, // e.g., esdb://host:2113?tls=true
    });
  }

  /** Append events with optimistic concurrency + structured logging */
  async append<T>(
    streamId: string,
    events: Array<EventEnvelope<T>>,
    expectedRevision: bigint | typeof NO_STREAM,
    retries = 2,
  ) {
    const toJson = (e: EventEnvelope<T>) =>
      jsonEvent<T>({
        type: e.type as JSONEventType,
        data: e.data,
        metadata: e.metadata,
      });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.client.appendToStream(
          streamId,
          events.map(toJson),
          { expectedRevision } as appendToStreamOpts,
        );
        this.logger.debug(
          { streamId, nextExpectedRevision: result.nextExpectedRevision },
          'append.success',
        );
        return result;
      } catch (err) {
        if (err instanceof WrongExpectedVersionError && attempt < retries) {
          this.logger.warn(
            { streamId, attempt },
            'append.retry.wrongExpectedVersion',
          );
          continue; // let caller reload aggregate and retry or bump snapshot policy
        }
        this.logger.error({ streamId, err }, 'append.failed');
        throw err;
      }
    }
  }

  /** Read a stream forward from a given revision */
  readStream<T = any>(streamId: string, options?: ReadStreamOptions) {
    return this.client.readStream(streamId, options);
  }

  /** Subscribe to $all with filters (used by projection runners) */
  subscribeToAll(options: Parameters<EventStoreDBClient['subscribeToAll']>[0]) {
    return this.client.subscribeToAll(options);
  }

  /** Persistent subscription utilities could be added here as well */
  persistent = {
    create: (stream: string, group: string, settings?: any) =>
      this.client.createPersistentSubscriptionToStream(stream, group, settings),
    connect: (stream: string, group: string, options?: any) =>
      this.client.subscribeToPersistentSubscriptionToStream(
        stream,
        group,
        options,
      ),
  };
}
```

---

## Aggregate Repository with Snapshot Catch-up

```ts
// infrastructure/eventstore/aggregate.repository.ts
import { Injectable } from '@nestjs/common';
import { EventStoreService } from './eventstore.service';
import { START } from '@eventstore/db-client';
import { SnapshotRepository } from './snapshot.repository';

export interface Reducer<State> {
  initial(): State;
  apply(state: State, event: { type: string; data: any; metadata: any }): State;
}

@Injectable()
export class AggregateRepository<State> {
  constructor(
    private readonly es: EventStoreService,
    private readonly snapshots: SnapshotRepository<State>,
  ) {}

  async load(
    context: string,
    aggregate: string,
    aggSchema: number,
    tenant: string,
    entityId: string,
    reducer: Reducer<State>,
  ): Promise<{ state: State; version: number }> {
    const streamId = `${context}.${aggregate}.v${aggSchema}-${tenant}-${entityId}`;
    const snapId = `snap.${context}.${aggregate}.v${aggSchema}-${tenant}-${entityId}`;

    const snap = await this.snapshots.loadLatest(snapId);
    let state = snap?.state ?? reducer.initial();
    let version = snap?.version ?? -1;

    const fromRevision = snap ? BigInt(snap.version + 1) : START;
    const read = this.es.readStream(streamId, { fromRevision });

    for await (const resolved of read) {
      if (!resolved.event) continue;
      const { event } = resolved;
      state = reducer.apply(state, {
        type: event.type,
        data: event.data,
        metadata: event.metadata,
      });
      version++;
    }

    return { state, version };
  }
}
```

---

## SnapshotRepository (ESDB-backed + optional Redis cache)

```ts
// infrastructure/eventstore/snapshot.repository.ts
import { Injectable } from '@nestjs/common';
import { EventStoreDBClient, jsonEvent } from '@eventstore/db-client';
import { Snapshot } from '../../domain/events';
import { Redis } from 'ioredis';

@Injectable()
export class SnapshotRepository<State> {
  constructor(
    private readonly client: EventStoreDBClient,
    private readonly redis?: Redis, // optional hot cache
  ) {}

  private redisKey(streamId: string) {
    return `snapshot:${streamId}`;
  }

  async loadLatest(streamId: string): Promise<Snapshot<State> | null> {
    // Hot path: Redis
    if (this.redis) {
      const cached = await this.redis.get(this.redisKey(streamId));
      if (cached) return JSON.parse(cached);
    }

    // Source of truth: ESDB (last event only)
    const read = this.client.readStream<Snapshot<State>>(streamId, {
      direction: 'backwards',
      maxCount: 1,
    });
    for await (const r of read) {
      if (!r.event) continue;
      const snap = r.event.data as Snapshot<State>;
      if (this.redis)
        await this.redis.set(this.redisKey(streamId), JSON.stringify(snap));
      return snap;
    }
    return null;
  }

  async save(streamId: string, snapshot: Snapshot<State>) {
    await this.client.appendToStream(streamId, [
      jsonEvent<Snapshot<State>>({ type: 'snapshot', data: snapshot }),
    ]);
    if (this.redis)
      await this.redis.set(this.redisKey(streamId), JSON.stringify(snapshot));
  }
}
```

---

## Checkpoint Store (Redis) & Interfaces

```ts
// infrastructure/projections/checkpoint.store.ts
export interface CheckpointStore {
  get(key: string): Promise<string | null>;
  set(key: string, position: string): Promise<void>;
}

export class RedisCheckpointStore implements CheckpointStore {
  constructor(private readonly redis: import('ioredis').Redis) {}
  async get(key: string) {
    return this.redis.get(`checkpoint:${key}`);
  }
  async set(key: string, position: string) {
    await this.redis.set(`checkpoint:${key}`, position);
  }
}
```

---

## Catch-up Subscription Runner (filtered `$all`)

```ts
// infrastructure/projections/catchup.runner.ts
import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from '../eventstore/eventstore.service';
import { eventTypeFilter, START } from '@eventstore/db-client';
import { CheckpointStore } from './checkpoint.store';

export type ProjectFn = (evt: {
  type: string;
  data: any;
  metadata: any;
  streamId: string;
  revision?: bigint;
}) => Promise<void>;

@Injectable()
export class CatchUpRunner {
  private readonly logger = new Logger(CatchUpRunner.name);

  constructor(
    private readonly es: EventStoreService,
    private readonly checkpoints: CheckpointStore,
  ) {}

  async run(group: string, prefixes: string[], project: ProjectFn) {
    const key = group;
    const posStr = await this.checkpoints.get(key);

    const sub = this.es.subscribeToAll({
      fromPosition: posStr
        ? { commit: BigInt(posStr), prepare: BigInt(posStr) }
        : START,
      filter: eventTypeFilter({ prefixes }),
    });

    for await (const res of sub) {
      try {
        if (!res.event) continue;
        const { event } = res;
        await project({
          type: event.type,
          data: event.data,
          metadata: event.metadata,
          streamId: event.streamId!,
          revision: event.revision,
        });
        if (res.commitPosition) {
          await this.checkpoints.set(key, res.commitPosition.toString());
        }
      } catch (err) {
        this.logger.error({ group, err }, 'projection.failed');
        // Optionally: push to DLQ / park list; keep going or stop based on policy
      }
    }
  }
}
```

---

## Persistent Subscription Runner

```ts
// infrastructure/projections/persistent.runner.ts
import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from '../eventstore/eventstore.service';

@Injectable()
export class PersistentRunner {
  private readonly logger = new Logger(PersistentRunner.name);

  constructor(private readonly es: EventStoreService) {}

  async ensureAndRun(
    stream: string,
    group: string,
    project: (e: any) => Promise<void>,
  ) {
    // Ensure group exists (idempotent pattern)
    try {
      await this.es.persistent.create(stream, group, { resolveLinkTos: true });
    } catch (e) {
      /* already exists */
    }

    const sub = this.es.persistent.connect(stream, group, { bufferSize: 32 });

    for await (const { event, ack, nack } of sub) {
      if (!event) {
        ack();
        continue;
      }
      try {
        await project({
          type: event.type,
          data: event.data,
          metadata: event.metadata,
          streamId: event.streamId,
        });
        ack();
      } catch (err) {
        this.logger.error({ stream, group, err }, 'persistent.project.failed');
        // policy: retry | park
        nack('park');
      }
    }
  }
}
```

---

## Outbox → BullMQ v5 Bridge (shared ioredis)

### Minimal Entities & Ports

```ts
// infrastructure/outbox/outbox.entity.ts
export interface OutboxRecord {
  id: string; // UUID
  eventId: string; // ESDB event id
  type: string; // domain event type
  payload: any; // original event payload
  metadata: any; // envelope
  status: 'pending' | 'published' | 'failed';
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}
```

```ts
// infrastructure/outbox/outbox.repository.ts
export interface OutboxRepository {
  add(records: OutboxRecord[]): Promise<void>;
  nextBatch(limit: number): Promise<OutboxRecord[]>;
  markPublished(ids: string[]): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}
```

### BullMQ Module (V5) with Shared ioredis

```ts
// infrastructure/queue/bullmq.module.ts
import { Global, Module } from '@nestjs/common';
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'IORedis',
      useFactory: () => new Redis(process.env.REDIS_URL!),
    },
    {
      provide: 'NotificationQueue',
      inject: ['IORedis'],
      useFactory: (conn: Redis) =>
        new Queue('notification', { connection: conn }),
    },
  ],
  exports: ['IORedis', 'NotificationQueue'],
})
export class BullMQModule {}
```

### Outbox Publisher (Cron/Runner)

```ts
// application/outbox/outbox.publisher.ts
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { OutboxRepository } from '../../infrastructure/outbox/outbox.repository';

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly notificationQueue: Queue,
  ) {}

  async publishBatch(limit = 100) {
    const items = await this.outbox.nextBatch(limit);
    for (const item of items) {
      try {
        await this.notificationQueue.add(
          item.type,
          {
            eventId: item.eventId,
            payload: item.payload,
            metadata: item.metadata,
          },
          {
            jobId: item.eventId, // idempotent
            removeOnComplete: true,
            attempts: 3,
          },
        );
        await this.outbox.markPublished([item.id]);
      } catch (err) {
        this.logger.error({ id: item.id, err }, 'outbox.publish.failed');
        await this.outbox.markFailed(item.id, String(err));
      }
    }
  }
}
```

### Worker Example (Transaction/Notification Processor)

```ts
// workers/notification.worker.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class NotificationWorker implements OnModuleInit {
  constructor(private readonly conn: Redis) {}

  async onModuleInit() {
    new Worker(
      'notification',
      async (job) => {
        const { eventId, payload, metadata } = job.data;
        // call channel adapter (slack/email/webhook). Ensure idempotency by eventId.
        return { ok: true, eventId };
      },
      { connection: this.conn },
    );
  }
}
```

---

## Resilience Policies

- **Connection**: gRPC keep-alives, jittered retries, circuit breaker at caller
- **Poison events**: for persistent subs use `nack('park')`; expose admin replay
- **Graceful shutdown**: stop pulling, finish in-flight, flush checkpoints
- **Ordering**: hash-by-`streamId` partitioning in projectors to avoid interleaving
- **Idempotency**: jobId = `eventId`; projection writes use "upsert if not seen"

---

## Metrics (Prometheus labels include tenant, context, service)

- `esdb_append_duration_ms` (histogram)
- `esdb_wrong_expected_version_total`
- `projection_lag_committed` (gauge)
- `projection_events_processed_total`
- `projection_errors_total`, `projection_parked_total`
- `snapshot_load_hits_total` / `misses_total`
- `aggregate_rehydrate_duration_ms`

---

## Logging (Pino)

Log each boundary with:

- `correlationId`, `causationId`, `commandId`
- `streamId`, `revision`, `tenant`
- `component`, `operation`, `outcome`

Example:

```ts
this.logger.debug(
  {
    component: 'EventStoreService',
    operation: 'append',
    outcome: 'success',
    correlationId: meta.correlationId,
    streamId,
  },
  'append.success',
);
```

---

## Testing Strategy

- **Unit**: reducers (pure), upcasters, idempotency guards
- **Integration**: ephemeral ESDB container; append → load → assert version/state
- **Projection**: run catch-up from START against a known fixture stream
- **Chaos**: inject WrongExpectedVersion; verify reload+retry logic
- **Perf**: measure rehydrate time → tune snapshot thresholds

---

## Copilot Prompt Snippets

> "Generate a NestJS `CurrencyAggregateRepository` that uses `AggregateRepository` with snapshot catch-up (schema v1), and reducers for `banking.currency.created.v1` and `banking.currency.renamed.v1`. Include idempotency by `commandId` in state."

> "Create a `PriceProjection` that uses `CatchUpRunner` filtered by `banking.price.` prefix, checkpoints in Redis, and upserts into Postgres with an idempotent `seen_events` table."

> "Scaffold an Outbox publisher that reads 100 records at a time, adds BullMQ jobs with `jobId = eventId`, and marks published."

---

## Env Expectations

```
ESDB_ENDPOINT=esdb://eventstore:2113?tls=false
REDIS_URL=redis://redis:6379
NODE_OPTIONS=--max-old-space-size=2048
```

---

## Do / Don’t Recap

**Do**

- Use `expectedRevision` + retries on append
- Snapshot aggressively for chatty aggregates
- Consume via filtered `$all` + durable checkpoints
- Keep events small and immutable; upcast on read

**Don’t**

- Rely on `$ce-*` in high-throughput paths
- Inline side-effects in command handlers (use Outbox → BullMQ)
- Share read DBs across bounded contexts

---

**End of instructions.**
