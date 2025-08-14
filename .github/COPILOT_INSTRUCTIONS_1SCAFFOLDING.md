# COPILOT_INSTRUCTIONS.md — Scaffolding Order for a DDD + CQRS + Event Sourcing Codebase

> Use these instructions in VS Code to guide GitHub Copilot when scaffolding new services and modules. The goal is to produce consistent, production-grade code in this architecture.

---

## TL;DR (Generation Order)

1. **EventStoreDB (ESDB) — FIRST**: define aggregates, events, metadata, append/rebuild flows.
2. **Redis Projections — SECOND**: build projectors, checkpoints, and low-latency read models.
3. **TypeORM — LAST**: add durable read stores and migrations only after read shapes stabilize.

---

## Architectural Assumptions

- **DDD** with explicit aggregates and invariants.
- **CQRS + Event Sourcing** with **EventStoreDB** as the write source of truth.
- **Redis** for projection caches and fast reads.
- **BullMQ v5** for outbox → queue → worker pipelines.
- **Never-throw domain** style using `Result<T,E>`.
- **Multi-tenant** stream and key conventions.
- **OPA/Keycloak** exist but are out of scope for scaffolding order.

---

## Global Conventions (ask Copilot to enforce)

- **Naming**
  - Event types: `product.created.v1`, `transaction.failed.v1` (lowercase, dotted, versioned).
  - ESDB stream: `tenant-{tenant}/agg-{aggregate}/{id}`.
  - Redis keys: `app:{env}:{tenant}:{aggregate}:{id}`.
  - Job names: `queue:{context}:{operation}` (e.g., `queue:message:send`).

- **Metadata (every event & job)**
  - `correlationId`, `causationId`, `tenant`, `user` (id, email), `source`, `occurredAt`.

- **Snapshots**
  - Use when aggregates exceed N events (default 200–500). Keep `version` and `checksum`.

- **Checkpoints**
  - Per projector and per subscription. Store checkpoint + partition (if any).

Ask Copilot to generate helpers for these conventions where missing.

---

## What Copilot Should Scaffold — In Order

### 1) EventStoreDB (FIRST)

**Goal:** Lock down domain events and aggregate APIs.

**Required files/modules**

- `src/infrastructure/esdb/event-store.service.ts`
  - `append(stream, events, metadata, expectedRevision)`
  - `readStream(stream)` and `readByCorrelation(correlationId)`
  - `subscribe(category|$all, from, handler, checkpointStore)`
  - `saveSnapshot(stream, snapshot)` / `loadSnapshot(stream)`

- `src/domain/common/aggregate-root.base.ts`
  - `apply(event)`; in-memory uncommitted events; version tracking

- `src/domain/common/events.ts`
  - Event base interface with `type`, `version`, `payload`, `metadata`

- `src/application/commands/*` + handlers
  - Sample `CreateXCommand`, `UpdateXCommand`

- **Policies**: `EVENT_VERSIONING.md` (rule: never mutate events; add `...v{n}`)

**Prompt for Copilot**

- _"Generate an `EventStoreService` with append/read/subscribe and optimistic concurrency. Include correlation/causation metadata and snapshot helpers."_
- _"Create an `AggregateRootBase` with apply/commit and version tracking. Provide an example `ProductAggregate` with 2–3 events and invariants."_

**Definition of Done (ESDB)**

- Command → Aggregate → Events → Append → Rebuild from events (green tests).
- Concurrency test: parallel append must fail with expected-revision.
- Snapshot write/read smoke test.

---

### 2) Redis Projections (SECOND)

**Goal:** Deterministic, idempotent, fast reads from ESDB events.

**Required files/modules**

- `src/infrastructure/redis/redis.module.ts` (shared `ioredis` providers)
- `src/read-models/<context>/<name>.projector.ts`
  - `handle(event)` with idempotency + retry/backoff
  - `checkpointStore` interface + Redis impl

- `src/read-models/<context>/<name>.repository.ts`
  - `getById`, `set`, `patch`, `exists`, `version`

- `src/infrastructure/outbox/outbox.publisher.ts`
  - Convert committed events → BullMQ jobs

**Prompt for Copilot**

- _"Scaffold a projector base class with `process(event, meta)` that reads/writes Redis JSON, ensures idempotency via eventId sets, and persists checkpoints."_
- _"Create a BullMQ v5 queue + worker for `projection-update` consuming outbox messages with standard job metadata."_

**Definition of Done (Redis)**

- Full replay from genesis builds identical state twice (idempotent).
- Projector can resume from checkpoint after crash.
- DLQ exists for poison jobs and logs a `correlationId`.

---

### 3) TypeORM Durable Read Stores (LAST)

**Goal:** Durable analytics/reporting/backoffice views after shapes stabilize.

**Required files/modules**

- `src/infrastructure/typeorm/typeorm.module.ts` + data-source config
- `src/reporting/<context>/entities/*.entity.ts`
- `src/reporting/<context>/migrations/*`
- Upsert projectors: `esdb→sql` or `redis→sql` with exactly-once semantics via checkpoints.

**Prompt for Copilot**

- _"Generate a TypeORM module with migrations and an upsert projector that reads ESDB events, maps to entities, and maintains a checkpoint table for exactly-once."_

**Definition of Done (TypeORM)**

- Repeatable backfill migration from ESDB to SQL.
- Verified parity between Redis snapshot and SQL row(s) for sample IDs.

---

## Folder Skeleton (ask Copilot to keep)

```
src/
  application/
    commands/...
    queries/...
  domain/
    common/
    <bounded-context>/aggregates/...
  infrastructure/
    esdb/
    redis/
    queue/ (bullmq)
    typeorm/
  read-models/
    <context>/
  reporting/
    <context>/{entities,migrations}
  shared/
    logging/
    result/
    utils/
```

---

## Code Templates Copilot Should Reuse

**Event metadata**

```ts
export type EventMetadata = {
  correlationId: string;
  causationId?: string;
  tenant: string;
  user?: { id: string; email?: string; name?: string };
  source: string; // service/component
  occurredAt: string; // ISO
};
```

**Standard job metadata**

```ts
export interface StandardJobMetadata {
  correlationId: string;
  source: string;
  timestamp: string; // ISO
  user?: { id: string; email?: string; tenant?: string };
  businessContext?: Record<string, any>;
}
```

**Redis key helper**

```ts
export const rkey = (parts: (string | number | undefined)[]) =>
  parts.filter(Boolean).join(':');
// rkey(["app", env, tenant, "product", id])
```

---

## Guardrails (Do/Don’t)

- ✅ **Do** generate tests for concurrency, replay, idempotency.
- ✅ **Do** keep events immutable; add new versions.
- ✅ **Do** use explicit return types (`Result<T,E>`) in domain.
- ❌ **Don’t** add TypeORM before Redis projections are proven.
- ❌ **Don’t** read other services’ DBs; communicate by events.

---

## Commit Checklist (ask Copilot to append to PRs)

- [ ] ESDB services and aggregate APIs with tests
- [ ] Event names/versioning documented
- [ ] Projector with checkpointing + idempotency
- [ ] Outbox → BullMQ v5 pipeline with DLQ
- [ ] Replay-from-scratch script succeeds
- [ ] (If needed) TypeORM entities + migrations + backfill

---

## Quick Prompts You Can Paste in VS Code

- _"Create an ESDB-backed `CustomerAggregate` with events `customer.created.v1`, `customer.email-updated.v1`. Provide command handlers and tests for concurrency and snapshots."_
- _"Scaffold a Redis projector `customer.read` with checkpointing and idempotency. Include a BullMQ worker that consumes outbox jobs for these events."_
- _"Add a TypeORM reporting view for `customer_ltv` fed by ESDB events with an upsert projector and migration scripts."_

---

## Acceptance Tests (Copilot should propose)

- **Replay determinism:** Replaying the same stream twice yields identical Redis snapshots.
- **Exactly-once:** No duplicate rows or version regressions in SQL after crash/retry.
- **Latency SLO:** Projector lag < configurable threshold; emits warning when exceeded.

---

## Notes for Future Extensions

- Introduce sharded checkpoints per partition for high-volume categories.
- Switch to Redis streams (optional) for projector fan-out if BullMQ pressure rises.
- Add metrics: processed/s, lag, retries, DLQ depth; expose via Prometheus.
