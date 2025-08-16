# COPILOT_INSTRUCTIONS.md — DDD + CQRS Strategy for a Modular Monolith (with Service Extraction)

> **Purpose:** Give GitHub Copilot enough context to generate production‑grade code that follows our DDD + CQRS conventions in a modular monolith that can later be extracted into services without rewrites.

---

## 0) Executive Principles

- **DDD first:** Model the domain in rich aggregates and value objects; code mirrors ubiquitous language.
- **CQRS always:** Commands mutate the write model; queries read from projections. No read‑after‑write shortcuts.
- **Event Sourcing (ESDB):** Write model persists domain events. State is reconstructed from events + snapshots.
- **Read from self:** Each context owns its read models (Redis/SQL), built from its events.
- **Separation of concerns:** Domain ≠ Application ≠ Infrastructure ≠ Interface (API). No leaking upward/downward.
- **Never throw across layers:** Use `Result<T,E>` and typed errors; map to Problem Details at the edge.
- **Observable & auditable:** Correlation IDs, user/tenant metadata on every event and log.
- **Security:** AuthN via Keycloak (JWT). AuthZ via OPA (policy decisions) before mutation or sensitive read.
- **Scalable path:** Keep boundaries clear so extraction to microservices is a logistics task, not a rewrite.

---

## 1) High‑Level Folder Layout (Monorepo / Modular Monolith)

```
apps/
  api/                          # NestJS API (controllers, module wiring, DI only)
    src/
      main.ts
      app.module.ts
      interfaces/              # HTTP/GraphQL adapters; no domain logic
        http/
        graphql/
      config/                  # App/bootstrap config only (no domain)

contexts/                      # One folder per bounded context
  payments/
    domain/                    # Pure domain layer (no Nest imports)
      aggregates/
      entities/
      value-objects/
      events/                  # Domain events (and schemas)
      policies/                # Invariants/business rules (pure TS)
      services/                # Domain services (pure TS)
      errors/                  # Domain-specific error types
    application/               # Use cases, commands, queries, ports
      commands/
      queries/
      use-cases/
      dto/
      ports/                   # Interfaces to infra (repositories, gateways)
      mappers/
    infrastructure/            # Adapters implementing ports
      persistence/
        esdb/                  # EventStoreDB repository for aggregates
        projections/           # Projectors (ESDB -> Redis/SQL)
        read-models/           # TypeORM entities and repos for queries
        outbox/                # Outbox + BullMQ integration
      messaging/
        bullmq/
      http/
      opa/
    interface/                 # Module-level controllers/resolvers (maps edge <-> app layer)
      http/
      graphql/
    payments.module.ts

  ledger/
  products/
  notifications/

shared/
  core/                        # Cross-cutting: Result, Either, Guard utils, types
  logging/                     # Pino logger providers + helpers
  security/                    # Auth (Keycloak), OPA client, decorators
  config/                      # Centralized config manager + typings
  errors/                      # ProblemDetails mapping, interceptors
  message-queue/               # BullMQ primitives, job metadata
  utils/                       # Small pure utilities only (no domain)

tools/
  scripts/                     # Generators, code mods, scaffolding
  devops/                      # docker-compose, loki/promtail, etc.
```

> **Rule of thumb:**
>
> - `domain/` has **no** Nest imports and **no** infrastructure types.
> - `application/` imports `domain/` and defines **ports**. No infrastructure here.
> - `infrastructure/` implements ports and wiring to ESDB/Redis/TypeORM/BullMQ/HTTP/OPA.
> - `interface/` is the outer adapter (controllers/resolvers). It maps HTTP/GraphQL ↔ DTOs ↔ use cases.

---

## 2) Layer Responsibilities & Allowed Dependencies

```
interface  -> application -> domain
               ^      |
               |      v
         infrastructure (implements application ports)
```

- **Domain**
  - Aggregates, value objects, domain events, invariants, domain services.
  - No side effects or I/O. Deterministic business logic.

- **Application**
  - Commands/queries and use cases that orchestrate domain operations.
  - Calls **ports** only; never calls vendor SDKs nor TypeORM directly.
  - Cross‑cutting policies: authorization (OPA), idempotency guards, correlation.

- **Infrastructure**
  - Implements ports: repositories (ESDB), projectors, read stores (Redis/SQL), outbox, HTTP gateways.
  - Technical details live here. Replaceable without touching domain/application.

- **Interface (API)**
  - Controllers/resolvers/handlers, validation, Problem Details mapping.
  - No business logic beyond parameter shaping and response mapping.

> **Dependency rule:** Lower layers do not depend on higher layers. Domain is at the center.

---

## 3) CQRS & Event Sourcing Flow (Write Side)

**Command → Use Case → Aggregate → Events → ESDB**

1. Controller validates input and **authorizes** via OPA before mutation.
2. Application command handler loads aggregate from ESDB (via repository port).
3. Aggregate method enforces invariants, returns new events (no I/O inside aggregate).
4. Repository appends events to ESDB with metadata `{ correlationId, user, tenant, source }`.
5. Snapshots are written per policy (e.g., every N events or time‑based) to speed rebuilds.

**Read Side**

- Projectors subscribe to ESDB (catch‑up or persistent) and build projections in Redis and/or SQL (TypeORM).
- Queries hit **only** read models. Never reach into aggregates.

**Outbox & Async**

- Write side also writes to an **outbox** entry (in infra) within the same unit of work.
- A BullMQ worker delivers messages to other contexts/services reliably (idempotent, retryable).

---

## 4) Naming & Conventions

- **Aggregate names:** `Product`, `Payment`, `LedgerAccount`.
- **Events:** `payment.created.v1`, `product.channel.added.v1` (lowercase dotted, suffixed by version).
- **Commands:** `CreatePaymentCommand`, `AddProductChannelCommand`.
- **Queries:** `GetPaymentByIdQuery`, `ListProductsQuery`.
- **Use cases:** Verb‑centric: `CreatePaymentUseCase`.
- **Repositories (ports):** `PaymentRepository` with methods `load`, `save`, `exists`.
- **Read entities:** TypeORM entities live under `infrastructure/read-models`.
- **Mappers:** `application/mappers` for DTO ↔ domain mapping.
- **Errors:** Domain errors per bounded context; never leak infra errors upward.

---

## 5) How to Ask Copilot (Prompts)

**Scaffold a new bounded context**

- _Prompt:_ “Create a `payments` context with domain/application/infrastructure/interface folders and a `PaymentsModule`. Add a `Payment` aggregate with id, amount, currency, status. Include events `payment.created.v1`, `payment.authorized.v1`, `payment.failed.v1`.”

**Add a command + use case**

- _Prompt:_ “In `payments/application/commands`, add `CreatePaymentCommand` and handler. In `use-cases`, implement `CreatePaymentUseCase` that loads or creates the aggregate, validates via OPA, and saves via repository port.”

**Repository (ESDB) implementation**

- _Prompt:_ “In `payments/infrastructure/persistence/esdb`, implement `EsdbPaymentRepository` that reconstructs `Payment` from events and snapshots, appends new events with metadata, and supports expected‑version checks.”

**Projector & read model**

- _Prompt:_ “In `payments/infrastructure/projections`, add `PaymentProjector` that listens to `payment.*` events and updates Redis & SQL read models. Keep idempotency with checkpoints.”

**Query handler**

- _Prompt:_ “Add `GetPaymentByIdQuery` and a handler that reads from the SQL read model only. No aggregate access.”

---

## 6) Ports You Can Rely On (per Context)

- `PaymentRepository` (ESDB)
- `SnapshotStore`
- `ProjectorCheckpointStore`
- `OutboxRepository`
- `MessageQueue` (BullMQ)
- `OpaAuthorizationPort`
- `Clock` & `IdGenerator` (for determinism)
- `ReadModelStore` (TypeORM) and/or `CacheStore` (Redis)

> **Note:** Ports are declared in `application/ports` and implemented in `infrastructure`.

---

## 7) Security & Metadata

- **Every event** carries `correlationId`, `causationId` (if applicable), `user` (id, email, tenant), `source` (service/module), `occurredAt`.
- **OPA checks** happen in the application layer before mutating. For sensitive reads, check policies too.
- Edge adapters (controllers) map unauthorized decisions to Problem Details (RFC 9457).

---

## 8) Logging, Telemetry, and Tracing

- Use Pino; inject an app logger token.
- `Log.info|warn|error(logger, message, context)` helpers in `shared/logging` with correlation IDs.
- Emit structured logs at boundaries: command start/end, repository load/save, projector advance, worker success/failure.

---

## 9) Testing Strategy

- **Domain:** Pure unit tests for aggregates/services (no Nest).
- **Application:** Use case tests with **mock ports**.
- **Infrastructure:** Integration tests against ESDB/Redis/SQL (docker‑compose profile).
- **Interface:** E2E tests that hit controllers and assert Problem Details + read‑model behavior.

---

## 10) Service Extraction Playbook

When a context needs to scale independently:

1. **Confirm clean boundaries**: No cross‑context imports except via ports/messages.
2. **Split deployment**: Package `contexts/<name>` as its own Nest app; reuse the same folder layout.
3. **Move adapters**: Keep domain/application unchanged. Move `interface` and `infrastructure` into the new service.
4. **Stabilize contracts**: Freeze command/query DTOs and event names. Add versioning if needed.
5. **Messaging**: Replace in‑process calls with HTTP/gRPC or messages; continue to use outbox + BullMQ/Kafka.
6. **Data**: Each service retains its own projections/read stores. No shared DBs.
7. **Security/Observability**: Keep the same OPA policies and logging/trace correlation semantics.

> **Goal:** Extraction is organizational, not architectural. The domain/application code remains identical.

---

## 11) Checklists for Copilot

**Bounded Context – New Feature**

- [ ] Domain: aggregate + events + invariants completed
- [ ] Application: command, handler, use case, ports defined
- [ ] Infrastructure: repository (ESDB), projectors, read models, outbox
- [ ] Interface: controller/resolver + DTO mappers + validation
- [ ] Security: OPA checks in use case; JWT guard at controller
- [ ] Observability: logs with correlationId + user metadata
- [ ] Tests: domain unit, use case with mocks, infra integration

**Event & Projection**

- [ ] Event name lower.dotted.v{n}, payload schema versioned
- [ ] Snapshot policy defined
- [ ] Projector idempotent with checkpointing
- [ ] Read model migration (TypeORM) scripted

**Read Model Query**

- [ ] Only reads from projections (Redis/SQL); no domain access
- [ ] Pagination/sorting/search constraints handled in SQL/Redis

---

## 12) Sample Skeletons (abbreviated)

**Payment aggregate (domain)**

```ts
export class Payment {
  private constructor(
    readonly id: PaymentId,
    private amount: Money,
    private status: PaymentStatus,
  ) {}

  static create(props: {
    id: PaymentId;
    amount: Money;
  }): Result<Payment, DomainError> {
    // invariants ...
    const events = [
      new PaymentCreatedEvent(props.id.value, props.amount.toJSON()),
    ];
    return Result.ok(
      new Payment(props.id, props.amount, PaymentStatus.Pending),
      events,
    );
  }

  authorize(): Result<DomainEvent[]> {
    /* ... */
  }
}
```

**Application port**

```ts
export interface PaymentRepository {
  load(id: string): Promise<Result<Payment | null, RepoError>>;
  save(
    agg: Payment,
    events: DomainEvent[],
    meta: EventMeta,
  ): Promise<Result<void, RepoError>>;
}
```

**Use case**

```ts
export class CreatePaymentUseCase {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly opa: OpaAuthorizationPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(dto: CreatePaymentDto, user: UserCtx, correlationId: string) {
    await this.opa.ensureAllowed(user, 'payment:create', dto); // fail-closed
    const id = this.ids.newId();
    const result = Payment.create({
      id: new PaymentId(id),
      amount: Money.from(dto.amount, dto.currency),
    });
    if (result.isErr()) return result;
    const [payment, events] = result.unwrapWithEvents();
    return this.repo.save(payment, events, {
      correlationId,
      user,
      occurredAt: this.clock.now(),
    });
  }
}
```

---

## 13) Don’ts (what Copilot must avoid)

- ❌ Calling TypeORM or external SDKs from domain/application
- ❌ Controllers mutating state directly
- ❌ Reading aggregates in queries (read from projections only)
- ❌ Throwing infrastructure errors through the API boundary
- ❌ Shared databases across contexts
- ❌ Events without metadata (correlationId/user/tenant)

---

## 14) Dev Tips for This Repo

- Prefer **pure functions** and **value objects** for business rules.
- Keep **DTOs** (edge) separate from **domain** (core) models; map explicitly in mappers.
- Version **events** and **DTOs** deliberately; never break consumers silently.
- Keep **projectors** small and idempotent; store checkpoints.
- Use **feature flags** at the application layer, not in domain.

---

## 15) Ready‑to‑Use Copilot Prompts (copy/paste)

1. “Generate a `Product` aggregate with events `product.created.v1`, `product.updated.v1`, invariants for unique code, and a `Result`‑based API. No Nest imports.”
2. “Add `CreateProductCommand`, handler, and `CreateProductUseCase`. Validate with OPA before saving. Use repository port.”
3. “Implement `EsdbProductRepository` under `infrastructure/persistence/esdb` with snapshotting every 100 events.”
4. “Create a projector that listens to `product.*` and writes a SQL read model (`products` table) with TypeORM + a Redis cache.”
5. “Add queries `GetProductByIdQuery` and `SearchProductsQuery` that read from the SQL/Redis read model only.”

---

**End of instructions.**
