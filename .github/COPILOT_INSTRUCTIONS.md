# COPILOT_INSTRUCTIONS.md

> A compact playbook so GitHub Copilot (and Copilot Chat) can generate code that fits our stack, patterns, and guardrails—without surprises.

---

## 1) Purpose

This repo uses **NestJS + TypeScript** with **DDD + CQRS + Event Sourcing (EventStoreDB)** and **Redis projections**. We authenticate with **Keycloak** and authorize with **OPA**. Asynchrony is handled with **BullMQ** (jobs) and an **Integration Outbox** (pub to Kafka/webhooks/etc).

These instructions tell Copilot **what “good” looks like** here: file layout, naming, conventions, examples, and “don’t do this” rules.

---

## 2) TL;DR for Copilot

- **Prefer DDD**: generate Aggregates, Value Objects, Repositories, Use Cases, Handlers. Keep domain pure.
- **CQRS**: Commands mutate via ESDB events; Queries read **from self** (service’s own projection DB or Redis).
- **Events are immutable**. Schema changes **bump the version** (`.v2`, `.v3`, …). Never mutate old events.
- **ESDB metadata** must include: `correlationId`, `tenantId`, `userId`, `source`, `occurredAt`.
- **Outbox** for integration messages. Use `(sourceStreamId, sourceEventId)` as idempotency fence.
- **AuthN/AuthZ**: Keycloak for user, OPA for permission checks. Don’t hardcode policy logic.
- **Tests**: unit tests (domain/use-cases), integration tests for adapters. No network calls in unit tests.
- **Logs**: Use our `ILogger` abstraction (Pino under the hood). Add correlation IDs to all logs.
- **Conventional Commits** and **strict linting** apply.

When unsure, **ask for the missing domain inputs** (types, invariants, edge cases) in TODOs at the top of generated files.

---

## 3) Stack & Architecture (Context for Copilot)

- **Runtime**: Node.js ≥ 18, NestJS
- **Patterns**: DDD, CQRS, Event Sourcing (EventStoreDB), read-from-self
- **Projections**: Per-service DB (SQLite/Postgres/Mongo) or Redis cache (snapshots for fast reads)
- **Async**: BullMQ for background jobs; Integration Outbox for external publishes
- **Auth**: Keycloak (AuthN)
- **AuthZ**: Open Policy Agent (OPA) via HTTP/WASM; policies are externalized
- **Observability**: Pino logs → (Promtail → Loki → Grafana) \[pipeline varies by env]

---

## 4) Repository Layout (Generate to these places)

```
src/
  <bounded-context>/
    application/
      commands/ | queries/ | use-cases/ | handlers/
    domain/
      aggregates/ | entities/ | value-objects/ | events/ | exceptions/ | properties/
      services/ (pure domain services)
    infrastructure/
      repositories/ | adapters/ | esdb/ | http/ | persistence/
    interface/
      controllers/ | dto/ | guards/ | interceptors/
  shared/
    auth/ | logger/ | application/ | domain/ | event-store/ | message-queue/ | utils/
integration-outbox/
  domain/ | application/ | infrastructure/
```

**Naming**: `kebab-case` files, `PascalCase` classes, `*.entity.ts` for TypeORM, `*.aggregate.ts` for domain aggregates, `*.event.ts` for events, `*.use-case.ts`, `*.handler.ts`.

---

## 5) API Conventions

**Base routes**

- Banking-style modules: `/api/v1/fintech-banking-product/{domain}/{resource}`
- Health: `/actuator/{endpoint}`
- Docs: `/api/docs/{module}`

**DTOs**

- Validate with `class-validator` and `class-transformer`.
- No domain logic inside DTOs.

**Error shape (example)**

```json
{
  "statusCode": 403,
  "message": "Insufficient permissions for this operation",
  "error": "Forbidden",
  "timestamp": "2025-07-23T10:30:00.000Z",
  "path": "/api/v1/fintech-banking-product/accounts/123456",
  "security_context": {
    "policy_violation": "transfer_amount_limit",
    "required_permission": "approve:large_transfer",
    "user_permissions": ["read:account", "create:small_transfer"]
  }
}
```

---

## 6) DDD + CQRS Rules

- **Aggregates** own invariants, raise **domain events**, and are reconstructed from ESDB.
- **Commands** mutate state; **Queries** never mutate.
- **Use Cases** encapsulate application logic. Handlers delegate to use cases.
- **Repositories** persist aggregates via ESDB and supply snapshots to speed rebuilds.
- **Value Objects** are immutable; validate in constructors.
- **Never** couple controllers directly to repositories or ESDB; go through use cases.

---

## 7) EventStoreDB Rules

**Event naming**: `<category>.<action>.<result?>.v<major>`
Examples: `payment.requested.v1`, `payment.completed.v1`, `transaction.failed.v1`

**Event metadata (required)**:

```ts
interface EventStoreMetaProps {
  correlationId: string;
  tenantId?: string;
  userId?: string;
  source: string; // originating service/module
  occurredAt: string; // ISO timestamp
  idempotencyKey?: string;
  headers?: Record<string, any>;
}
```

**Versioning**:

- Any schema change → **bump version** (`.v2`).
- Never rewrite old events.

**Snapshots**:

- Keep snapshots lean (latest aggregate state).
- Rehydrate: `snapshot → events since snapshot`.
- Store snapshot metadata (version, as-of event number).

---

## 8) Integration Outbox + BullMQ

- **When domain event occurs** → projector maps to **integration outbox row**.
- Outbox row has unique `(sourceStreamId, sourceEventId)` to enforce idempotency.
- Dispatcher claims due rows with **SKIP LOCKED** and publishes (Kafka/webhook/etc).
- Backoff with jitter; dead-letter after `maxAttempts`.

**Minimal outbox shape**

```ts
{
  id: string,
  sourceStreamId: string,
  sourceEventId: string,
  correlationId?: string,
  tenantId?: string,
  userId?: string,
  integrationType: string, // e.g., "kafka:payments" | "webhook:partnerX"
  eventType: string,       // e.g., "payment.completed.v1"
  payload: Record<string, any>,
  headers?: Record<string, any>,
  status: "PENDING" | "CLAIMED" | "SENT" | "FAILED" | "DEAD",
  dueAt: Date,
  attempts: number,
  maxAttempts: number
}
```

**BullMQ**:

- Keep **job payloads** small; reference IDs for heavy data.
- Use **repeatable jobs** for dispatcher ticks.
- Job metadata: include `correlationId`, `tenantId`, `userId`, `source`, `timestamp`.

---

## 9) Security & Access

- **AuthN**: Keycloak (bearer tokens/JWT). Controllers extract user context into `IUserToken`.
- **AuthZ**: OPA policy checks in use cases or guards. **Never** inline business policy logic; **evaluate via OPA**.
- **Secrets**: Use Doppler (dev) or platform secret manager. **Never** commit secrets.
- **Input validation**: All external inputs validated at DTO boundary. Extra validation in value objects.

---

## 10) Logging & Observability

- Use `ILogger` abstraction. Always log with:

  - `correlationId`, `tenantId`, `userId`, `source`, `operation`, `phase`

- Log **start** and **end** of use cases, with duration.
- No PII in logs. Truncate payloads; prefer IDs.

---

## 11) Testing Strategy

- **Unit tests**: Aggregates, value objects, use cases (no network or ESDB).
- **Integration tests**: repository/adapters with ESDB test container, Redis, DB.
- **Contract tests**: external integrations (webhooks/Kafka) with mocks or local brokers.
- **Fixtures**: factory helpers for events, aggregates, JWTs.

---

## 12) Code Style & Tooling

- **ESLint + Prettier**, strict TS config.
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`).
- **Husky/Commitlint** enabled.
- Prefer **async/await**, no floating promises.
- Keep modules small and cohesive.

---

## 13) “Do/Don’t” for Copilot

**Do**

- Generate domain-first code (aggregate + events + use-case + handler).
- Put infra concerns behind adapters/repositories.
- Add `TODO:` questions when domain facts are unknown.
- Use explicit types; narrow unions; never `any`.

**Don’t**

- Don’t leak HTTP, DB, or OPA calls into domain code.
- Don’t mutate event schemas in place.
- Don’t add cross-context imports that break boundaries.
- Don’t invent environment variables or secrets.

---

## 14) Templates (Use These Patterns)

### 14.1 Domain Event

```ts
// src/<bc>/domain/events/payment-requested.v1.event.ts
export class PaymentRequestedV1Event {
  constructor(
    public readonly paymentId: string,
    public readonly amountMinor: number,
    public readonly currency: string,
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
  ) {}
}
```

### 14.2 Aggregate (excerpt)

```ts
export class Payment extends AggregateRoot {
  private constructor(private props: PaymentProps) {
    super();
  }

  static request(props: RequestPaymentProps): Payment {
    // validate invariants, create value objects
    const payment = new Payment(/* props */);
    payment.apply(new PaymentRequestedV1Event(/* fields */));
    return payment;
  }

  validateState() {
    // enforce invariants; throw domain exceptions when violated
  }

  static fromSnapshot(s: PaymentSnapshot): Payment {
    return new Payment(/* map snapshot to props */);
  }
}
```

### 14.3 Command + Handler

```ts
// command
export class RequestPaymentCommand {
  constructor(
    public readonly user: IUserToken,
    public readonly dto: RequestPaymentDto,
  ) {}
}

// handler
@CommandHandler(RequestPaymentCommand)
export class RequestPaymentHandler
  implements ICommandHandler<RequestPaymentCommand>
{
  constructor(private readonly useCase: RequestPaymentUseCase) {}
  async execute(cmd: RequestPaymentCommand) {
    return this.useCase.execute(cmd.user, cmd.dto);
  }
}
```

### 14.4 Use Case (App Layer)

```ts
@Injectable()
export class RequestPaymentUseCase {
  constructor(
    private readonly repo: PaymentRepository,
    @Inject('ILogger') private readonly logger: ILogger,
    private readonly opa: OpaAuthorizationAdapter,
  ) {}

  async execute(user: IUserToken, dto: RequestPaymentDto) {
    const ctx = {
      correlationId: dto.correlationId,
      userId: user.id,
      tenantId: user.tenantId,
      source: 'PaymentModule',
    };
    this.logger.info({ ...ctx, operation: 'REQUEST_PAYMENT', phase: 'START' });

    await this.opa.assert(user, {
      action: 'payment:request',
      amountMinor: dto.amountMinor,
    });

    const aggregate = Payment.request(/* map dto → props */);
    await this.repo.save(user, aggregate); // emits ESDB events, snapshot as needed

    this.logger.info({ ...ctx, operation: 'REQUEST_PAYMENT', phase: 'END' });
    return { id: aggregate.id };
  }
}
```

### 14.5 ESDB Repository (excerpt)

```ts
export class PaymentRepository {
  constructor(private readonly esdb: EventStoreService) {}

  async save(user: IUserToken, agg: Payment) {
    const events = agg.getUncommittedEvents().map(e =>
      serializeDomainEvent(e, {
        correlationId: /* from user/request */,
        tenantId: user.tenantId,
        userId: user.id,
        source: 'PaymentModule',
        occurredAt: new Date().toISOString(),
      })
    );
    await this.esdb.appendToStream(agg.streamId, events, /* expectedVersion */);
    agg.commit();
  }
}
```

### 14.6 Integration Outbox Projector (excerpt)

```ts
@Injectable()
export class PaymentOutboxProjector {
  constructor(private readonly outbox: OutboxRepository) {}

  async onPaymentCompleted(
    evt: PaymentCompletedV1Event,
    meta: EventStoreMetaProps,
  ) {
    await this.outbox.enqueue({
      sourceStreamId: meta.streamId,
      sourceEventId: meta.eventId,
      correlationId: meta.correlationId,
      tenantId: meta.tenantId,
      userId: meta.userId,
      integrationType: 'kafka:payments',
      eventType: 'payment.completed.v1',
      payload: {
        paymentId: evt.paymentId,
        amountMinor: evt.amountMinor,
        currency: evt.currency,
      },
      headers: { idempotencyKey: meta.eventId },
    });
  }
}
```

---

## 15) Example Copilot Prompts (Paste into Copilot Chat)

- “Generate a **PaymentRequested** aggregate with `request()` factory, `validateState()`, events `payment.requested.v1` and `payment.failed.v1`. Include value objects for `Money` and `AccountId`. Add unit tests.”
- “Create a **RequestPaymentUseCase** and **RequestPaymentHandler** that saves to ESDB via `PaymentRepository`, logs start/end with correlationId, and checks OPA `payment:request`.”
- “Add an **Outbox projector** mapping `payment.completed.v1` → `kafka:payments` outbox row. Include idempotency via `(sourceStreamId, sourceEventId)`.”
- “Scaffold a NestJS **controller** `POST /payments` calling the `RequestPaymentCommand`, validating DTO with class-validator, returning `201` with `{ id }`.”
- “Write **unit tests** for `Money` value object (invalid currency, negative amount) and `Payment.request()` (invariants).”
- “Refactor existing handler to **delegate to use case** and remove infra details from domain.”

---

## 16) Commit & PR Guidelines

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`
- **PR checklist**:

  - [ ] Domain invariants covered
  - [ ] ESDB event names & versions correct
  - [ ] Metadata present (correlation/tenant/user/source)
  - [ ] Outbox / jobs idempotent
  - [ ] DTOs validated; no domain logic in controllers
  - [ ] Tests added/updated; pass locally
  - [ ] Logs include correlationId

---

## 17) Environment & Secrets

- Use **Doppler** (dev) or platform secret manager.
- Do not hardcode tokens/URLs. For Slack, Kafka, webhooks, etc., read from config service.

---

## 18) Performance & Resilience

- Keep aggregates **small**; avoid chatty write models.
- Snapshots for hot aggregates; cap rebuild time.
- Backoff with jitter for outbox & jobs; dead-letter responsibly.
- Avoid N+1 calls in projections and queries.

---

## 19) What to Ask When Context Is Missing (Copilot TODOs)

- **Domain**: invariant list, failure modes, currency rules, tenancy boundaries.
- **AuthZ**: exact OPA policy inputs/outputs.
- **Events**: schema fields, version bumps, migration strategy for readers.
- **Integrations**: target channel (`kafka:*`, `webhook:*`), retry policy, idempotency keys.

---

## 20) Quick Reference Snippets

**Event name examples**

- `transaction.created.v1`
- `transaction.failed.v1`
- `account.holder-updated.v2`

**Endpoint patterns**

- `/api/v1/fintech-banking-product/{domain}/{resource}`
- `/actuator/health`
- `/api/docs/{module}`

---

### Final note

Copilot: **opt for explicitness over cleverness**. If unsure, generate a clean skeleton with top-of-file `TODO:` questions. We will fill them in.
