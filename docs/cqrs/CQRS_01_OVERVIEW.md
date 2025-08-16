# COPILOT_INSTRUCTIONS.md — DDD + CQRS Strategy for a Modular Monolith (with Service Extraction)

> **Purpose:** Give GitHub Copilot enough context to generate production‑grade code that follows our DDD + CQRS conventions in a modular monolith that can later be extracted into services without rewrites.

---

## 0) Executive Principl## 13) Don'ts```

---

## 12) Security Framework Integration

### **🔐 Security Architecture Overview**

The CQRS architecture integrates comprehensive security at every layer with three core pillars:

1. **Authentication & Authorization** - Keycloak JWT + OPA policy decisions
2. **PII Protection Framework** - Automatic detection and protection of sensitive data
3. **Security Monitoring** - Real-time monitoring and alerting for security events

### **Security Layer Integration**

```
Interface Layer (Controllers)    → JWT Guards + PII Scanning + Audit Logging
    ↓
Application Layer (Use Cases)    → OPA Authorization + Context Enrichment
    ↓
Domain Layer (Aggregates)        → Security-aware Events + Metadata
    ↓
Infrastructure Layer (Repos)     → Encrypted Storage + PII Protection
```

### **🛡️ Authentication & Authorization Patterns**

**JWT Authentication at Interface Layer**

```typescript
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly securityMonitoring: SecurityMonitoringService,
    private readonly piiFramework: PIIFrameworkService,
  ) {}

  @Post()
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // 1. PII Protection - Scan and protect incoming data
    const piiResult = await this.piiFramework.scanAndProtect(dto, {
      protectionLevel: PIIClassificationLevel.HIGH,
      defaultAction: PIIProtectionAction.MASK,
      auditEnabled: true,
    });

    if (piiResult.riskLevel === 'HIGH') {
      await this.securityMonitoring.recordSecurityEvent('pii_detected', {
        resource: 'payment_creation',
        riskLevel: piiResult.riskLevel,
        detectedFields: piiResult.detectedPII.map((p) => p.field),
      });
    }

    // 2. Execute use case with protected data
    const result = await this.createPaymentUseCase.execute({
      ...piiResult.protectedData,
      userId: req.user.id,
      correlationId: req.correlationId,
    });

    if (result.isErr()) {
      // Log authorization failures for monitoring
      if (result.error.category === 'authorization') {
        await this.securityMonitoring.recordAuthorizationEvent(
          'access_denied',
          {
            resource: 'payment_creation',
            reason: result.error.code,
            userId: req.user.id,
          },
        );
      }
      return this.handleError(result.error);
    }

    return result.value;
  }
}
```

**OPA Authorization at Application Layer**

```typescript
export class CreatePaymentUseCase {
  constructor(
    private readonly paymentRepo: PaymentRepository,
    private readonly opa: OpaAuthorizationPort,
    private readonly securityMonitoring: SecurityMonitoringService,
    private readonly decisionLogger: DecisionLoggerService,
  ) {}

  async execute(
    command: CreatePaymentCommand,
  ): Promise<Result<Payment, DomainError>> {
    // 1. OPA Authorization with audit logging
    const authResult = await this.opa.evaluatePolicy({
      subject: {
        id: command.userId,
        roles: command.userRoles,
        tenant: command.tenantId,
      },
      resource: { type: 'payment', action: 'create', amount: command.amount },
      context: { correlationId: command.correlationId, timestamp: new Date() },
    });

    // 2. Log authorization decision
    await this.decisionLogger.logDecision({
      correlationId: command.correlationId,
      userId: command.userId,
      resource: 'payment:create',
      decision: authResult.allowed ? 'ALLOW' : 'DENY',
      reason: authResult.reason,
      context: { amount: command.amount, currency: command.currency },
    });

    if (!authResult.allowed) {
      // Record failed authorization for security monitoring
      await this.securityMonitoring.recordAuthorizationEvent(
        'policy_violation',
        {
          resource: 'payment:create',
          reason: authResult.reason,
          userId: command.userId,
          riskScore: authResult.riskScore || 0,
        },
      );

      return err({
        ...PaymentErrors.AUTHORIZATION_DENIED,
        context: {
          userId: command.userId,
          reason: authResult.reason,
          correlationId: command.correlationId,
        },
      });
    }

    // 3. Continue with business logic
    const paymentResult = Payment.create({
      id: new PaymentId(command.paymentId),
      amount: Money.from(command.amount, command.currency),
      userId: command.userId,
    });

    if (paymentResult.isErr()) {
      return paymentResult;
    }

    // 4. Save with security metadata
    const [payment, events] = paymentResult.unwrapWithEvents();
    const enrichedEvents = events.map((event) => ({
      ...event,
      metadata: {
        ...event.metadata,
        userId: command.userId,
        tenantId: command.tenantId,
        correlationId: command.correlationId,
        securityContext: {
          authorized: true,
          authorizationReason: authResult.reason,
          dataProtectionApplied: command.piiProtected || false,
        },
      },
    }));

    return this.paymentRepo.save(payment, enrichedEvents);
  }
}
```

### **🔍 PII Protection Integration**

**Domain Events with PII Protection**

```typescript
// Domain event with PII-aware metadata
export class PaymentCreatedEvent extends DomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly customerData: any, // May contain PII
    metadata?: EventMetadata,
  ) {
    super('payment.created.v1', metadata);
  }

  // Override to apply PII protection before serialization
  async serialize(piiFramework: PIIFrameworkService): Promise<string> {
    const protectionResult = await piiFramework.scanAndProtect(
      this.customerData,
      {
        protectionLevel: PIIClassificationLevel.HIGH,
        defaultAction: PIIProtectionAction.ENCRYPT,
        auditEnabled: true,
      },
    );

    return JSON.stringify({
      ...this,
      customerData: protectionResult.protectedData,
      piiMetadata: {
        detectedFields: protectionResult.detectedPII.map((p) => p.field),
        protectionApplied: protectionResult.protectionActions,
        riskLevel: protectionResult.riskLevel,
      },
    });
  }
}
```

**Repository with Data Protection**

```typescript
export class EsdbPaymentRepository implements PaymentRepository {
  constructor(
    private readonly eventStore: EventStore,
    private readonly piiFramework: PIIFrameworkService,
    private readonly securityMonitoring: SecurityMonitoringService,
  ) {}

  async save(
    payment: Payment,
    events: DomainEvent[],
  ): Promise<Result<void, DomainError>> {
    try {
      // 1. Apply PII protection to events before storage
      const protectedEvents = await Promise.all(
        events.map(async (event) => {
          if (this.containsSensitiveData(event)) {
            const protectionResult = await this.piiFramework.scanAndProtect(
              event,
              {
                protectionLevel: PIIClassificationLevel.HIGH,
                defaultAction: PIIProtectionAction.ENCRYPT,
                auditEnabled: true,
              },
            );

            // Log data protection activity
            await this.securityMonitoring.recordDataProtectionEvent(
              'pii_encrypted',
              {
                eventType: event.type,
                fieldsProtected: protectionResult.detectedPII.length,
                protectionActions: protectionResult.protectionActions,
              },
            );

            return { ...event, data: protectionResult.protectedData };
          }
          return event;
        }),
      );

      // 2. Store events with security metadata
      await this.eventStore.appendToStream(
        payment.id.value,
        protectedEvents.map((event) => ({
          ...event,
          metadata: {
            ...event.metadata,
            securityVersion: '1.0',
            piiProtected: true,
            encryptionKeyId: process.env.PII_ENCRYPTION_KEY_ID,
          },
        })),
      );

      return ok(void 0);
    } catch (e) {
      // Log storage security incidents
      await this.securityMonitoring.recordSecurityEvent('storage_failure', {
        error: e.message,
        paymentId: payment.id.value,
        eventCount: events.length,
      });

      return err(
        fromError(PaymentInfraErrors.SECURE_STORAGE_ERROR, e, {
          paymentId: payment.id.value,
        }),
      );
    }
  }

  private containsSensitiveData(event: DomainEvent): boolean {
    // Logic to determine if event contains PII
    const sensitiveEventTypes = [
      'payment.created.v1',
      'customer.updated.v1',
      'profile.created.v1',
    ];
    return sensitiveEventTypes.includes(event.type);
  }
}
```

### **📊 Security Monitoring Integration**

**Projection with Security Monitoring**

```typescript
export class PaymentProjectionHandler {
  constructor(
    private readonly readModelRepo: PaymentReadModelRepository,
    private readonly securityMonitoring: SecurityMonitoringService,
    private readonly piiFramework: PIIFrameworkService,
  ) {}

  async handle(resolvedEvent: ResolvedEvent): Promise<void> {
    try {
      // 1. Check for PII in projection data
      const event = resolvedEvent.event;
      const piiScanResult = await this.piiFramework.scanData(event.data, {
        scanDepth: 2,
        confidenceThreshold: 0.8,
      });

      if (piiScanResult.detectedPII.length > 0) {
        // Log PII detection in projection
        await this.securityMonitoring.recordDataProtectionEvent(
          'pii_in_projection',
          {
            stream: event.streamId,
            eventId: event.id,
            detectedFields: piiScanResult.detectedPII.map((p) => p.field),
            riskLevel: piiScanResult.riskLevel,
          },
        );

        // Apply protection before storing in read model
        const protectionResult = await this.piiFramework.protectData(
          event.data,
          {
            action: PIIProtectionAction.HASH,
            auditEnabled: true,
          },
        );
        event.data = protectionResult.protectedData;
      }

      // 2. Update read model with security context
      await this.readModelRepo.upsert({
        id: event.streamId,
        ...event.data,
        securityMetadata: {
          lastProcessed: new Date(),
          piiProtected: piiScanResult.detectedPII.length > 0,
          securityVersion: event.metadata?.securityVersion || '1.0',
        },
      });

      // 3. Record successful processing
      await this.securityMonitoring.recordDataProcessingEvent(
        'projection_updated',
        {
          stream: event.streamId,
          eventId: event.id,
          piiFieldsProcessed: piiScanResult.detectedPII.length,
        },
      );
    } catch (error) {
      // Log projection security failures
      await this.securityMonitoring.recordSecurityEvent('projection_failure', {
        stream: resolvedEvent.event?.streamId,
        eventId: resolvedEvent.event?.id,
        error: error.message,
        severity: 'HIGH',
      });
      throw error;
    }
  }
}
```

### **🚨 Security Alerting & Monitoring**

**Alert Configuration**

```typescript
// Configure security alert thresholds
export const SECURITY_ALERT_CONFIG = {
  authorizationFailures: {
    threshold: 10, // 10 failures per minute
    window: 60000, // 1 minute window
    cooldown: 300000, // 5 minute cooldown
    severity: 'HIGH',
  },
  piiDetections: {
    threshold: 5, // 5 PII detections per minute
    window: 60000, // 1 minute window
    cooldown: 600000, // 10 minute cooldown
    severity: 'MEDIUM',
  },
  authenticationFailures: {
    threshold: 20, // 20 failures per 5 minutes
    window: 300000, // 5 minute window
    cooldown: 900000, // 15 minute cooldown
    severity: 'CRITICAL',
  },
};
```

**Security Dashboard Queries**

```logql
# Authorization failures by resource
{app="gs-scaffold"} | json | event_type="authorization_failure" | count by (resource)

# PII detection trends
rate({app="gs-scaffold"} | json | event_type="pii_detected" [5m]) by (risk_level)

# Security events by severity
{app="gs-scaffold"} | json | security_event != "" | count by (severity)

# Failed authentication attempts
{app="gs-scaffold"} | json | event_type="auth_failure" | count by (reason)

# Data protection activities
{app="gs-scaffold"} | json | data_protection_event != "" | count by (protection_action)
```

### **🔐 Security Testing Patterns**

**Authorization Testing**

```typescript
describe('CreatePaymentUseCase Security', () => {
  it('should deny access for insufficient permissions', async () => {
    // Mock OPA to deny access
    mockOpa.evaluatePolicy.mockResolvedValue({
      allowed: false,
      reason: 'insufficient_role',
      riskScore: 7,
    });

    const result = await useCase.execute(validCommand);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('PAYMENT.AUTHORIZATION_DENIED');
    expect(
      mockSecurityMonitoring.recordAuthorizationEvent,
    ).toHaveBeenCalledWith(
      'policy_violation',
      expect.objectContaining({
        reason: 'insufficient_role',
        riskScore: 7,
      }),
    );
  });

  it('should log all authorization decisions', async () => {
    mockOpa.evaluatePolicy.mockResolvedValue({
      allowed: true,
      reason: 'role_match',
    });

    await useCase.execute(validCommand);

    expect(mockDecisionLogger.logDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'payment:create',
        decision: 'ALLOW',
        reason: 'role_match',
      }),
    );
  });
});
```

**PII Protection Testing**

```typescript
describe('PII Protection Integration', () => {
  it('should detect and protect PII in payment data', async () => {
    const paymentWithPII = {
      amount: 100,
      customerEmail: 'test@example.com',
      customerPhone: '+1-555-123-4567',
    };

    mockPIIFramework.scanAndProtect.mockResolvedValue({
      protectedData: {
        amount: 100,
        customerEmail: 'te***@ex******.com',
        customerPhone: '+1-555-***-****',
      },
      detectedPII: [
        { field: 'customerEmail', confidence: 0.95, type: 'email' },
        { field: 'customerPhone', confidence: 0.98, type: 'phone' },
      ],
      riskLevel: 'MEDIUM',
    });

    const result = await controller.createPayment(paymentWithPII, mockRequest);

    expect(mockPIIFramework.scanAndProtect).toHaveBeenCalledWith(
      paymentWithPII,
      expect.objectContaining({
        protectionLevel: PIIClassificationLevel.HIGH,
        auditEnabled: true,
      }),
    );
  });
});
```

---

## 12.5) Error Management Guard Rails

### **✅ Error Management Principles**

**Never Throw in Production Code**

- ✅ **ALWAYS** use `Result<T, E>` for operations that can fail
- ✅ **ALWAYS** handle errors explicitly with pattern matching
- ✅ **ALWAYS** map infrastructure exceptions to domain errors at boundaries
- ❌ **NEVER** use `throw` statements in domain, application, or infrastructure layers
- ❌ **NEVER** use `unsafeUnwrap()` in production code

**Type-Safe Error Context**

```typescript
// ✅ GOOD: Type-safe error context
interface PaymentContext extends Record<string, unknown> {
  paymentId: string;
  amount: number;
  userId: string;
  correlationId: string;
}

const PaymentErrors = makeCatalog(
  {
    INSUFFICIENT_FUNDS: {
      title: 'Insufficient funds',
      detail: 'Account balance is lower than requested amount',
      category: 'business',
      retryable: false,
    },
  },
  'PAYMENT',
) as Record<string, DomainError<string, PaymentContext>>;
```

**Domain Layer Error Catalog Example**

```typescript
// contexts/payments/domain/errors/payment.errors.ts
export const PaymentDomainErrors = makeCatalog(
  {
    INVALID_AMOUNT: {
      title: 'Invalid payment amount',
      detail: 'Payment amount must be positive',
      category: 'validation',
      retryable: false,
    },
    PAYMENT_ALREADY_PROCESSED: {
      title: 'Payment already processed',
      detail: 'This payment has already been completed',
      category: 'business',
      retryable: false,
    },
    INSUFFICIENT_BALANCE: {
      title: 'Insufficient balance',
      detail: 'Account balance is lower than requested amount',
      category: 'business',
      retryable: false,
    },
  },
  'PAYMENT',
);
```

**Application Layer Error Handling**

```typescript
// contexts/payments/application/use-cases/create-payment.use-case.ts
export class CreatePaymentUseCase {
  async execute(
    command: CreatePaymentCommand,
  ): Promise<Result<Payment, DomainError>> {
    // Validate command
    const validationResult = this.validateCommand(command);
    if (validationResult.isErr()) {
      return err({
        ...PaymentDomainErrors.INVALID_AMOUNT,
        context: { amount: command.amount, userId: command.userId },
      });
    }

    // Load aggregate with error handling
    const userResult = await this.userRepo.findById(command.userId);
    if (userResult.isErr()) {
      // Add context when propagating errors
      return err({
        ...userResult.error,
        context: {
          ...userResult.error.context,
          operation: 'create_payment',
          commandId: command.id,
        },
      });
    }

    // Business logic with Result composition
    return this.validateBalance(userResult.value, command.amount)
      .andThen((user) => this.createPayment(user, command))
      .andThen((payment) => this.savePayment(payment));
  }
}
```

**Infrastructure Layer Error Mapping**

```typescript
// contexts/payments/infrastructure/persistence/payment.repository.ts
export class EsdbPaymentRepository implements PaymentRepository {
  async load(id: PaymentId): Promise<Result<Payment | null, DomainError>> {
    try {
      const events = await this.eventStore.readStream(id.value);
      if (!events.length) return ok(null);

      const payment = Payment.fromEvents(events);
      return ok(payment);
    } catch (e) {
      // Map infrastructure errors to domain errors
      return err(
        fromError(PaymentInfraErrors.DATABASE_ERROR, e, {
          paymentId: id.value,
          operation: 'load_payment',
        }),
      );
    }
  }

  async save(
    payment: Payment,
    events: DomainEvent[],
  ): Promise<Result<void, DomainError>> {
    try {
      await this.eventStore.appendToStream(
        payment.id.value,
        events.map((e) => ({
          ...e,
          metadata: {
            correlationId: this.cls.get('correlationId'),
            causationId: this.cls.get('causationId'),
            userId: this.cls.get('userId'),
            tenantId: this.cls.get('tenantId'),
            occurredAt: new Date().toISOString(),
          },
        })),
      );
      return ok(void 0);
    } catch (e) {
      return err(
        fromError(PaymentInfraErrors.EVENT_STORE_ERROR, e, {
          paymentId: payment.id.value,
          eventsCount: events.length,
        }),
      );
    }
  }
}
```

**Controller Layer Problem Details Mapping**

```typescript
// apps/api/src/interfaces/http/payments.controller.ts
@Controller('payments')
export class PaymentsController {
  @Post()
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.createPaymentUseCase.execute({
      ...dto,
      userId: req.user.id,
      correlationId: req.correlationId,
    });

    if (result.isErr()) {
      // Log error with proper categorization
      this.logDomainError(result.error, 'Payment creation failed', {
        userId: req.user.id,
        operation: 'create_payment',
      });

      // Map to Problem Details
      const problemDetails = this.errorMapper.toProblemDetails(
        result.error,
        req.correlationId,
      );
      throw new HttpException(problemDetails, this.getHttpStatus(result.error));
    }

    return this.toPaymentResponse(result.value);
  }

  private getHttpStatus(error: DomainError): number {
    switch (error.category) {
      case 'validation':
        return 400;
      case 'business':
        return 422;
      case 'authorization':
        return 403;
      case 'authentication':
        return 401;
      case 'resource':
        return 404;
      case 'infrastructure':
        return 500;
      default:
        return 500;
    }
  }
}
```

**Error Logging Integration**

```typescript
// Structured error logging with proper categorization
private logDomainError(error: DomainError, message: string, context: any) {
  const logContext = {
    service: 'payment-service',
    component: 'PaymentsController',
    method: 'createPayment',
    error: {
      code: error.code,
      category: error.category,
      retryable: error.retryable,
      context: error.context
    },
    ...context
  };

  // Log level based on error category
  switch (error.category) {
    case 'validation':
    case 'business':
      Log.warn(this.logger, message, { ...logContext, expected: true });
      break;
    case 'authorization':
    case 'authentication':
      Log.warn(this.logger, message, { ...logContext, security: true });
      break;
    case 'infrastructure':
    case 'resource':
      Log.error(this.logger, new Error(error.detail), message, logContext);
      break;
  }
}
```

**Testing Error Paths**

```typescript
// Always test both success and error scenarios
describe('CreatePaymentUseCase', () => {
  it('should return validation error for negative amount', async () => {
    const command = new CreatePaymentCommand({ amount: -100 });

    const result = await useCase.execute(command);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('PAYMENT.INVALID_AMOUNT');
    expect(result.error.context?.amount).toBe(-100);
    expect(result.error.category).toBe('validation');
  });

  it('should preserve error context through layers', async () => {
    const dbError = PaymentInfraErrors.DATABASE_ERROR;
    mockRepo.findById.mockResolvedValue(err(dbError));

    const result = await useCase.execute(validCommand);

    expect(result.isErr()).toBe(true);
    expect(result.error.context?.operation).toBe('create_payment');
    expect(result.error.context?.commandId).toBe(validCommand.id);
  });
});
```

---

## 13) Don'ts (what Copilot must avoid)t Copilot must avoid)

- ❌ Calling TypeORM or external SDKs from domain/application
- ❌ Controllers mutating state directly
- ❌ Reading aggregates in queries (read from projections only)
- ❌ Throwing infrastructure errors through the API boundary
- ❌ Shared databases across contexts
- ❌ Events without metadata (correlationId/user/tenant)

### **❌ Error Management Don'ts**

- ❌ Using `throw` statements in domain, application, or infrastructure layers
- ❌ Using `unsafeUnwrap()` in production controllers or services
- ❌ Letting infrastructure exceptions bubble up without mapping to domain errors
- ❌ Using generic `Record<string, unknown>` for error context in production catalogs
- ❌ Logging sensitive data (passwords, tokens, PII) in error context
- ❌ Creating high-cardinality labels from error context in logs
- ❌ Logging the same error multiple times as it propagates through layers
- ❌ Using camelCase or kebab-case for error codes (must be UPPER_SNAKE_CASE)
- ❌ Missing error categories or retryable flags in domain errors
- ❌ Exposing internal error details to API clients

### **❌ Security Don'ts**

- ❌ Bypassing OPA authorization checks in use cases
- ❌ Storing PII in plain text without protection in events or read models
- ❌ Missing JWT guards on protected controller endpoints
- ❌ Logging sensitive data (passwords, tokens, SSNs, credit cards) in plain text
- ❌ Skipping PII scanning for user-provided data
- ❌ Missing security monitoring for authorization failures
- ❌ Hardcoding encryption keys or sensitive configuration in code
- ❌ Missing audit trails for security-sensitive operations
- ❌ Exposing internal security errors to API clients
- ❌ Using weak or predictable encryption/hashing algorithms
- ❌ Missing rate limiting on authentication endpoints
- ❌ Storing authentication tokens in localStorage (use httpOnly cookies)
- ❌ Missing HTTPS in production environments
- ❌ Ignoring security alert thresholds and monitoring**DDD first:** Model the domain in rich aggregates and value objects; code mirrors ubiquitous language.
- **CQRS always:** Commands mutate the write model; queries read from projections. No read‑after‑write shortcuts.
- **Event Sourcing (ESDB):** Write model persists domain events. State is reconstructed from events + snapshots.
- **Read from self:** Each context owns its read models (Redis/SQL), built from its events.
- **Separation of concerns:** Domain ≠ Application ≠ Infrastructure ≠ Interface (API). No leaking upward/downward.
- **Never throw across layers:** Use `Result<T,E>` and typed errors; map to Problem Details at the edge.
- **Observable & auditable:** Correlation IDs, user/tenant metadata on every event and log.
- **Security:** AuthN via Keycloak (JWT). AuthZ via OPA (policy decisions) before mutation or sensitive read.
- **Data Protection:** PII detection and protection at all boundaries. Comprehensive audit trails for security events.
- **Security Monitoring:** Real-time monitoring of authorization failures, authentication events, and data protection activities.
- **Scalable path:** Keep boundaries clear so extraction to microservices is a logistics task, not a rewrite.

---

## 0) File-Level Separation of Concerns & Architecture Patterns

### **🎯 Core Principle: One File = One Responsibility**

Each artifact in our CQRS/DDD system has a single, well-defined responsibility and lives in its own file. This enforces clean boundaries, improves maintainability, and enables seamless microservice extraction.

### **📁 Separation of Concerns Pattern**

**Use Cases → Orchestrate business actions**

- File: `create-product.usecase.ts`
- Purpose: Validates inputs, applies domain rules, calls aggregates, emits events
- Never handles HTTP concerns or infrastructure details

**Handlers → NestJS integration layer**

- File: `create-product.handler.ts`
- Purpose: Receives messages from NestJS command/query/event bus
- Single job: call the appropriate UseCase and return result

**Projections → Event-driven read model updates**

- File: `product-created.projection.ts`
- Purpose: Listens to domain events and updates specific read models
- Each projection handles one event type to one read model

### **🏗️ File-Level Cohesion Benefits**

1. **Clear Ownership**: One file = one class = one responsibility
2. **Smaller Git Diffs**: Changes are isolated, easier code reviews
3. **Reduced Merge Conflicts**: Large teams can work without stepping on each other
4. **Easier Refactoring**: Move files without dragging unrelated logic
5. **Better Testing**: Unit tests target specific implementations
6. **IDE Tooling**: Auto-imports, search, and navigation work reliably

### **📂 Recommended File Structure**

```
/contexts/product/
  /application/
    /commands/
      create-product.command.ts      # Command definition only
      update-product.command.ts
      delete-product.command.ts
    /handlers/
      create-product.handler.ts      # NestJS command handler
      update-product.handler.ts
      delete-product.handler.ts
    /usecases/
      create-product.usecase.ts      # Business orchestration
      update-product.usecase.ts
      delete-product.usecase.ts
    /queries/
      get-product.query.ts
      list-products.query.ts
    /query-handlers/
      get-product.handler.ts
      list-products.handler.ts

  /domain/
    product.aggregate.ts             # Aggregate root
    product.events.ts               # All domain events
    product.errors.ts               # Domain-specific errors

  /infrastructure/
    /projections/
      product-created.projection.ts   # One event → one projection
      product-updated.projection.ts
      product-deleted.projection.ts
    /repositories/
      product.repository.ts          # Aggregate repository
    /read-models/
      product.read-model.ts          # Read model definitions
```

### **🔄 Scalability & Maintainability Impact**

**Growth Management**

- Each aggregate spawns multiple commands, queries, and events
- Each event may have multiple projections across different read models
- Without file separation, components become unmanageable quickly

**Change Isolation**

- Modifying `ProductUpdatedEvent` schema? → Go to `product-updated.projection.ts`
- Adding new command? → Create `new-action.command.ts`, `new-action.handler.ts`, `new-action.usecase.ts`
- Bug in projection? → Test failure points exactly to the affected file

**Team Collaboration**

- Feature teams can work on different commands simultaneously
- Clear ownership boundaries prevent accidental coupling
- Code reviews focus on specific responsibilities

### **🚀 Microservice Extraction Enabler**

This file-per-implementation pattern is a **migration enabler**:

✅ **Extract Projections**: Move projection files to new service, wire up event subscriptions
✅ **Extract Commands**: Copy command/handler/usecase files to new NestJS app  
✅ **Extract Queries**: Move query handlers and read models to dedicated query service
✅ **Extract Domain**: Aggregate and domain events move as cohesive unit

Each file is already decoupled, so extraction becomes a logistics task, not a rewrite.

### **🧪 Testing & Mocking Advantages**

**Unit Testing**

```typescript
// Test only the use case logic
describe('CreateProductUseCase', () => {
  it('should validate and create product', async () => {
    // Mock only the ports this use case depends on
    const mockRepository = mock<ProductRepository>();
    const mockEventBus = mock<EventBus>();

    const useCase = new CreateProductUseCase(mockRepository, mockEventBus);
    // Test specific business logic in isolation
  });
});
```

**Integration Testing**

```typescript
// Test the handler → use case → aggregate flow
describe('CreateProductHandler Integration', () => {
  it('should handle command end-to-end', async () => {
    // Can mock projections independently
    // Handler and UseCase are tested as a unit
  });
});
```

**Test Isolation**

- Test failures immediately identify which component broke
- Mock only the specific dependencies each component needs
- No "god class" testing with dozens of mocked dependencies

### **⚙️ Framework Convention Alignment**

**NestJS CQRS Expectations**

```typescript
// Clear mapping: Commands ↔ Handlers
@CommandHandler(CreateProductCommand)
export class CreateProductHandler
  implements ICommandHandler<CreateProductCommand> {
  // Handler file focuses only on NestJS integration
}

// Clear mapping: Events ↔ Handlers
@EventsHandler(ProductCreatedEvent)
export class ProductCreatedProjection
  implements IEventHandler<ProductCreatedEvent> {
  // Projection file focuses only on read model updates
}
```

**IDE Tooling Benefits**

- Auto-imports work reliably: `import { CreateProductCommand } from './create-product.command'`
- Go-to-definition navigates to exact implementation
- Search and replace operations are precise
- Refactoring tools understand boundaries

### **📋 File Organization Checklist**

**✅ Do:**

- One class per file with clear, descriptive naming
- Group related files in logical folders (`/commands`, `/handlers`, `/projections`)
- Keep command definition separate from handler implementation
- Isolate each projection to handle one event type
- Use consistent naming patterns (`verb-noun.artifact.ts`)

**❌ Avoid:**

- Multiple handlers in one file
- Combining commands and queries in same file
- Mixing projections for different events
- Generic "utils" or "helpers" files that grow without bounds
- Circular dependencies between files

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
- [ ] **Security Framework**: PII protection integrated at all boundaries
- [ ] **Authorization**: OPA policy evaluation with audit logging
- [ ] **Data Protection**: PII scanning and protection in events and storage
- [ ] **Security Monitoring**: Event tracking for authorization and data protection
- [ ] **Error Management**: Domain error catalog with typed contexts
- [ ] **Result Pattern**: All fallible operations return `Result<T, E>`
- [ ] **Error Boundaries**: Infrastructure exceptions mapped to domain errors
- [ ] **Error Logging**: Structured error logs with proper categorization

**Event & Projection**

- [ ] Event name lower.dotted.v{n}, payload schema versioned
- [ ] Snapshot policy defined
- [ ] Projector idempotent with checkpointing
- [ ] Read model migration (TypeORM) scripted
- [ ] **Error Handling**: Projection failures logged and retryable
- [ ] **Result Pattern**: Projectors return `Result<void, DomainError>`

**Read Model Query**

- [ ] Only reads from projections (Redis/SQL); no domain access
- [ ] Pagination/sorting/search constraints handled in SQL/Redis
- [ ] **Error Handling**: Query failures return appropriate domain errors
- [ ] **Logging**: Query performance and errors logged with context

**Error Management Checklist**

- [ ] Error catalog uses UPPER_SNAKE_CASE naming convention
- [ ] Error categories assigned correctly (validation, business, infrastructure, etc.)
- [ ] Retryable flags set appropriately for each error type
- [ ] Type-safe context interfaces defined for error catalogs
- [ ] No `throw` statements in domain/application/infrastructure layers
- [ ] `unsafeUnwrap()` only used in test code (if at all)
- [ ] Infrastructure boundaries map exceptions with `fromError()` helper
- [ ] Controllers map domain errors to Problem Details (RFC 9457)
- [ ] Error logs include structured context (code, category, retryable)
- [ ] Sensitive data excluded from error logs and context
- [ ] Error paths tested alongside success paths
- [ ] Error metrics collected for monitoring and alerting

**Security Framework Checklist**

- [ ] JWT authentication guards applied to all protected controllers
- [ ] OPA authorization policies evaluated in all use cases before mutations
- [ ] Authorization decisions logged with DecisionLoggerService
- [ ] PII detection and protection applied to all data inputs/outputs
- [ ] Security monitoring events recorded for authorization failures
- [ ] Security monitoring events recorded for PII detections
- [ ] Event metadata includes security context (userId, tenantId, authorization)
- [ ] Repository storage applies PII protection for sensitive events
- [ ] Projection handlers scan and protect PII before read model updates
- [ ] Security alert thresholds configured for production monitoring
- [ ] Security event logging includes correlation IDs and context
- [ ] Authorization tests cover both allow and deny scenarios with proper logging
- [ ] PII protection tests validate detection accuracy and protection methods
- [ ] Security incident response procedures documented and tested

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
5. “5. "Add queries `GetProductByIdQuery` and `SearchProductsQuery` that read from the SQL/Redis read model only."

**Error Management Prompts**

6. "Create a domain error catalog for the `products` context with UPPER_SNAKE_CASE codes, proper categories (validation/business/infrastructure), and type-safe context interfaces."
7. "Add error handling to `CreateProductUseCase` using Result pattern. Map infrastructure exceptions with `fromError()` helper and include proper error context."
8. "Implement error logging in `ProductController` with structured logs, proper categorization (warn for business errors, error for infrastructure), and Problem Details mapping."
9. "Add comprehensive error path testing for `Product` aggregate and `CreateProductUseCase` including context validation and error propagation."
10. "Create error boundary middleware that catches unhandled exceptions and maps them to Problem Details with correlation IDs."

**Security Framework Prompts**

11. "Add JWT authentication guard to `ProductController` and integrate PII scanning for all incoming data with `PIIFrameworkService`."
12. "Implement OPA authorization in `CreateProductUseCase` with decision logging and security monitoring for authorization failures."
13. "Add PII protection to `Product` domain events before storage, using encryption for HIGH sensitivity data and audit logging."
14. "Create security monitoring integration in `ProductProjectionHandler` to detect and protect PII in read models."
15. "Implement comprehensive security testing for `Product` context including authorization scenarios, PII protection validation, and security event logging."”

---

## 16) Event Schema Evolution & Backward Compatibility

**Schema Versioning Strategy**

```ts
// Event version evolution example
interface PaymentCreatedEventV1 {
  version: '1';
  paymentId: string;
  amount: number;
  currency: string;
}

interface PaymentCreatedEventV2 {
  version: '2';
  paymentId: string;
  amount: {
    value: number;
    currency: string;
    precision: number;
  };
  // New field with default
  paymentMethod?: 'card' | 'bank_transfer' | 'wallet';
}
```

**Evolution Patterns**

- **Additive changes**: New optional fields with sensible defaults
- **Field renames**: Keep old field, add new field, deprecate old
- **Breaking changes**: Introduce new event version, maintain projection compatibility
- **Upcasting**: Transform old events to new schema during replay

**Implementation**

```ts
export class EventUpcaster {
  upcast(event: StoredEvent): DomainEvent {
    switch (event.type) {
      case 'payment.created.v1':
        return this.upcastPaymentCreatedV1ToV2(event);
      case 'payment.created.v2':
        return event as PaymentCreatedEventV2;
      default:
        throw new UnknownEventVersionError(event.type);
    }
  }
}
```

---

## 17) Performance Considerations

**Snapshot Frequency Policies**

```ts
export class SnapshotPolicy {
  shouldCreateSnapshot(aggregate: AggregateRoot): boolean {
    // Time-based: snapshot every 24 hours
    if (this.timeSinceLastSnapshot(aggregate.id) > Duration.hours(24)) {
      return true;
    }

    // Event count: every 100 events
    if (aggregate.version % 100 === 0) {
      return true;
    }

    // Load time: if reconstruction takes too long
    if (aggregate.reconstructionTime > Duration.seconds(2)) {
      return true;
    }

    return false;
  }
}
```

**Projection Performance & Scaling**

- **Parallel processing**: Process different event types in parallel workers
- **Batch processing**: Group events for bulk read model updates
- **Partitioning**: Shard projections by tenant or aggregate type
- **Catchup optimization**: Use projection checkpoints for resumable processing

```ts
export class OptimizedProjector {
  async processEventBatch(events: DomainEvent[]): Promise<void> {
    // Group by projection type
    const batches = this.groupEventsByProjection(events);

    // Process in parallel
    await Promise.all(batches.map((batch) => this.processBatch(batch)));
  }
}
```

**Read Model Optimization**

- **Caching layers**: Redis for hot data, SQL for complex queries
- **Materialized views**: Pre-compute complex aggregations
- **Index strategies**: Optimize for query patterns, not write patterns
- **Read replicas**: Scale read operations across multiple databases

---

## 18) Enhanced Error Handling

**Domain Error Types**

```ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly type: 'validation' | 'business' | 'conflict';
}

export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';
  readonly type = 'business' as const;

  constructor(
    public readonly accountId: string,
    public readonly requestedAmount: number,
    public readonly availableAmount: number,
  ) {
    super(
      `Insufficient funds: requested ${requestedAmount}, available ${availableAmount}`,
    );
  }
}

export class PaymentAlreadyProcessedError extends DomainError {
  readonly code = 'PAYMENT_ALREADY_PROCESSED';
  readonly type = 'conflict' as const;

  constructor(public readonly paymentId: string) {
    super(`Payment ${paymentId} has already been processed`);
  }
}
```

**Problem Details Mapping**

```ts
export class DomainErrorMapper {
  toProblemDetails(error: DomainError, correlationId: string): ProblemDetails {
    switch (error.type) {
      case 'validation':
        return {
          type: 'https://api.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          instance: correlationId,
          extensions: { code: error.code },
        };

      case 'business':
        return {
          type: 'https://api.example.com/problems/business-rule-violation',
          title: 'Business Rule Violation',
          status: 422,
          detail: error.message,
          instance: correlationId,
          extensions: { code: error.code },
        };

      case 'conflict':
        return {
          type: 'https://api.example.com/problems/resource-conflict',
          title: 'Resource Conflict',
          status: 409,
          detail: error.message,
          instance: correlationId,
          extensions: { code: error.code },
        };
    }
  }
}
```

---

## 19) Enhanced Testing Strategies

**Event Sourcing Testing Patterns**

```ts
describe('Payment Aggregate', () => {
  it('should emit payment created event when creating payment', () => {
    // Given
    const paymentId = new PaymentId('pay-123');
    const amount = Money.from(100, 'USD');

    // When
    const result = Payment.create({ id: paymentId, amount });

    // Then
    expect(result.isOk()).toBe(true);
    const [payment, events] = result.unwrapWithEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(PaymentCreatedEvent);
    expect(events[0].paymentId).toBe(paymentId.value);
  });

  it('should maintain invariants across event replay', async () => {
    // Given - historical events
    const events = [
      new PaymentCreatedEvent('pay-123', 100, 'USD'),
      new PaymentAuthorizedEvent('pay-123', 'auth-456'),
    ];

    // When - replay events
    const payment = Payment.fromEvents(events);

    // Then - invariants maintained
    expect(payment.status).toBe(PaymentStatus.Authorized);
    expect(payment.canCapture()).toBe(true);
  });
});
```

**Projection Testing**

```ts
describe('PaymentProjector', () => {
  it('should update read model on payment created', async () => {
    // Given
    const event = new PaymentCreatedEvent('pay-123', 100, 'USD');

    // When
    await projector.handle(event);

    // Then
    const readModel = await readModelRepo.findById('pay-123');
    expect(readModel).toMatchObject({
      id: 'pay-123',
      amount: 100,
      currency: 'USD',
      status: 'pending',
    });
  });

  it('should be idempotent', async () => {
    // Given - event processed twice
    const event = new PaymentCreatedEvent('pay-123', 100, 'USD');

    // When
    await projector.handle(event);
    await projector.handle(event); // Process again

    // Then - only one record exists
    const readModels = await readModelRepo.findAll();
    expect(readModels).toHaveLength(1);
  });
});
```

**Contract Testing Between Contexts**

```ts
describe('Payment Context Contracts', () => {
  it('should maintain event schema contract', () => {
    const event = new PaymentCreatedEvent('pay-123', 100, 'USD');
    const serialized = JSON.stringify(event);
    const schema = paymentEventSchemas['payment.created.v1'];

    expect(validateSchema(serialized, schema)).toBe(true);
  });

  it('should maintain command DTO contract', () => {
    const command: CreatePaymentCommand = {
      amount: 100,
      currency: 'USD',
      customerId: 'cust-123',
    };

    const schema = commandSchemas.CreatePaymentCommand;
    expect(validateSchema(command, schema)).toBe(true);
  });
});
```

---

## 20) Deployment & Operations

**Database Migration Strategies**

```ts
// Event store migration example
export class EventStoreMigration {
  async migrateEvents(fromVersion: string, toVersion: string): Promise<void> {
    const events = await this.eventStore.readAllEvents();

    for await (const event of events) {
      if (event.version === fromVersion) {
        const migratedEvent = this.upcaster.upcast(event);
        await this.eventStore.replaceEvent(event.id, migratedEvent);
      }
    }
  }
}
```

**Event Store Maintenance**

- **Scavenging**: Remove deleted/expired events to reclaim space
- **Archival**: Move old events to cold storage (S3, Azure Blob)
- **Backup strategies**: Point-in-time recovery, cross-region replication
- **Monitoring**: Track stream growth, projection lag, storage usage

**Monitoring & Alerting Patterns**

```ts
export class EventProcessingMetrics {
  @Counter('events_processed_total')
  eventsProcessed: Counter;

  @Histogram('projection_processing_duration_seconds')
  projectionDuration: Histogram;

  @Gauge('projection_lag_seconds')
  projectionLag: Gauge;

  recordEventProcessed(eventType: string): void {
    this.eventsProcessed.inc({ event_type: eventType });
  }

  recordProjectionLag(projectionName: string, lagSeconds: number): void {
    this.projectionLag.set({ projection: projectionName }, lagSeconds);
  }
}
```

---

## 21) Advanced Patterns

**Saga/Process Manager for Cross-Context Workflows**

```ts
export class PaymentProcessSaga {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly inventoryService: InventoryService,
    private readonly notificationService: NotificationService,
  ) {}

  @EventHandler(OrderPlacedEvent)
  async handle(event: OrderPlacedEvent): Promise<void> {
    // Step 1: Reserve inventory
    const reservationResult = await this.inventoryService.reserveItems({
      orderId: event.orderId,
      items: event.items,
    });

    if (reservationResult.isErr()) {
      await this.handleInventoryReservationFailure(event);
      return;
    }

    // Step 2: Process payment
    const paymentResult = await this.paymentService.processPayment({
      orderId: event.orderId,
      amount: event.totalAmount,
      customerId: event.customerId,
    });

    if (paymentResult.isErr()) {
      await this.compensateInventoryReservation(event.orderId);
      return;
    }

    // Step 3: Confirm order
    await this.notificationService.sendOrderConfirmation(event.orderId);
  }
}
```

**Event Replay & Projection Rebuild**

```ts
export class ProjectionRebuilder {
  async rebuildProjection(
    projectionName: string,
    fromTimestamp?: Date,
  ): Promise<void> {
    // Reset projection state
    await this.clearProjection(projectionName);

    // Start from beginning or specific point
    const startPosition = fromTimestamp
      ? await this.getPositionFromTimestamp(fromTimestamp)
      : Position.start();

    // Replay events
    const subscription = await this.eventStore.subscribeToAll(startPosition);

    for await (const event of subscription) {
      await this.projector.handle(event);
      await this.updateCheckpoint(projectionName, event.position);
    }
  }
}
```

**Monitoring Dashboard Configuration**

```yaml
# Grafana dashboard for event processing
apiVersion: v1
kind: ConfigMap
metadata:
  name: event-processing-dashboard
data:
  dashboard.json: |
    {
      "dashboard": {
        "title": "Event Processing",
        "panels": [
          {
            "title": "Events Processed per Second",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(events_processed_total[5m])",
                "legendFormat": "{{event_type}}"
              }
            ]
          },
          {
            "title": "Projection Lag",
            "type": "graph",
            "targets": [
              {
                "expr": "projection_lag_seconds",
                "legendFormat": "{{projection}}"
              }
            ]
          }
        ]
      }
    }
```

---

## 22) Enhanced Service Extraction Playbook

**Database Splitting Strategies**

1. **Shared Database Anti-pattern**: Start with logical separation within same DB
2. **Database per Service**: Extract schema to dedicated database
3. **Data Synchronization**: Use CDC (Change Data Capture) during transition
4. **Foreign Key Migration**: Replace with eventual consistency via events

```ts
// Before: Direct foreign key
class Order {
  @Column()
  customerId: string; // Direct reference
}

// After: Event-driven consistency
class Order {
  @Column()
  customerId: string; // Logical reference only

  @Column()
  customerValidated: boolean; // Eventual consistency flag
}
```

**API Versioning During Extraction**

```ts
// v1: Monolith endpoint
@Controller('v1/payments')
export class PaymentsV1Controller {
  @Post()
  async createPayment(@Body() dto: CreatePaymentV1Dto) {
    // Direct service call
    return this.paymentsService.create(dto);
  }
}

// v2: Service endpoint with backward compatibility
@Controller('v2/payments')
export class PaymentsV2Controller {
  @Post()
  async createPayment(@Body() dto: CreatePaymentV2Dto) {
    // HTTP call to extracted service
    return this.httpClient.post('/payments-service/payments', dto);
  }
}
```

**Performance Benchmarking**

```ts
export class ExtractionBenchmark {
  async benchmarkBeforeExtraction(): Promise<Metrics> {
    return {
      responseTime: await this.measureResponseTime(),
      throughput: await this.measureThroughput(),
      errorRate: await this.measureErrorRate(),
      resourceUsage: await this.measureResourceUsage(),
    };
  }

  async validatePerformanceAfterExtraction(
    baseline: Metrics,
  ): Promise<boolean> {
    const current = await this.benchmarkAfterExtraction();

    return (
      current.responseTime <= baseline.responseTime * 1.2 && // 20% tolerance
      current.throughput >= baseline.throughput * 0.8 && // 20% tolerance
      current.errorRate <= baseline.errorRate * 1.1 // 10% tolerance
    );
  }
}
```

---

## 25) Security & Error Management Integration Summary

**Core Integration Points**

The security framework and error management system are deeply integrated with the CQRS/DDD architecture at every layer:

1. **Domain Layer**
   - Aggregates return `Result<T, DomainError>` from all business operations
   - Rich error types with typed context and proper categorization
   - Domain events include security metadata and PII protection markers
   - No exceptions thrown from domain logic - all errors are modeled explicitly

2. **Application Layer**
   - Use cases orchestrate Result composition with `map()`, `andThen()`, `orElse()`
   - OPA authorization with comprehensive audit logging and decision tracking
   - Error context enriched at each layer for debugging and observability
   - Security monitoring integration for authorization and authentication events

3. **Infrastructure Layer**
   - All external service calls wrapped in try/catch with `fromError()` mapping
   - Event store operations with PII protection and security metadata
   - Repository implementations never throw - always return error Results
   - Encrypted storage for sensitive data with key management

4. **Interface Layer**
   - Controllers map domain errors to Problem Details (RFC 9457)
   - JWT authentication guards with comprehensive security monitoring
   - PII scanning and protection for all incoming and outgoing data
   - HTTP status codes derived from error categories and security context

**Error-Aware CQRS Patterns**

```typescript
// Command Processing with Error Handling
const result = await validateCommand(command)
  .andThen((cmd) => authorizeOperation(user, cmd))
  .andThen((cmd) => loadAggregate(cmd.aggregateId))
  .andThen((aggregate) => aggregate.processCommand(cmd))
  .andThen((events) => saveEvents(events))
  .andThen(() => publishEvents(events));

if (result.isErr()) {
  // Structured error logging and Problem Details response
  return this.handleDomainError(result.error);
}
```

**Production Readiness Checklist**

When implementing new features, ensure:

- [ ] All domain operations return `Result<T, DomainError>`
- [ ] Error catalogs follow naming conventions and include proper context types
- [ ] Infrastructure boundaries use `fromError()` for exception mapping
- [ ] Controllers map errors to Problem Details with correlation IDs
- [ ] Error logging follows structured format with appropriate levels
- [ ] Tests cover both success and error paths with context validation
- [ ] Monitoring alerts configured for error rate patterns
- [ ] Error documentation maintained with troubleshooting guides

**Observability & Debugging**

The error management system provides comprehensive observability:

- **Structured Logs**: All errors logged with context, correlation IDs, and categorization
- **Metrics**: Error rates tracked by service, component, category, and retryable flag
- **Tracing**: Error propagation tracked through distributed traces
- **Dashboards**: Error analysis dashboards with LogQL queries and alerts
- **Problem Details**: Client-friendly error responses with actionable information

This ensures that the "never throw" principle is maintained throughout the entire CQRS/DDD architecture while providing production-grade error handling, observability, and debugging capabilities.

---

**End of instructions.**
