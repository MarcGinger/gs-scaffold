# COPILOT Framework Instructions: Enterprise DDD + CQRS + Event Sourcing Architecture

> **Purpose:** Give GitHub Copilot complete, _correct_ context to generate production‑grade code that fits our enterprise architecture: DDD + CQRS + Event Sourcing (EventStoreDB) + BullMQ v5 + OPA + Keycloak + Redis + Pino + W3C Trace Context.

---

## 1) Architecture Foundation

### Core Principles

- **DDD with bounded contexts & aggregates.** Clear ownership and module boundaries.
- **CQRS + Event Sourcing.** ESDB is the write model source of truth; read models are projections/caches.
- **Hexagonal Architecture (ports/adapters).** No infra imports in domain/application; everything external goes through ports.
- \*\*Nev## 10) Testing Patterns

### Domain Layer Testing (Result Pattern)

```ts
describe('{{Entity}} Domain', () => {
  let mockUser: IUserToken;

  beforeEach(() => {
    mockUser = {
      userId: 'user-123',
      roles: ['user'],
      tenantId: 'tenant-123',
      email: 'test@example.com',
    };
  });

  it('should return Ok when valid data provided', () => {
    // Arrange
    const validData = { name: 'Test Entity', description: 'Valid description' };

    // Act
    const result = {{Entity}}.create(validData, mockUser);

    // Assert
    expect(result.isOk()).toBe(true);
    expect(result.value).toBeInstanceOf({{Entity}});
    expect(result.value.id).toBeDefined();
  });

  it('should return Err when invalid data provided', () => {
    // Arrange
    const invalidData = { name: '', description: 'Valid description' };

    // Act
    const result = {{Entity}}.create(invalidData, mockUser);

    // Assert
    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('name_required');
  });

  it('should update status successfully', () => {
    // Arrange
    const entity = {{Entity}}.create({ name: 'Test' }, mockUser).value;

    // Act
    const result = entity.updateStatus({{Entity}}Status.Inactive, mockUser);

    // Assert
    expect(result.isOk()).toBe(true);
  });
});
```

### UseCase Testing (Authorization & Error Mapping)

````ts
describe('Create{{Entity}}UseCase', () => {
  let useCase: Create{{Entity}}UseCase;
  let mockRepo: jest.Mocked<{{Entity}}RepositoryPort>;
  let mockAuthz: jest.Mocked<AuthorizationPolicyPort>;
  let mockOutbox: jest.Mocked<OutboxPort>;
  let mockClock: jest.Mocked<ClockPort>;
  let mockEx: jest.Mocked<DomainExceptionFactory>;

  beforeEach(() => {
    mockRepo = createMock<{{Entity}}RepositoryPort>();
    mockAuthz = createMock<AuthorizationPolicyPort>();
    mockOutbox = createMock<OutboxPort>();
    mockClock = createMock<ClockPort>();
    mockEx = createMock<DomainExceptionFactory>();

    mockClock.now.mockReturnValue(new Date());

    useCase = new Create{{Entity}}UseCase(
      mockRepo,
      mockOutbox,
      mockAuthz,
      mockClock,
      createMock<ILogger>(),
      mockEx,
    );
  });

  it('should create entity when authorized and domain validates', async () => {
    // Arrange
    mockAuthz.authorize.mockResolvedValue({ allow: true, policyRev: '1.0' });
    const validInput = createValidInput();

    // Act
    const result = await useCase.execute(validInput);

    // Assert
    expect(mockAuthz.authorize).toHaveBeenCalledWith(expect.objectContaining({
      action: '{{entity}}.create',
      subject: expect.objectContaining({ id: validInput.user.userId }),
    }));
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockOutbox.enqueue).toHaveBeenCalledWith(
      '{{entity}}.created.v1',
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.id).toBeDefined();
  });

  it('should throw forbidden when authorization denied', async () => {
    // Arrange
    mockAuthz.authorize.mockResolvedValue({ allow: false, code: 'insufficient_permissions' });
    mockEx.throw.mockImplementation(() => { throw new Error('Forbidden'); });
    const validInput = createValidInput();

    // Act & Assert
    await expect(useCase.execute(validInput)).rejects.toThrow('Forbidden');
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should throw mapped domain error when validation fails', async () => {
    // Arrange
    mockAuthz.authorize.mockResolvedValue({ allow: true, policyRev: '1.0' });
    mockEx.throw.mockImplementation(() => { throw new Error('Validation failed'); });
    const invalidInput = { ...createValidInput(), data: { name: '' } };

    // Act & Assert
    await expect(useCase.execute(invalidInput)).rejects.toThrow('Validation failed');
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should handle policy unavailable (fail-closed)', async () => {
    // Arrange
    mockAuthz.authorize.mockRejectedValue(new Error('OPA unavailable'));
    mockEx.throw.mockImplementation(() => { throw new Error('Policy unavailable'); });

    // Act & Assert
    await expect(useCase.execute(createValidInput())).rejects.toThrow('Policy unavailable');
  });
});
```ain_**: domain methods return `Result<T,E>`; application layer maps errors to exceptions/Problem Details.
- **Fail‑closed authorization** via OPA, evaluated **in every UseCase** prior to mutation.
- **Multi‑tenant SaaS**: tenant carried in metadata; isolation enforced across layers.
- **Observability by default**: structured logs (Pino), W3C trace context (`traceId`) and business `correlationId` propagated end‑to‑end.

### Technology Stack

- **Runtime:** NestJS v11 + TypeScript
- **Event Store:** EventStoreDB (ESDB) for aggregates and write‑side replay
- **Queues:** BullMQ v5 (direct API) with shared **ioredis** connections
- **Cache/Projections:** Redis
- **AuthN:** Keycloak (OIDC/JWT)
- **AuthZ:** Open Policy Agent (OPA, Rego policies) – _separate_ policies for access control vs decisioning (business rules)
- **Logging:** Pino (JSON), aligned to W3C Trace Context + RFC 9457 Problem Details for error payloads

---

## 2) Naming & Conventions (authoritative)

### Streams (ESDB)

- **Per‑aggregate stream:** `{{context}}.{{entity}}-{{id}}`

  - Examples: `banking.payment-6d0b…`, `product.currency-USD`
  - **Tenant is not in stream name**; carry `tenantId` in metadata.

### Event Types

- **Dotted names with version:** `{{entity}}.{{action}}.v{{n}}` (e.g., `payment.created.v1`)
- Do **not** rely on class names for ESDB `type`; **always** set explicit `type`.

### Redis Keys

- `{tenant}:{service}:{context}:{entity}:{id}:{field}`

  - Example: `core:lookup:product:currency:USD:snapshot`

### BullMQ Queues

- `{context}-{purpose}` (e.g., `payment-integration`, `notification-worker`)

---

## 3) Ports (interfaces) – cross‑cutting

```ts
export abstract class {{Entity}}RepositoryPort {
  abstract save(aggregate: {{Entity}}, meta: EventMetadata): Promise<void>;
  abstract getById(id: {{Entity}}Id, tenantId: string): Promise<{{Entity}} | null>;
  abstract getByIdOrThrow(id: {{Entity}}Id, tenantId: string): Promise<{{Entity}}>;
}

export interface OutboxPort {
  enqueue(eventType: string, payload: any, meta: EventMetadata, opts?: OutboxOptions): Promise<void>;
}

export interface AuthorizationPolicyPort {
  authorize(input: AuthzInput): Promise<{ allow: boolean; code?: string; policyRev?: string }>;
}

export interface DecisioningPolicyPort {
  evaluate<TIn, TOut>(path: string, input: TIn): Promise<TOut>;
}

export interface ClockPort { now(): Date }
````

```ts
export interface EventMetadata {
  correlationId: string;
  traceId: string; // W3C trace context
  tenantId: string;
  user: IUserToken; // full user context
  idempotencyKey?: string;
  source: string; // originating service/module
  occurredAt: Date; // when the domain change happened
}

export interface StandardMeta {
  correlationId: string;
  traceId: string; // W3C trace context
  tenantId: string;
  idempotencyKey?: string;
  source: string;
  timestamp: Date;
}

export interface DomainEvent {
  type: string; // dotted notation: entity.action.version
  data: any;
  metadata?: any;
}

export interface IUserToken {
  userId: string;
  roles: string[];
  tenantId: string;
  email?: string;
}
```

---

## 4) Domain Layer (never throw) – Result pattern

```ts
// Domain Error Types
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: any) {
    super('validation_failed', message, details);
  }
}

// Result Pattern
export type Result<T, E extends Error> = Ok<T> | Err<E>;
export class Ok<T> { constructor(public readonly value: T) {} isOk() { return true } isErr() { return false } }
export class Err<E> { constructor(public readonly error: E) {} isOk() { return false } isErr() { return true } }

export class {{Entity}} extends AggregateRoot {
  private constructor(
    public readonly id: {{Entity}}Id,
    private _status: {{Entity}}Status,
    private _createdAt: Date,
    private _version: number = 0,
  ) {
    super();
  }

  static create(data: Create{{Entity}}Data, user: IUserToken): Result<{{Entity}}, DomainError> {
    // Domain validation (never throw)
    if (!data.name?.trim()) {
      return Err(new DomainError('name_required', 'Name is required'));
    }

    const id = {{Entity}}Id.generate();
    const entity = new {{Entity}}(id, {{Entity}}Status.Active, new Date());

    entity.apply(new {{Entity}}CreatedEvent({
      id: id.value,
      ...data,
      createdBy: user.userId,
      createdAt: entity._createdAt,
    }));

    return Ok(entity);
  }

  updateStatus(newStatus: {{Entity}}Status, user: IUserToken): Result<void, DomainError> {
    if (this._status === newStatus) {
      return Err(new DomainError('status_unchanged', 'Status unchanged'));
    }

    this.apply(new {{Entity}}StatusUpdatedEvent({
      id: this.id.value,
      oldStatus: this._status,
      newStatus,
      updatedBy: user.userId,
      updatedAt: new Date(),
    }));

    return Ok(undefined);
  }

  // Event handlers (private methods that mutate state)
  private on{{Entity}}Created(event: {{Entity}}CreatedEvent): void {
    // Update internal state based on event data
    this._status = {{Entity}}Status.Active;
    this._createdAt = event.createdAt;
  }

  private on{{Entity}}StatusUpdated(event: {{Entity}}StatusUpdatedEvent): void {
    this._status = event.newStatus;
  }

  // Static factory for rehydration from event history
  static fromHistory(events: DomainEvent[]): {{Entity}} {
    if (!events.length) throw new Error('Cannot rehydrate from empty event history');

    const firstEvent = events[0];
    const entity = new {{Entity}}(/* reconstruct from first event */);

    events.forEach(event => {
      entity.applyFromHistory(event);
      entity._version++;
    });

    return entity;
  }
}
```

> **Rule:** Domain returns `Result`; **application** decides whether to throw mapped exceptions or bubble a `Result` outward. Keep it consistent.

---

## 5) Application Layer (UseCases)

### UseCase Template (authoritative)

```ts
export interface Create{{Entity}}Input {
  user: IUserToken;
  data: Create{{Entity}}Dto;
  meta: StandardMeta;
}

export type {{Entity}}Result = { id: string; version: number };

@Injectable()
export class Create{{Entity}}UseCase {
  constructor(
    private readonly repo: {{Entity}}RepositoryPort,
    private readonly outbox: OutboxPort,
    private readonly authz: AuthorizationPolicyPort,
    private readonly decisioning: DecisioningPolicyPort, // Optional
    private readonly clock: ClockPort,
    @Inject('ILogger') private readonly logger: ILogger,
    @Inject('ExceptionFactory') private readonly ex: ExceptionFactory,
  ) {}

  async execute({ user, data, meta }: Create{{Entity}}Input): Promise<{{Entity}}Result> {
    // 1) Authorization (fail-closed)
    const decision = await this.authz.authorize({
      action: '{{entity}}.create',
      subject: { id: user.userId, roles: user.roles, tenantId: meta.tenantId },
      resource: { type: '{{entity}}', attrs: { ...data, tenantId: meta.tenantId } },
      context: {
        correlationId: meta.correlationId,
        tenantId: meta.tenantId,
        occurredAt: meta.timestamp.toISOString(),
        source: meta.source,
        traceId: meta.traceId
      },
    });
    if (!decision.allow) throw this.ex.throw(decision.code ?? 'forbidden');

    // 2) Optional business rules (decisioning)
    // const { feeMinor } = await this.decisioning.evaluate('decisioning.fees', {
    //   amountMinor: data.amountMinor,
    //   channel: data.channel,
    //   tenantId: meta.tenantId
    // });

    // 3) Domain logic (Result pattern - never throw)
    const result = {{Entity}}.create(data, user);
    if (result.isErr()) throw this.ex.throw(result.error.code);
    const agg = result.value;

    // 4) Persist to ESDB with metadata
    await this.repo.save(agg, {
      correlationId: meta.correlationId,
      traceId: meta.traceId,
      tenantId: meta.tenantId,
      user,
      idempotencyKey: meta.idempotencyKey,
      source: meta.source,
      occurredAt: this.clock.now(),
    });

    // 5) Outbox for integrations (idempotent)
    await this.outbox.enqueue('{{entity}}.created.v1', { id: agg.id.value }, {
      correlationId: meta.correlationId,
      traceId: meta.traceId,
      tenantId: meta.tenantId,
      user,
      source: meta.source,
      occurredAt: this.clock.now(),
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });

    this.logger.info('{{entity}}.created', {
      traceId: meta.traceId,
      correlationId: meta.correlationId,
      tenantId: meta.tenantId,
      {{entity}}Id: agg.id.value,
      userId: user.userId,
    });

    return { id: agg.id.value, version: agg.version };
  }
}
```

### Command Handlers (thin delegation)

```ts
@CommandHandler(Create{{Entity}}Command)
export class Create{{Entity}}Handler implements ICommandHandler<Create{{Entity}}Command, {{Entity}}Result> {
  constructor(
    private readonly useCase: Create{{Entity}}UseCase,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {}

  async execute(cmd: Create{{Entity}}Command): Promise<{{Entity}}Result> {
    this.logger.info('cmd.received', {
      type: 'Create{{Entity}}Command',
      correlationId: cmd.correlationId,
      tenantId: cmd.tenantId,
      traceId: cmd.traceId,
      source: '{{Context}}Module'
    });

    return this.useCase.execute({
      user: cmd.user,
      data: cmd.payload,
      meta: {
        correlationId: cmd.correlationId,
        traceId: cmd.traceId || randomUUID(),
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

## 6) ESDB Adapter (authoritative)

### Append with explicit event type & correct expected revision

```ts
import { EventStoreDBClient, jsonEvent, NO_STREAM } from '@eventstore/db-client';

@Injectable()
export class Esdb{{Entity}}Repository extends {{Entity}}RepositoryPort {
  constructor(
    @Inject('EventStoreClient') private readonly client: EventStoreDBClient,
    @Inject('ILogger') private readonly logger: ILogger
  ) {
    super();
  }

  async save(aggregate: {{Entity}}, meta: EventMetadata): Promise<void> {
    const stream = `{{context}}.{{entity}}-${aggregate.id.value}`;

    const events = aggregate.getUncommittedEvents().map(e =>
      jsonEvent({
        type: e.type,                 // e.g., 'payment.created.v1'
        data: e.data,
        metadata: {
          ...meta,
          eventType: e.type,
          eventId: randomUUID(),
          streamName: stream,
        },
      })
    );

    await this.client.appendToStream(stream, events, {
      expectedRevision: aggregate.version === 0 ? NO_STREAM : BigInt(aggregate.version - 1),
    });

    aggregate.markEventsAsCommitted();
  }

  async getById(id: {{Entity}}Id, tenantId: string): Promise<{{Entity}} | null> {
    const stream = `{{context}}.{{entity}}-${id.value}`;
    try {
      const history: DomainEvent[] = [];
      for await (const { event } of this.client.readStream(stream)) {
        if (!event) continue;
        history.push({
          type: event.type,
          data: event.data,
          metadata: event.metadata
        });
      }
      if (!history.length) return null;
      return {{Entity}}.fromHistory(history); // upcasters can use event.metadata.version/type
    } catch (err: any) {
      if (err instanceof StreamNotFoundError) return null;
      throw err;
    }
  }

  async getByIdOrThrow(id: {{Entity}}Id, tenantId: string): Promise<{{Entity}}> {
    const entity = await this.getById(id, tenantId);
    if (!entity) {
      throw new Error(`{{Entity}} with id ${id.value} not found for tenant ${tenantId}`);
    }
    return entity;
  }
}
```

> **Rule:** Rehydration must pass both `type` and `metadata` to enable upcasting and tenant checks.

---

## 7) Outbox + BullMQ v5 (direct API)

### DI: shared ioredis connection

```ts
import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents, JobsOptions } from 'bullmq';

export const REDIS_CONNECTION = {
  provide: 'IORedis',
  useFactory: () => {
    return new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    });
  },
};

export const BULL_CONNECTION = {
  provide: 'BullConnection',
  useFactory: (redis: Redis) => ({ connection: redis }),
  inject: ['IORedis'],
};
```

### Outbox Adapter (idempotent, hygiene)

```ts
@Injectable()
export class BullmqOutboxAdapter implements OutboxPort {
  private queue: Queue;
  constructor(
    @Inject('BullConnection') private readonly conn: { connection: any },
    @Inject('ILogger') private readonly logger: ILogger,
  ) {
    this.queue = new Queue('integration-events', this.conn);
  }

  async enqueue(
    eventType: string,
    payload: any,
    meta: EventMetadata,
    opts: Partial<JobsOptions> = {},
  ): Promise<void> {
    const jobId =
      meta.idempotencyKey ??
      `${eventType}:${payload?.id ?? ''}:${meta.correlationId}`;
    await this.queue.add(
      eventType,
      {
        eventType,
        payload,
        metadata: { ...meta, enqueuedAt: new Date().toISOString() },
      },
      {
        jobId,
        removeOnComplete: { age: 86400, count: 1000 }, // hygiene
        removeOnFail: { age: 172800, count: 1000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        ...opts,
      },
    );

    this.logger.info('outbox.enqueued', {
      eventType,
      jobId,
      correlationId: meta.correlationId,
      tenantId: meta.tenantId,
      traceId: meta.traceId,
    });
  }
}
```

### Worker Provider (no Nest decorators)

```ts
@Injectable()
export class {{Entity}}EventWorker implements OnModuleDestroy {
  private worker: Worker;
  private events: QueueEvents;

  constructor(
    private readonly commandBus: CommandBus,
    @Inject('BullConnection') private readonly conn: { connection: Redis },
    @Inject('ILogger') private readonly logger: ILogger,
  ) {
    this.events = new QueueEvents('integration-events', this.conn);
    this.events.on('failed', (e) => this.logger.error('job.failed', e));
    this.events.on('completed', (e) => this.logger.info('job.completed', e));

    this.worker = new Worker(
      'integration-events',
      this.processJob.bind(this),
      {
        ...this.conn,
        concurrency: Number(process.env.WORKER_CONCURRENCY ?? 10),
      },
    );
  }

  private async processJob(job: Job<{{Entity}}CreatedEventData>): Promise<void> {
    if (job.name !== '{{entity}}.created.v1') return;

    const { eventType, payload, metadata } = job.data;

    this.logger.info('job.started', {
      jobId: job.id,
      eventType: job.name,
      traceId: metadata.traceId,
      correlationId: metadata.correlationId,
      tenantId: metadata.tenantId,
    });

    try {
      // Re-authorize for async processing
      await this.commandBus.execute(new ProcessIntegrationCommand(
        metadata.user,
        payload,
        metadata.correlationId,
        metadata.tenantId,
        `${job.id}`,
        metadata.traceId,
      ));

      this.logger.info('job.completed', {
        jobId: job.id,
        traceId: metadata.traceId,
        correlationId: metadata.correlationId,
      });
    } catch (error) {
      this.logger.error('job.failed', {
        jobId: job.id,
        traceId: metadata.traceId,
        correlationId: metadata.correlationId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.events.close();
  }
}
```

---

## 8) Authorization (OPA) & Exception Handling

### Authorization Patterns

- **Access control (authz):** allow/deny for actions like `payment.create`.
- **Decisioning:** domain rule evaluations (e.g., fees) with separate OPA packages.

```ts
// Complete OPA authorization call
const decision = await this.authz.authorize({
  action: '{entity}.{operation}',
  subject: { id: user.userId, roles: user.roles, tenantId: meta.tenantId },
  resource: { type: '{entity}', attrs: { ...data, tenantId: meta.tenantId } },
  context: {
    correlationId: meta.correlationId,
    traceId: meta.traceId,
    tenantId: meta.tenantId,
    occurredAt: meta.timestamp.toISOString(),
    source: meta.source,
  },
});
if (!decision.allow) throw this.ex.throw(decision.code ?? 'forbidden');

// Decisioning for business rules
const result = await this.decisioning.evaluate('decisioning.fees', {
  amountMinor: data.amountMinor,
  channel: data.channel,
  currency: data.currency,
  tenantId: meta.tenantId,
});
```

### Exception Factory & Problem Details

```ts
export interface IException {
  statusCode: number;
  code: string;
  message: string;
  description: string;
  exception: new (...args: any[]) => any;
}

export class DomainExceptionFactory {
  constructor(private readonly map: Record<string, IException>) {}

  throw(key: string, extra?: any): never {
    const e = this.map[key] ?? this.map['internal_error'];

    const exception = new e.exception({
      code: e.code,
      message: e.message,
      description: e.description,
      extra,
    });

    // Add structured metadata for Problem Details (RFC 9457)
    exception.statusCode = e.statusCode;
    exception.problemType = `https://api.example.com/problems/${e.code}`;

    throw exception;
  }
}

// Example exception map
const EXCEPTION_MAP: Record<string, IException> = {
  forbidden: {
    statusCode: 403,
    code: 'forbidden',
    message: 'Access denied',
    description: 'Insufficient permissions for this operation',
    exception: ForbiddenException,
  },
  name_required: {
    statusCode: 400,
    code: 'validation_failed',
    message: 'Validation failed',
    description: 'Name is required',
    exception: BadRequestException,
  },
  not_found: {
    statusCode: 404,
    code: 'resource_not_found',
    message: 'Resource not found',
    description: 'The requested resource could not be found',
    exception: NotFoundException,
  },
};
```

````

> Keep timeouts conservative (e.g., < 300ms) and treat failures as **deny** for authz.

---

## 9) Logging & Observability Standards

### Structured Logging with W3C Trace Context

- Always include: `traceId`, `correlationId`, `tenantId`, `userId` (when present), `entityId`, `duration` where relevant.
- Use **event‑style** log names: `cmd.received`, `usecase.completed`, `job.failed`.

```ts
// Operation completion logging
this.logger.info('operation.completed', {
  traceId: ctx.traceId,
  correlationId: meta.correlationId,
  tenantId: meta.tenantId,
  userId: meta.user.userId,
  entityId: entity.id.value,
  duration: Date.now() - startTime,
  operation: 'create{{Entity}}',
});

// Error enrichment with full context
this.logger.error('operation.failed', {
  traceId: ctx.traceId,
  correlationId: meta.correlationId,
  tenantId: meta.tenantId,
  error: error.message,
  stack: error.stack,
  context: 'Create{{Entity}}UseCase',
  operation: 'create{{Entity}}',
});

// Performance metrics
this.logger.info('performance.metric', {
  traceId: ctx.traceId,
  correlationId: meta.correlationId,
  operation: 'authz.check',
  duration: authzDuration,
  result: decision.allow ? 'allow' : 'deny',
});
````

### Log Sampling & Sensitive Data

```ts
// High-volume operation sampling
if (Math.random() < parseFloat(process.env.LOG_SAMPLE_RATE ?? '0.1')) {
  this.logger.debug('high.volume.operation', {
    /* details */
  });
}

// Sensitive data redaction
const sanitizedData = {
  ...data,
  creditCardNumber: data.creditCardNumber ? '[REDACTED]' : undefined,
  ssn: data.ssn ? '[REDACTED]' : undefined,
};
```

---

## 10) Testing

- **Domain:** assert `Result` (`isOk/isErr`) – no throws.
- **UseCases:** may assert thrown mapped exceptions (forbidden, conflict, etc.) or return `Result` if that’s the chosen style.

```ts
it('domain: returns Err when invalid', () => {
  const r = {{Entity}}.create({ name: '' }, user);
  expect(r.isErr()).toBe(true);
});

it('usecase: throws forbidden when denied', async () => {
  mockAuthz.authorize.mockResolvedValue({ allow: false, code: 'insufficient_permissions' });
  await expect(uc.execute(validInput)).rejects.toThrow();
});
```

---

## 11) Module Wiring (example)

```ts
@Module({
  imports: [CqrsModule],
  providers: [
    // Infrastructure connections
    REDIS_CONNECTION,
    BULL_CONNECTION,

    // Ports → Adapters
    { provide: {{Entity}}RepositoryPort, useClass: Esdb{{Entity}}Repository },
    { provide: OutboxPort, useClass: BullmqOutboxAdapter },
    {
      provide: AuthorizationPolicyPort,
      useFactory: () => new OpaAuthorizationPolicyAdapter(
        new OpaClient(process.env.OPA_URL ?? 'http://localhost:8181'),
        'authz.allow'
      )
    },
    {
      provide: DecisioningPolicyPort,
      useFactory: () => new OpaDecisioningPolicyAdapter(
        new OpaClient(process.env.OPA_URL ?? 'http://localhost:8181'),
        'decisioning.fees'
      )
    },
    { provide: ClockPort, useClass: SystemClock },

    // UseCases
    Create{{Entity}}UseCase,
    Update{{Entity}}UseCase,
    Delete{{Entity}}UseCase,

    // Handlers
    Create{{Entity}}Handler,
    Update{{Entity}}Handler,
    Delete{{Entity}}Handler,

    // Workers (direct BullMQ v5, no Nest decorators)
    {{Entity}}EventWorker,

    // Cross‑cutting
    {
      provide: 'ExceptionFactory',
      useFactory: () => new DomainExceptionFactory(EXCEPTION_MAP)
    },
    { provide: 'ILogger', useClass: PinoLoggerAdapter },
    { provide: 'EventStoreClient', useClass: EventStoreDBClientAdapter },
  ],
  controllers: [{{Entity}}Controller],
  exports: [
    Create{{Entity}}UseCase,
    Update{{Entity}}UseCase,
    Delete{{Entity}}UseCase,
  ],
})
export class {{Context}}Module {}
```

---

## 12) Performance & Ops

- **ESDB:** append with correct `expectedRevision`; design events small; use metadata filters for tenant in projections; avoid per‑tenant categories.
- **Redis:** TTL for ephemeral projections; snapshot larger aggregates for fast reads.
- **BullMQ:** set `concurrency`, backoff, retries; use idempotent `jobId`; enable QueueEvents for metrics.
- **OPA:** cache allow/deny for a short TTL when safe; guard with circuit breakers; default‑deny on errors for authz.
- **Logging:** include sampling for high‑volume logs; keep trace propagation consistent across HTTP, workers, and ESDB consumers.

---

## 13) Environment Variables (reference)

```bash
# ESDB
EVENTSTORE_CONNECTION_STRING=esdb://localhost:2113?tls=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# OPA
OPA_URL=http://localhost:8181

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=core
KEYCLOAK_CLIENT_ID=api

# Observability
LOG_LEVEL=info
TRACE_SAMPLE_RATE=0.1
WORKER_CONCURRENCY=10
```

---

## 14) Copilot Checklists

### New Feature Scaffold

1. **Domain Aggregate** with `Result<T,E>` methods and events (`{{entity}}.{{action}}.v1`).
2. **Repository Port & ESDB Adapter** with proper stream naming and rehydration.
3. **UseCase** with OPA authorization → domain logic → `repo.save()` → outbox enqueue.
4. **Command/Handler** with thin delegation and W3C trace context.
5. **BullMQ Worker** (direct v5 API) for async processing with re-authorization.
6. **Module wiring** with all ports/adapters and proper DI.
7. **OPA policies** for authorization (`authz.*`) and decisioning (`decisioning.*`).
8. **Tests** for domain Result patterns and UseCase authorization flows.
9. **Exception mapping** in factory with Problem Details support.
10. **Logging** with `traceId`, `correlationId`, and structured event names.

### Code Quality Checklist

- ✅ **Domain methods return `Result<T,E>`** (never throw)
- ✅ **Application layer maps errors** via ExceptionFactory
- ✅ **Authorization required** in every UseCase
- ✅ **W3C trace context propagation** (`traceId` + `correlationId`)
- ✅ **Tenant isolation** via metadata (not stream names)
- ✅ **Stable idempotency keys** for outbox retry safety
- ✅ **Event type consistency** (dotted notation: `entity.action.version`)
- ✅ **Proper ESDB revision handling** (`NO_STREAM` vs `BigInt`)
- ✅ **Direct BullMQ v5 integration** (no Nest decorators)
- ✅ **Structured logging** with performance metrics

### Don’ts

- ❌ Don’t throw from the domain layer.
- ❌ Don’t leak infra types into domain/application.
- ❌ Don’t use class names as ESDB event `type`.
- ❌ Don’t mix `@nestjs/bullmq` decorators with BullMQ v5 direct providers.

### Don'ts (Anti-Patterns)

- ❌ **Don't throw from the domain layer** (use `Result<T,E>` instead)
- ❌ **Don't leak infrastructure types** into domain/application layers
- ❌ **Don't use class names as ESDB event `type`** (use explicit dotted notation)
- ❌ **Don't mix `@nestjs/bullmq` decorators** with BullMQ v5 direct providers
- ❌ **Don't skip authorization** in UseCases (even for internal operations)
- ❌ **Don't put tenant in stream names** (use metadata for isolation)
- ❌ **Don't forget trace context** (`traceId` + `correlationId` in all logs)
- ❌ **Don't call external APIs directly** from UseCases (use Outbox pattern)
- ❌ **Don't use raw `Error` types** (always go through ExceptionFactory)
- ❌ **Don't ignore idempotency** in outbox operations

### Common Imports Reference

```ts
// Domain
import { AggregateRoot, Result, Ok, Err, DomainError } from '@shared/domain';

// Application
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';

// Infrastructure
import {
  EventStoreDBClient,
  NO_STREAM,
  StreamNotFoundError,
  jsonEvent,
} from '@eventstore/db-client';
import { Queue, Worker, Job, QueueEvents } from 'bullmq'; // Direct v5, not @nestjs/bullmq
import { Redis } from 'ioredis';

// Observability
import { ILogger } from '@shared/observability';
import { randomUUID } from 'crypto';

// Authorization
import {
  AuthorizationPolicyPort,
  DecisioningPolicyPort,
} from '@shared/authorization';
```

---

**This is the canonical source for how Copilot should shape code in this repository.**
