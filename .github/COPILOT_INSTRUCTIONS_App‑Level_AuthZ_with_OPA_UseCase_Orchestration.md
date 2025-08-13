# COPILOT_INSTRUCTIONS.md — App‑Level AuthZ with OPA + UseCase Orchestration (NestJS)

These instructions tell Copilot (and contributors) exactly how to implement **app‑level authorization with OPA** while using the **UseCase‑centric Application Layer (Option B)** in our NestJS services. The pattern keeps Domain pure, Infrastructure behind ports, and works for **HTTP + async** paths (BullMQ, Sagas, CRON, Kafka).

---

## Architecture Decision (TL;DR)

- **UseCase orchestrates** Domain + Infrastructure via **ports**.
- **Authorization** uses **OPA** both at ingress (Envoy/sidecar) **and** inside UseCases.
- Separate **`authz.*`** (allow/deny) from **`decisioning.*`** (business calculations like fees/limits/routes).
- Adapters (HTTP, workers, schedulers) call **Command/Query buses** → **thin Handler** → **UseCase**.
- Persist via **EventStoreDB (ESDB)**; trigger integrations via **Outbox → BullMQ v5**.
- Never touch concrete infrastructure from the Domain or Handlers.
- Never throw raw errors: use the **Exception Factory** with our `Record<string, IException>` map.

```
Adapter (HTTP/BullMQ/Kafka/Cron)
  → Command/Query
    → Thin Handler (context + quick DTO validation)
      → UseCase (authz, domain invariants, repo.save, outbox.enqueue)
        → Ports (RepositoryPort, AuthorizationPolicyPort, DecisioningPolicyPort, OutboxPort, Clock, Logger)
          → Infrastructure (ESDB, Redis, BullMQ, HTTP, Keycloak, OPA)
```

---

## Why App‑Level AuthZ if OPA is already at the edge?

1. **Async paths** bypass ingress (BullMQ, Sagas, schedulers).
2. **State‑aware rules** (status transitions, ownership, balance/limits) need current resource context.
3. **Defense in depth** and **auditable** decisions (with correlation/tenant/user) at the exact mutation point.

**Rule:** every mutating UseCase performs an `authz.*` check **before** calling domain methods.

---

## Ports & Contracts (generate these)

> All ports live in `src/shared/ports` or `src/<context>/application/ports`. Use interfaces only.

### `AuthorizationPolicyPort`

```ts
export interface AuthzSubject {
  id: string;
  roles?: string[];
  tenantId: string;
}

export interface AuthzResource {
  type: string; // e.g. "payment"
  id?: string; // optional when creating
  attrs?: any; // state snapshot or relevant attributes
}

export interface AuthzContextMeta {
  correlationId: string;
  tenantId: string;
  occurredAt: string; // ISO date
  source: string; // module/service name
}

export interface AuthzDecision {
  allow: boolean;
  code?: string; // maps to ExceptionFactory keys
  reason?: string;
  policyRev?: string; // bundle/hash for auditing
  obligations?: Record<string, any>;
}

export interface AuthorizationPolicyPort {
  authorize(input: {
    action: string; // e.g. "payment.create"
    subject: AuthzSubject;
    resource: AuthzResource;
    context: AuthzContextMeta;
  }): Promise<AuthzDecision>;
}
```

### `DecisioningPolicyPort` (business rules, non‑security)

```ts
export interface DecisioningPolicyPort {
  evaluateFees(input: {
    amountMinor: number;
    channel: string;
    currency: string;
    tenantId: string;
  }): Promise<{ feeMinor: number; policyRev?: string }>; // pure calculation result
}
```

> **Keep these ports separate.** `authz.*` must stay minimal and fail‑closed. `decisioning.*` can be richer and cacheable.

---

## Infrastructure Adapters (OPA over HTTP)

> Implement these once per service (or share in a lib). Use the local **OPA sidecar** HTTP API: `POST /v1/data/<package>/<entrypoint>`.

```ts
// src/shared/infrastructure/opa/opa.client.ts
import axios, { AxiosInstance } from 'axios';

export class OpaClient {
  private readonly http: AxiosInstance;
  constructor(
    baseURL: string,
    private readonly timeoutMs = 300,
  ) {
    this.http = axios.create({ baseURL, timeout: timeoutMs });
  }
  async query<TInput, TOutput>(
    entrypoint: string,
    input: TInput,
  ): Promise<TOutput> {
    const { data } = await this.http.post(`/v1/data/${entrypoint}`, { input });
    return data?.result as TOutput;
  }
}
```

```ts
// src/shared/infrastructure/opa/authorization.policy.adapter.ts
import {
  AuthorizationPolicyPort,
  AuthzDecision,
} from '../../application/ports/authorization-policy.port';
import { OpaClient } from './opa.client';

export class OpaAuthorizationPolicyAdapter implements AuthorizationPolicyPort {
  constructor(
    private readonly opa: OpaClient,
    private readonly entrypoint = 'authz.allow',
  ) {}
  async authorize(input: any): Promise<AuthzDecision> {
    // Expected Rego result shape: { allow: bool, code?: string, reason?: string, policyRev?: string, obligations?: {...} }
    const result = await this.opa.query<typeof input, AuthzDecision>(
      this.entrypoint,
      input,
    );
    return result ?? { allow: false, code: 'policy_unavailable' };
  }
}
```

```ts
// src/shared/infrastructure/opa/decisioning.policy.adapter.ts
import { DecisioningPolicyPort } from '../../application/ports/decisioning-policy.port';
import { OpaClient } from './opa.client';

export class OpaDecisioningPolicyAdapter implements DecisioningPolicyPort {
  constructor(
    private readonly opa: OpaClient,
    private readonly entrypoint = 'decisioning.fees',
  ) {}
  evaluateFees(input: any) {
    return this.opa.query<
      typeof input,
      { feeMinor: number; policyRev?: string }
    >(this.entrypoint, input);
  }
}
```

**Caching (optional but recommended):** wrap adapters with a short‑TTL in‑memory cache keyed by `(subject, action, resourceHash, policyRev)` for `authz.*`, and by `(tenantId, inputsHash, policyRev)` for `decisioning.*`.

**Failure policy:**

- For **writes** (commands): **fail‑closed** if OPA is unavailable → throw `forbidden` via Exception Factory.
- For **reads** (queries): optional soft‑fail (e.g., restricted results) depending on use case.

---

## Rego Entry Points (policy bundles)

> We ship two bundles/namespaces: `authz.*` and `decisioning.*`. Keep them small and independent.

**`authz.payment` (allow/deny) example:**

```rego
package authz.payment

default allow = false

allow {
  input.action == "payment.create"
  input.subject.tenantId == input.resource.attrs.tenantId
  not exceeds_amount
}

exceeds_amount {
  input.resource.attrs.amountMinor > data.limits.max_per_payment_minor
}

# Result wrapper (entrypoint authz.allow)
package authz

allow := {"allow": allow, "policyRev": data.meta.revision}
```

**`decisioning.fees` example:**

```rego
package decisioning.fees

fee_minor := result {
  base := data.fees.base_minor
  pct  := data.fees.percent
  result := base + round(input.amountMinor * pct / 10000)
}

# Entrypoint returns object used by adapter
result := {"feeMinor": fee_minor, "policyRev": data.meta.revision}
```

---

## UseCase Template (Option B)

> UseCases are the reusable business orchestrators. Handlers are thin and delegate to them. Generators should scaffold this shape per command.

**Input contracts**

```ts
export interface StandardMeta {
  correlationId: string;
  tenantId: string;
  idempotencyKey?: string;
  source: string;
  timestamp: Date;
}

export interface Create{{Entity}}Input {
  user: IUserToken;
  data: Create{{Entity}}Dto;
  meta: StandardMeta;
}

export type {{Entity}}Result = { id: string; version: number };
```

**UseCase**

```ts
@Injectable()
export class Create{{Entity}}UseCase {
  constructor(
    private readonly repo: {{Entity}}RepositoryPort,    // ESDB aggregate repo
    private readonly outbox: OutboxPort,                // BullMQ producer
    private readonly authz: AuthorizationPolicyPort,    // OPA authz
    private readonly decisioning: DecisioningPolicyPort,// OPA decisioning (optional per use case)
    private readonly clock: ClockPort,
    @Inject('ILogger') private readonly logger: ILogger,
    @Inject('ExceptionFactory') private readonly ex: ExceptionFactory,
  ) {}

  async execute({ user, data, meta }: Create{{Entity}}Input): Promise<{{Entity}}Result> {
    // 1) Authorize (fail‑closed)
    const decision = await this.authz.authorize({
      action: '{{entity}}.create',
      subject: { id: user.userId, roles: user.roles, tenantId: meta.tenantId },
      resource: { type: '{{entity}}', attrs: { ...data, tenantId: meta.tenantId } },
      context: { correlationId: meta.correlationId, tenantId: meta.tenantId, occurredAt: meta.timestamp.toISOString(), source: meta.source },
    });
    if (!decision.allow) throw this.ex.throw(decision.code ?? 'forbidden');

    // 2) Optional decisioning (fees/limits/etc.)
    // const { feeMinor } = await this.decisioning.evaluateFees({ amountMinor: data.amountMinor, channel: data.channel, currency: data.currency, tenantId: meta.tenantId });

    // 3) Domain invariants
    const agg = {{Entity}}.create(data, user); // pure domain method

    // 4) Persist (ESDB) with metadata for audit/trace
    await this.repo.save(agg, {
      correlationId: meta.correlationId,
      tenantId: meta.tenantId,
      user,
      idempotencyKey: meta.idempotencyKey,
      source: meta.source,
      occurredAt: this.clock.now(),
    });

    // 5) Outbox for integrations (never call external APIs directly)
    await this.outbox.enqueue('{{entity}}.created.v1', { id: agg.id.value }, {
      correlationId: meta.correlationId,
      tenantId: meta.tenantId,
      user,
      source: meta.source,
      occurredAt: this.clock.now(),
    });

    this.logger.info('{{entity}}.created', { ...meta, {{entity}}Id: agg.id.value });
    return { id: agg.id.value, version: agg.version };
  }
}
```

**Thin Command Handler**

```ts
@CommandHandler(Create{{Entity}}Command)
export class Create{{Entity}}Handler implements ICommandHandler<Create{{Entity}}Command, {{Entity}}Result> {
  constructor(
    private readonly useCase: Create{{Entity}}UseCase,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {}

  async execute(cmd: Create{{Entity}}Command): Promise<{{Entity}}Result> {
    this.logger.info('cmd.received', { type: 'Create{{Entity}}Command', correlationId: cmd.correlationId, tenantId: cmd.tenantId, source: '{{Context}}Module' });
    // Optionally validate DTO here
    return this.useCase.execute({
      user: cmd.user,
      data: cmd.payload,
      meta: {
        correlationId: cmd.correlationId,
        tenantId: cmd.tenantId,
        idempotencyKey: cmd.idempotencyKey,
        source: '{{Context}}Module',
        timestamp: new Date(),
      },
    });
  }
}
```

---

## Module Wiring (providers your generator must add)

```ts
// src/{{context}}/{{context}}.module.ts
@Module({
  imports: [CqrsModule],
  providers: [
    // UseCases
    Create{{Entity}}UseCase,

    // Handlers
    Create{{Entity}}Handler,

    // Ports → Adapters
    { provide: AuthorizationPolicyPort, useFactory: () => new OpaAuthorizationPolicyAdapter(new OpaClient(process.env.OPA_URL ?? 'http://localhost:8181'), 'authz.allow') },
    { provide: DecisioningPolicyPort, useFactory: () => new OpaDecisioningPolicyAdapter(new OpaClient(process.env.OPA_URL ?? 'http://localhost:8181'), 'decisioning.fees') },

    // Repo & Outbox ports bound to infrastructure
    { provide: {{Entity}}RepositoryPort, useClass: Esdb{{Entity}}Repository },
    { provide: OutboxPort, useClass: BullmqOutboxAdapter },
    { provide: ClockPort, useClass: SystemClock },

    // Cross‑cutting
    { provide: 'ExceptionFactory', useClass: DomainExceptionFactory },
    { provide: 'ILogger', useClass: PinoLoggerAdapter },
  ],
})
export class {{Context}}Module {}
```

> **Note:** for BullMQ v5, use shared `ioredis` connections and your small Nest module (see our separate BullMQ COPILOT docs). The Outbox adapter should enqueue jobs with the **initiator user/tenant/correlationId** in job data or opts.

---

## Async Paths (BullMQ/Sagas/Cron) — carry identity & re‑authorize

- Job payloads **must include**: `user { userId, roles, tenantId }`, `correlationId`, `tenantId`, `idempotencyKey?`, `source`, `timestamp`.
- Workers call **the same UseCases** (Option B reuse) → the UseCase performs **`authz.*`** again with current state.

```ts
// Example worker calling the same use case
await this.commandBus.execute(new Create{{Entity}}Command(job.data.user, job.data.payload, job.data.correlationId, job.data.tenantId, job.id));
```

---

## Exception Strategy (no raw errors)

- Map all failures via `ExceptionFactory` using your `Record<string, IException>` (statusCode, message, code, description, exception type).
- Typical keys: `forbidden`, `policy_unavailable`, `user_required`, `not_found`, `conflict`, `validation_failed`.

```ts
export class DomainExceptionFactory {
  constructor(private readonly map: Record<string, IException>) {}
  throw(key: string, extra?: any): never {
    const e = this.map[key] ?? this.map['internal_error'];
    // Construct framework exception (e.exception) with e.statusCode and payload
    // ...
    throw new UnauthorizedException({
      code: e.code,
      message: e.message,
      description: e.description,
      extra,
    });
  }
}
```

---

## Logging & Tracing

- **Correlate everything** with `correlationId` + `tenantId` + `userId`.
- Handler logs: `cmd.received` / `qry.received`.
- UseCase logs: `authz.checked`, `domain.validated`, `persisted`, `outbox.enqueued`.
- Projectors/workers: `job.started`, `job.completed`, `job.failed` with the same correlationId.

---

## Testing Guidance (scaffold this)

- **UseCase tests** (highest value): mock `AuthorizationPolicyPort`, `DecisioningPolicyPort`, `RepositoryPort`, `OutboxPort`.

  - Happy path: allow → domain create → save → outbox.
  - Deny path: `allow=false` → throws `forbidden`.
  - OPA down: adapter throws → UseCase throws `policy_unavailable` (fail‑closed).

- **Handler test**: ensures delegation to UseCase and log context.
- **OPA policy tests**: Rego unit tests for entrypoints.

---

## Operational Notes

- **Bundles:** Ship two policy bundles: `authz` and `decisioning`. Keep entrypoints stable.
- **Timeouts:** keep OPA HTTP timeouts tight (100–300ms). Writes fail‑closed.
- **Circuit breaker:** short‑lived; log and alert on `policy_unavailable` spikes.
- **Observability:** record `policyRev` in logs and ESDB event metadata.
- **Performance:** use partial eval & data filtering in OPA only if necessary; keep `authz.*` fast and simple.

---

## Generator Hooks (what to scaffold per entity)

For each `{{Entity}}` in `{{Context}}`:

1. **Command + Handler** files (`application/commands/{{entity}}`).
2. **UseCase** file (`application/use-cases/{{entity}}`).
3. **Ports** imports + **Module providers** wiring.
4. **Repo** method stubs (`save`, `getById`, optimistic concurrency).
5. **Outbox** enqueue call with standard metadata.
6. **Policy calls** (`authz.authorize` + optional `decisioning.evaluate*`).
7. **Tests** for UseCase + Handler.
8. **ExceptionFactory** integration.
9. **Logger** context with `correlationId`.

> The generator should enforce the rule: **no infrastructure in UseCase imports**, only ports.

---

## Example: Payment Create (end‑to‑end snippet list)

- `CreatePaymentCommand/Handler`
- `CreatePaymentUseCase` calling `AuthorizationPolicyPort` and `PaymentRepositoryPort` → `EsdbPaymentRepository` and `OutboxPort`
- OPA Rego: `authz.payment`, entrypoint `authz.allow`
- OPA Rego: `decisioning.fees`, entrypoint `decisioning.fees`
- Module providers wiring (see above)
- Tests for allow/deny and OPA unavailable

---

## Do / Don’t Checklist

**Do**

- Re‑authorize inside UseCases, even with Envoy/OPA at the edge.
- Keep `authz.*` entrypoints minimal (boolean + code/reason).
- Separate `decisioning.*` for business calculations.
- Attach metadata (user, tenant, correlationId, idempotencyKey, occurredAt, source) to every persisted event and outbox message.
- Fail‑closed for writes when OPA is unreachable.

**Don’t**

- Call external APIs from UseCases directly; use Outbox + workers.
- Put transport (HTTP/BullMQ/Kafka) or OPA client code in Domain or Handlers.
- Throw raw `Error`; always go through `ExceptionFactory`.
- Skip re‑auth on async workers.

---

## Quick Start (for a new entity)

1. Generate `Create{{Entity}}Command/Handler` and `Create{{Entity}}UseCase`.
2. Wire `AuthorizationPolicyPort` and optional `DecisioningPolicyPort` adapters (OPA sidecar URL `OPA_URL`).
3. Write Rego policies for `authz.{{entity}}` + `decisioning.*` if needed.
4. Implement `Esdb{{Entity}}Repository` and `OutboxPort` enqueue.
5. Add tests (allow/deny/unavailable).
6. Deploy with OPA sidecar; ship bundles; verify `policyRev` in logs.

---

**Contact:** Architecture channel — tag @security @platform when changing `authz.*` or `decisioning.*` entrypoints or contracts.
