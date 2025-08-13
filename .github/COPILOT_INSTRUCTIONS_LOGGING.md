# COPILOT_INSTRUCTIONS.md — Centralized Logging Strategy

> **Scope**: NestJS + Pino, CLS (async context), BullMQ, EventStoreDB (ESDB), Grafana Loki / Elasticsearch (ELK)
>
> **Goal**: One **consistent JSON log shape**, **traceable end‑to‑end**, configurable **sink** (console/stdout, Loki, Elasticsearch) without touching business code.

---

## TL;DR (What Copilot should generate by default)

- A **LoggerModule** that wires **nestjs-pino** with a **config-driven sink** (env: `LOG_SINK`).
- A **CLS module** and an early **TraceMiddleware** to create/propagate a `traceId` from `traceparent | x-request-id` or generate one.
- A **logger factory** that enriches every log with `traceId`, `correlationId`, `tenantId`, `userId` from CLS.
- A **central `Log` helper** (typed functions) used across app code; business code never selects the sink.
- Integration snippets for **BullMQ** (propagate `traceId` through jobs) and **EventStoreDB** (attach `traceId` in metadata, set CLS in consumers).
- **Severity hygiene** + **low-cardinality** fields for observability.

---

## 1) Design Principles

1. **One JSON shape everywhere**: predictable keys → easy queries & dashboards.
2. **Separation of concerns**: sink chosen by configuration at boot, not in handlers.
3. **End‑to‑end correlation**: always include `traceId`; optionally a business `correlationId`.
4. **Low cardinality first**: use stable keys (`service`, `component`, `method`) for filters; keep payloads small.
5. **Idiomatically Pino**: log `err: Error` objects, not hand-rolled stacks.
6. **Benign startup states ≠ WARN**: expected empty streams are `info` with `expected: true`.

---

## 2) Canonical JSON Log Shape

All logs should follow this base shape (fields may be omitted if empty):

```json
{
  "time": "2025-08-12T12:58:37.555Z",
  "level": "info", // trace|debug|info|warn|error|fatal
  "msg": "Human-readable summary",
  "app": "<APP_NAME>",
  "environment": "local|dev|staging|prod",
  "version": "0.0.1",

  "service": "core-template-manager", // stable, low-cardinality
  "component": "TemplateProjectionManager",
  "method": "startProjection",

  "traceId": "…", // technical correlation (W3C-capable)
  "correlationId": "…", // optional business correlation
  "tenantId": "…", // optional multi-tenant context
  "userId": "…", // optional end-user context

  "expected": true, // mark benign conditions
  "timingMs": 42, // optional timings

  "esdb": {
    // domain-specific sections
    "category": "coreTemplateManager.template.v1",
    "stream": "$ce-coreTemplateManager.template.v1",
    "subscription": "template-catchup",
    "eventId": "…"
  },
  "bull": {
    "queue": "notifications",
    "jobId": "…",
    "attempt": 1
  },

  "retry": { "attempt": 0, "backoffMs": 0 },
  "err": { "type": "NotFoundError", "message": "…", "stack": "…" }
}
```

### Required Keys

- `time`, `level`, `msg`, `app`, `environment`, `version`.
- `service`, `component`, `method`.
- `traceId` **always** present.

### Severity Mapping

- `debug` → high-volume internals (disabled by default in prod).
- `info` → normal milestones, including benign “empty start” conditions with `expected: true`.
- `warn` → degraded but continuing (retries, partial failures).
- `error` → failed operation; include `err: Error` and safe context.
- `fatal` → unrecoverable; process likely exits.

---

## 3) Configuration & Environment

**Sinks** are selected at boot via env vars; app code never switches sinks.

```
LOG_SINK=stdout|console|loki|elasticsearch
LOG_LEVEL=info
APP_NAME=gsnest-template
APP_VERSION=0.0.1
NODE_ENV=local|development|staging|production

# Loki (if LOG_SINK=loki)
LOKI_URL=http://loki:3100
LOKI_BASIC_AUTH=username:password  # optional

# Elasticsearch (if LOG_SINK=elasticsearch)
ES_NODE=http://elasticsearch:9200
ES_INDEX=app-logs

# Local pretty printing (optional)
PRETTY_LOGS=true
```

**Recommendations**

- **Prod**: `LOG_SINK=stdout` and ship via Promtail/Filebeat (best resilience).
- **Staging**: stdout + Promtail → Loki.
- **Local**: `console` + `PRETTY_LOGS=true` using `pino-pretty`.

---

## 4) NestJS + Pino Setup (HTTP path)

**What Copilot should scaffold**: a `LoggingModule` (using `nestjs-pino`) with a transport builder.

```ts
// logging.module.ts (simplified factory)
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';

function buildTransport() {
  const sink = process.env.LOG_SINK ?? 'stdout';
  const pretty = process.env.PRETTY_LOGS === 'true';

  if (sink === 'console' && pretty) {
    return { target: 'pino-pretty', options: { translateTime: 'UTC:isoTime' } };
  }
  if (sink === 'loki') {
    return {
      target: 'pino-loki',
      options: {
        host: process.env.LOKI_URL,
        basicAuth: process.env.LOKI_BASIC_AUTH,
        batching: true,
        interval: 2000,
        labels: {
          app: process.env.APP_NAME ?? 'app',
          env: process.env.NODE_ENV ?? 'local',
        },
      },
    };
  }
  if (sink === 'elasticsearch') {
    return {
      target: 'pino-elasticsearch',
      options: {
        node: process.env.ES_NODE,
        index: process.env.ES_INDEX ?? 'app-logs',
        esVersion: 8,
      },
    };
  }
  return undefined; // stdout (ship with Promtail/Filebeat)
}

export const LoggingModule = LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: buildTransport(),

    // Use/request a request id compatible with traceId
    genReqId: (req) =>
      (req.headers['x-request-id'] as string) || crypto.randomUUID(),

    // Surface request id as traceId in logs
    customAttributeKeys: { reqId: 'traceId' },

    // Standard app metadata on every log
    customProps: (req) => ({
      app: process.env.APP_NAME ?? 'app',
      environment: process.env.NODE_ENV ?? 'local',
      version: process.env.APP_VERSION ?? '0.0.1',
    }),

    // Keep request/response serializers lean
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          headers: { 'user-agent': req.headers['user-agent'] },
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
      err(err) {
        return { type: err?.name, message: err?.message, stack: err?.stack };
      },
    },
  },
});
```

---

## 5) CLS (Async Context) & Trace Propagation

**Why**: Include `traceId/correlationId/tenantId/userId` automatically in non-HTTP logs (workers, schedulers, ESDB consumers).

1. **Install** `@nestjs/cls` and mount middleware early.
2. **TraceMiddleware**: parse W3C `traceparent` or `x-request-id`/`x-trace-id`; generate if missing; set response headers and CLS values.

```ts
// trace.middleware.ts (essential parts)
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}
  use(req: any, res: any, next: Function) {
    const headerId =
      (req.headers['traceparent'] as string) ||
      (req.headers['x-request-id'] as string) ||
      crypto.randomUUID();
    const traceId = extractOrNormalizeTraceId(headerId); // implement W3C parsing if desired
    this.cls.set('traceId', traceId);
    res.setHeader('x-request-id', traceId);
    next();
  }
}
```

3. **App Logger** for non-HTTP paths uses CLS mixin:

```ts
// logger.factory.ts
export function buildAppLogger(cls: ClsService) {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: {
      app: process.env.APP_NAME ?? 'app',
      environment: process.env.NODE_ENV ?? 'local',
      version: process.env.APP_VERSION ?? '0.0.1',
    },
    mixin() {
      return {
        traceId: cls.get('traceId'),
        correlationId: cls.get('correlationId'),
        tenantId: cls.get('tenantId'),
        userId: cls.get('userId'),
      };
    },
  });
}
```

---

## 6) Centralized, Typed Log Helpers (use everywhere)

Create a single utility that encodes shape & conventions.

```ts
// structured-logger.ts
import type { Logger } from 'pino';

export type BaseCtx = {
  service: string;
  component: string;
  method: string;
  expected?: boolean;
  timingMs?: number;
};

export type EsdbCtx = BaseCtx & {
  esdb?: {
    category?: string;
    stream?: string;
    subscription?: string;
    eventId?: string;
  };
};

export type BullCtx = BaseCtx & {
  bull?: { queue: string; jobId?: string; attempt?: number };
};

export const Log = {
  info(logger: Logger, msg: string, ctx: Record<string, any>) {
    logger.info({ ...ctx, msg });
  },
  warn(logger: Logger, msg: string, ctx: Record<string, any>) {
    logger.warn({ ...ctx, msg });
  },
  error(logger: Logger, err: unknown, msg: string, ctx: Record<string, any>) {
    logger.error({ ...ctx, err }, msg);
  },
  esdbProjectionStarted(logger: Logger, ctx: EsdbCtx) {
    logger.info({ ...ctx, msg: 'Projection setup completed' });
  },
  esdbCatchupNotFound(logger: Logger, ctx: EsdbCtx) {
    logger.info({
      ...ctx,
      expected: true,
      msg: 'Category stream not found yet; waiting for first event',
    });
  },
  bullQueued(logger: Logger, ctx: BullCtx) {
    logger.info({ ...ctx, msg: 'Job queued' });
  },
  bullFailed(logger: Logger, err: unknown, ctx: BullCtx) {
    logger.error({ ...ctx, err, msg: 'Job failed' });
  },
};
```

Use `Log.*` in all services/handlers instead of calling `logger.info` directly.

---

## 7) BullMQ Integration (trace-safe)

**Producer**: include trace in job payload.

```ts
queue.add('send', data, {
  jobId: domainId,
  removeOnComplete: true,
  removeOnFail: false,
  // Put trace metadata under a stable key
  meta: {
    traceId: cls.get('traceId'),
    correlationId: cls.get('correlationId'),
  },
});
```

**Worker**: set CLS on job start, so all logs include same `traceId`.

```ts
worker.on('active', (job) => {
  cls.set('traceId', job.opts?.meta?.traceId || job.id);
  cls.set('correlationId', job.opts?.meta?.correlationId);
});
```

**Logging**: use `Log.bullQueued` / `Log.bullFailed` with `bull: { queue, jobId, attempt }`.

---

## 8) EventStoreDB Integration

**Append**: always include metadata for correlation & audit.

```ts
appendToStream(
  streamId,
  jsonEvent({
    type: eventType,
    data,
    metadata: {
      traceId: cls.get('traceId'),
      correlationId: cls.get('correlationId'),
      user: { id: cls.get('userId'), tenantId: cls.get('tenantId') },
      source: process.env.APP_NAME,
    },
  }),
);
```

**Consume**: set CLS from event metadata before handling; log with `esdb` section.

```ts
const meta = resolvedEvent?.event?.metadata as any;
cls.set('traceId', meta?.traceId);
cls.set('correlationId', meta?.correlationId);
cls.set('tenantId', meta?.user?.tenantId);
cls.set('userId', meta?.user?.id);

Log.esdbProjectionStarted(logger, {
  service: 'core-template-manager',
  component: 'TemplateProjectionManager',
  method: 'startProjection',
  esdb: {
    category: 'coreTemplateManager.template.v1',
    stream: '$ce-coreTemplateManager.template.v1',
  },
});
```

**\$ce vs filtered `$all`**

- Prefer **filtered `$all`** (regex/prefix) + your own checkpoints ⇒ no dependency on system projections, avoids `$ce-* not found` noise.
- If using `$ce-*`, mark first-boot “not found” as `info` with `expected: true`.

---

## 9) Observability Tips (Loki & ELK)

**Loki (Grafana)**

- Keep `traceId` in log **body**, not as a label (avoid high cardinality).
- Add a **Derived Field** for `traceId` in Grafana → click to query `{ traceId="…" }`.
- Useful LogQL examples:
  - Find all errors for a trace: `{app="gsnest-template"} |= "\"traceId\":\"<ID>\"" |~ "level":"error"`
  - ESDB issues: `{component="TemplateProjectionManager"} |= "esdb" |= "not found"`

**Elasticsearch**

- Index templates: map `time` as `date`, `level` as `keyword`, `service/component/method` as `keyword`.
- Create a **keyword** subfield for `traceId` to enable exact-match filters.

---

## 10) Error & Retry Conventions

- Always attach the real error object as `err`.
- Include `retry.attempt` and `retry.backoffMs` when applicable.
- For partial failures (degraded mode) use `warn` with clear `msg`.
- For expected empty states add `expected: true`.

---

## 11) Security & PII

- **Never** log secrets (tokens, connection strings, passwords, cards).
- Redact headers like `authorization`, `cookie`.
- Limit payload sizes; truncate long fields.
- For GDPR/POPIA, prefer hashed identifiers if full PII is unnecessary.

---

## 12) Performance

- Favor `stdout` shipping over in-process network transports in prod.
- Batch transports (e.g., `pino-loki`) if used.
- Avoid logging large objects; store references/ids instead.

---

## 13) Local Developer Experience

- Pretty logs via `pino-pretty` when `PRETTY_LOGS=true`.
- Keep shapes identical—pretty only affects rendering.

---

## 14) Testing & CI

- **Unit**: a small logger wrapper test asserting presence of `traceId`, `service`, `component`, `method`.
- **E2E**: one HTTP test verifies `x-request-id` echo + log line contains same id.
- **Smoke**: BullMQ worker test ensures `traceId` flows from producer to processor logs.

---

## 15) Migration Plan

1. Introduce `LoggingModule`, CLS, and `Log` helper.
2. Replace direct `logger.info/error` with `Log.*` in hot paths.
3. Add `traceId` propagation in BullMQ & ESDB.
4. Switch dashboards/alerts to new fields.
5. Decommission legacy log keys after a cutover window.

---

## 16) Copy‑Paste Snippets Index

- [x] `logging.module.ts` (Pino transports per sink)
- [x] `trace.middleware.ts` (set CLS + response headers)
- [x] `logger.factory.ts` (CLS mixin for non-HTTP)
- [x] `structured-logger.ts` (central log helpers)
- [x] BullMQ producer/worker propagation
- [x] ESDB append/consume metadata pattern

---

## 17) Checklist (for PRs)

- [ ] All logs include `service`, `component`, `method`, `traceId`.
- [ ] No secrets or PII leak; redaction in place.
- [ ] `LOG_SINK` handled; prod ⇒ stdout shipping.
- [ ] `expected: true` used for benign conditions.
- [ ] Errors use `err` with type/message/stack.
- [ ] Loki/ELK dashboards updated to new fields.
- [ ] Unit/E2E smoke tests passing.

## 18) Over/Under Logging (Quick Guide)

**Goal:** enough signal to debug any request/job/event end-to-end without drowning in noise or cost.

### Budgets (targets, not hard limits)

- **HTTP request**: **3–6** log lines (received → key transition(s) → completed; errors only on failure).
- **BullMQ job**: **4–8** lines (queued, attempt start \[debug], success or fail w/ `err`, retries as `warn`).
- **ESDB projection**: startup + periodic **checkpoint summaries**; **no per-event INFO**. Use **DEBUG** only for targeted traces.

### Levels

- **debug**: chatty internals; enable per-trace only.
- **info**: milestones/outcomes; add `expected:true` for benign anomalies (e.g., first-boot empty categories).
- **warn**: degraded but continuing (retries, timeouts, partial failures) with `retry.attempt/backoffMs`.
- **error**: operation failed; must include `err` (type/message/stack).

### Replace noisy patterns with summaries

- Per-event INFO → **periodic stats**: `{ processed, errors, lag, timingMs }` every N seconds.
- Repeated WARNs → **rate-limited** line + counter.

```ts
// rate-limited warn helper
const last = new Map<string, number>();
export function warnRateLimited(key: string, log: () => void, minMs = 60000) {
  const now = Date.now();
  if ((last.get(key) ?? 0) + minMs < now) {
    log();
    last.set(key, now);
  }
}
```

### Debug-by-trace (targeted verbosity)

- Header `x-debug-trace: true` → set `cls.set('debugTrace', true)` and emit extra **debug** lines **only** for that `traceId`.

### What to log vs. what to measure

- **Logs**: IDs, counts, timings, outcomes, `traceId`, minimal context.
- **Metrics**: volumes, latencies, error rates; use dashboards/alerts for repetition.

### PR Checklist for balance

- [ ] Logs per HTTP/job within budget; big payloads only at DEBUG.
- [ ] WARN/ERROR always carry `err` and retry context when relevant.
- [ ] Benign empty states use `info` + `expected:true` (not WARN).
- [ ] ESDB uses periodic checkpoint summaries; no per-event INFO.
- [ ] Rate limiting in place for repeated warnings.

---

**Done.** This strategy yields query‑friendly, low‑cardinality, end‑to‑end traceable logs across HTTP, BullMQ, and ESDB with zero sink knowledge in business code.
