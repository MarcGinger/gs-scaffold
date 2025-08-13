# COPILOT_INSTRUCTIONS.md — EventStoreDB, Redis Keys & Event Contracts

> **Purpose**
> This guide defines one consistent, versioned naming scheme for **EventStoreDB (ESDB) stream categories & event types**, **Redis keys** (read models, indexes, lists, checkpoints), and a **canonical domain event envelope**. It includes helpers, regex validators, and migration guidance so Copilot can scaffold and refactor safely across the codebase.

---

## 1) Core Principles

- **Predictable**: human-readable, machine-parseable, regex-friendly.
- **Versioned**: bump versions only on breaking changes.
- **Tenant-safe**: keys isolate tenants and support Redis Cluster hash-tagging.
- **Composable**: same patterns across BCs, aggregates, queues, and checkpoints.
- **Auditable**: envelope carries correlation/causation/idempotency.

---

## 2) Naming Taxonomy (Cheat Sheet)

**Terms**

- `bc` = bounded context (e.g., `banking`, `paymenthub`, `notifications`, `coreTemplateManager`)
- `agg` = aggregate/entity (e.g., `currency`, `account`, `payment`, `template`)
- `v` = version number, integer (e.g., `v1`, `v2`)
- `tenant` = tenant key (e.g., `core`, `demo-za`)
- `id` = aggregate identifier (UUID/ULID or stable natural key like `USD`)
- `action` = past-tense verb (e.g., `created`, `updated`, `requested`, `queued`, `processed`, `completed`, `failed`)

**Delimiters & Allowed Characters**

- Use lowercase `a–z`, digits, and `-` inside tokens
- **Dots `.`** separate namespaces in categories: `banking.currency.v1`
- **Hyphens `-`** separate ESDB category from `tenant` and `id`: `…-core-USD`
- **Colons `:`** separate Redis key segments: `app:{core}:banking:currency:v1:USD`

---

## 3) Event Types (ESDB `eventType`)

**Format**

```
<agg>.<action>.v<version>
```

**Regex**

```
^(?<agg>[a-z0-9-]+)\.(?<action>[a-z0-9-]+)\.v(?<v>\d+)$
```

**Examples**

- `payment.requested.v1`
- `payment.queued.v1`
- `payment.completed.v1`
- `currency.created.v1`
- `template.updated.v2`

**Rules**

- `action` is **past-tense** for audit clarity.
- Bump `v` only on **breaking** payload changes.

---

## 4) ESDB Stream Names (per-aggregate)

**Why**: We leverage ESDB’s `$by_category` index. Everything before the first `-` is the **category**.

**Format**

```
<bc>.<agg>.v<version>-<tenant>-<id>
```

**Regex**

```
^(?<category>(?<bc>[a-z0-9-]+)\.(?<agg>[a-z0-9-]+)\.v(?<v>\d+))-(?<tenant>[a-z0-9-]+)-(?<id>[A-Za-z0-9._-]+)$
```

**Examples**

- `banking.currency.v1-core-USD`
- `paymenthub.payment.v1-core-017f8c4a-2b1c-…`
- `coreTemplateManager.template.v1-core-invoice-reminder`

**Notes**

- **Category** is `bc.agg.vN` → e.g., `$ce-banking.currency.v1`
- Do **not** change a stream’s category during its life.
- `id` may contain `_` and `.` to support natural keys; prefer UUID/ULID for mutable entities.

---

## 5) Canonical Domain Event Envelope

Use **one** envelope shape for ESDB payloads and inter-service messages.

```ts
export interface DomainEventEnvelope<T = any> {
  /** e.g., "payment.completed.v1" */
  type: string;
  /** ULID/UUIDv7 preferred */
  eventId: string;
  /** ISO 8601 */
  occurredAt: string;

  /** Business-flow tracing across services */
  correlationId: string;
  /** Immediate parent id (event/command) */
  causationId?: string;
  /** Deterministic for intent; use to dedupe */
  idempotencyKey?: string; // "<tenant>|<service>|<operation>|<naturalKey>"

  /** Tenant isolation */
  tenant: string; // e.g., "core"

  aggregate: {
    bc: string; // e.g., "paymenthub"
    type: string; // e.g., "payment"
    id: string; // aggregate id or natural key
    version?: number; // aggregate version if tracked
  };

  /** Optional actor context */
  user?: {
    id?: string;
    email?: string;
    name?: string;
    tenant?: string;
    tenantId?: string;
  };

  /** Free-form headers for source, feature flags, etc. */
  headers?: Record<string, any>; // e.g., { source: "MakerModule" }

  /** Event-specific data */
  payload: T;
}
```

**Idempotency**

- Recommended: `<tenant>|<service>|<operation>|<naturalKey>`
- Enforce at command handlers and when enqueueing jobs (deterministic `jobId`).

---

## 6) Subscriptions & Filters (ESDB)

- **By category**: `$ce-<bc>.<agg>.v<version>` (e.g., `$ce-banking.currency.v1`)
- **By event type**: `$et-<agg>.<action>.v<version>` (e.g., `$et-payment.completed.v1`)
- **Regex/prefix**: Use `$all` + server-side eventType filters for classes of events (e.g., `payment.*`).

**Subscription names** (stable identifiers used for checkpoints):

```
sub:<service>:<projection|workflow>:v<version>
```

Example: `sub:core-lookup:currency-projection:v1`

---

## 7) Redis Keyspace

> All keys use hash tags `{…}` for tenant pinning in Redis Cluster.

### 7.1 Snapshots / Read Models

- **JSON/RedisJSON**

```
app:{<tenant>}:{bc}:{agg}:v<version>:<id>
```

- **Hash variant**

```
app:{<tenant>}:{bc}:{agg}:v<version}:h:<id>
```

**Example**: `app:{core}:banking:currency:v1:USD`

### 7.2 Indexes & Sets

```
app:{<tenant>}:{bc}:{agg}:v<version>:index:by-code    -> HASH (code → id)
app:{<tenant>}:{bc}:{agg}:v<version}:set:all          -> SET (ids)
app:{<tenant>}:{bc}:{agg}:v<version}:set:enabled      -> SET (ids)
app:{<tenant>}:{bc}:{agg}:v<version}:zset:by-updated  -> ZSET (score = epoch)
```

### 7.3 Materialized Lists / Query Caches

```
app:{<tenant>}:{bc}:{agg}:v<version}:list:{<filtersHash>} -> LIST/SET of ids
```

- Apply **TTL** for list caches; snapshots usually **no TTL**.

### 7.4 Checkpoints (ESDB, Sagas, Outbox)

```
checkpoint:esdb:{subscriptionName}              -> STRING (commit pos JSON)
checkpoint:workflow:{sagaName}:{tenant}        -> HASH/STRING
```

### 7.5 BullMQ v5 Queues & Job IDs

```
// Queue per work type
mq:{<tenant>}:{bc}:{agg}:v<version}:{work}
// Deterministic Job ID for idempotency
job:{<tenant>}:{bc}:{agg}:{work}:{<aggregateId>}
```

**Example**

```
mq:{core}:paymenthub:payment:v1:process
job:{core}:paymenthub:payment:process:017f8c4a…
```

---

## 8) End-to-End Examples

### 8.1 Currency (Banking BC)

- **Stream**: `banking.currency.v1-core-USD`
- **Events**: `currency.created.v1`, `currency.updated.v1`
- **Projection**: `app:{core}:banking:currency:v1:USD`
- **Index**: `app:{core}:banking:currency:v1:index:by-code` → `{ USD: "USD" }`
- **Set**: `app:{core}:banking:currency:v1:set:all` → `["USD", "ZAR", …]`

### 8.2 Payment (PaymentHub BC)

- **Stream**: `paymenthub.payment.v1-core-<paymentId>`
- **Events**: `payment.requested.v1` → `payment.queued.v1` → `payment.processed.v1` → `payment.completed.v1` | `payment.failed.v1`
- **Queue**: `mq:{core}:paymenthub:payment:v1:process`
- **JobId**: `job:{core}:paymenthub:payment:process:<paymentId>`
- **Snapshot**: `app:{core}:paymenthub:payment:v1:<paymentId>`
- **Checkpoint**: `checkpoint:esdb:sub:payments:payment-projection:v1`

### 8.3 Notifications (Slack)

- **Event**: `notification.requested.v1` with `headers.source = "MakerModule"`
- **Idempotency**: `core|notify|sendSlack|maker-test1`

---

## 9) Utility Helpers (Drop-in)

```ts
export const buildEventType = (agg: string, action: string, v: number) =>
  `${agg}.${action}.v${v}`;

export const buildStreamName = (
  bc: string,
  agg: string,
  v: number,
  tenant: string,
  id: string,
) => `${bc}.${agg}.v${v}-${tenant}-${id}`;

export const parseStreamName = (stream: string) => {
  const re =
    /^(?<category>(?<bc>[a-z0-9-]+)\.(?<agg>[a-z0-9-]+)\.v(?<v>\d+))-(?<tenant>[a-z0-9-]+)-(?<id>[A-Za-z0-9._-]+)$/;
  const m = stream.match(re);
  if (!m?.groups) throw new Error(`Invalid stream name: ${stream}`);
  return {
    category: m.groups.category,
    bc: m.groups.bc,
    agg: m.groups.agg,
    version: Number(m.groups.v),
    tenant: m.groups.tenant,
    id: m.groups.id,
  } as const;
};

export const redisKeys = {
  snapshot: (tenant: string, bc: string, agg: string, v: number, id: string) =>
    `app:{${tenant}}:${bc}:${agg}:v${v}:${id}`,
  indexByCode: (tenant: string, bc: string, agg: string, v: number) =>
    `app:{${tenant}}:${bc}:${agg}:v${v}:index:by-code`,
  setAll: (tenant: string, bc: string, agg: string, v: number) =>
    `app:{${tenant}}:${bc}:${agg}:v${v}:set:all`,
  queue: (tenant: string, bc: string, agg: string, v: number, work: string) =>
    `mq:{${tenant}}:${bc}:${agg}:v${v}:${work}`,
  jobId: (tenant: string, bc: string, agg: string, work: string, id: string) =>
    `job:{${tenant}}:${bc}:${agg}:${work}:${id}`,
  checkpoint: (subscriptionName: string) =>
    `checkpoint:esdb:${subscriptionName}`,
};
```

**Example: extract tenant from** `banking.currency.v1-core-USD`

```ts
const { tenant } = parseStreamName('banking.currency.v1-core-USD'); // => "core"
```

---

## 10) Versioning & Migrations

- **Breaking event schema** → bump both **event type** (`payment.completed.v2`) and **stream category** (`paymenthub.payment.v2`).
- **Read models** → write to new Redis namespace `…:v2:…`.
- Run V1 & V2 projectors in parallel; deprecate V1 when all consumers are cut over.
- **Non-breaking** read-model tweaks → keep `v1`, redeploy projector.

---

## 11) Do / Don’t

**Do**

- Keep stream category stable for a stream’s life.
- Use one queue per work type (e.g., `process`, `retry`, `compose`).
- Store subscription checkpoints in Redis with stable names.
- Favor UUID/ULID for mutable aggregates.

**Don’t**

- Mix delimiters randomly; use `.` | `-` | `:` consistently.
- Put PII in keys.
- Reuse job IDs for different intents.

---

## 12) Observability & Telemetry

- Always include `correlationId` in logs, metrics labels, and job metadata.
- Suggested log fields: `app`, `env`, `version`, `context.component`, `operationId`, `correlationId`, `tenant`, `stream`, `eventType`.
- Metrics (Prom/Grafana) naming: `events_processed_total{bc,agg,action,version,tenant}`, `projection_lag_seconds{sub}`, `queue_depth{queue}`.

---

## 13) Validation Snippets (Tests/Lints)

**Event type validation**

```ts
expect(buildEventType('payment', 'completed', 1)).toBe('payment.completed.v1');
expect(/^([a-z0-9-]+)\.[a-z0-9-]+\.v\d+$/.test('payment.completed.v1')).toBe(
  true,
);
```

**Stream parser**

```ts
const s = 'banking.currency.v1-core-USD';
const p = parseStreamName(s);
expect(p).toEqual({
  category: 'banking.currency.v1',
  bc: 'banking',
  agg: 'currency',
  version: 1,
  tenant: 'core',
  id: 'USD',
});
```

**Redis key comp**

```ts
expect(redisKeys.snapshot('core', 'banking', 'currency', 1, 'USD')).toBe(
  'app:{core}:banking:currency:v1:USD',
);
```

---

## 14) Security & Limits

- Avoid PII in keys; prefer opaque IDs.
- Keep key length reasonable (< 256 chars) for compatibility.
- Sanitize/validate input for all key builders.

---

## 15) Checklists

**Creating a new aggregate**

- [ ] Choose `bc`, `agg` names (lowercase, kebab allowed)
- [ ] Define initial `v1` event types (`<agg>.<action>.v1`)
- [ ] Streams: `<bc>.<agg>.v1-<tenant>-<id>`
- [ ] Projections: `app:{tenant}:{bc}:{agg}:v1:<id>`
- [ ] Indexes/sets as needed
- [ ] Subscriptions named `sub:<service>:<projection>:v1`
- [ ] Queue(s): `mq:{tenant}:{bc}:{agg}:v1:<work>`
- [ ] Enforce deterministic `jobId`

**Introducing a breaking change**

- [ ] Bump to `v2` for event types and stream category
- [ ] Duplicate projectors & Redis namespaces to `…:v2:…`
- [ ] Backfill or migrate as needed
- [ ] Monitor dual-run, then retire `v1`

---

## 16) FAQ

**Q: Can I use natural keys for `id`?**
A: Yes, when truly immutable (`USD`). For mutable entities use UUID/ULID.

**Q: Where do I stick `headers.source`?**
A: In `envelope.headers`. Keep it short and consistent (e.g., `MakerModule`).

**Q: How do I filter all payments regardless of action?**
A: Subscribe to `$all` with server-side eventType regex/prefix `payment.*` or maintain a dedicated projection.

**Q: How do I extract the tenant from a stream name?**
A: Use `parseStreamName(stream).tenant` (see helper above).

---

## 17) Appendix: JSON Schema (Envelope)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/domain-event-envelope.json",
  "type": "object",
  "required": [
    "type",
    "eventId",
    "occurredAt",
    "correlationId",
    "tenant",
    "aggregate",
    "payload"
  ],
  "properties": {
    "type": { "type": "string", "pattern": "^[a-z0-9-]+\.[a-z0-9-]+\.v\\d+$" },
    "eventId": { "type": "string" },
    "occurredAt": { "type": "string", "format": "date-time" },
    "correlationId": { "type": "string" },
    "causationId": { "type": "string" },
    "idempotencyKey": { "type": "string" },
    "tenant": { "type": "string" },
    "aggregate": {
      "type": "object",
      "required": ["bc", "type", "id"],
      "properties": {
        "bc": { "type": "string" },
        "type": { "type": "string" },
        "id": { "type": "string" },
        "version": { "type": "number" }
      }
    },
    "user": { "type": "object", "additionalProperties": true },
    "headers": { "type": "object", "additionalProperties": true },
    "payload": {
      "type": ["object", "array", "string", "number", "boolean", "null"]
    }
  },
  "additionalProperties": false
}
```
