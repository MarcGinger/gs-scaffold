# Shared Clock Implementation (DDD + CQRS + ESDB + NestJS)

A pragmatic, testable time strategy for your domain and aggregates. This pattern keeps **time abstractions** in a shared kernel, **implementations** in infrastructure/tests, and **event timestamps** as the single source of truth for replay.

---

## 1) Goals & Non‑Goals

**Goals**

- Deterministic tests and reproducible event replays
- Pure domain code (no NestJS/process APIs)
- Clear separation between **system time** and **event time**
- Simple ergonomics for aggregates/entities

**Non‑Goals**

- Wall‑clock/timezone management for presentation (that belongs in the UI layer)
- Complex time providers (keep surface minimal; extend as needed)

---

## 2) Design Principles

1. **Event time beats system time.** If an event provides `occurredAt`, that timestamp drives state.
2. **Injection over global calls.** Domain code never calls `new Date()` directly.
3. **Shared kernel interface, infra implementations.** Domain depends on `Clock` interface only.
4. **Deterministic writes.** When minting events, use the injected `Clock` once and propagate the value.

---

## 3) Folder Layout

```
shared-kernel/
  time/
    clock.ts                # Clock interface + base impls (pure TS)

infrastructure/
  time/
    nest-clock.provider.ts  # Nest provider for Clock

catalog-domain/
  product/
    domain/
      product.entity.ts     # Uses Clock via ctor or static setter
      product.aggregate.ts  # Uses Clock when creating events
      events/               # Domain events + metadata
```

> Keep `Clock` in **shared-kernel** (no Nest). Wire providers in **infrastructure**.

---

## 4) The `Clock` Interface & Implementations

```ts
// shared-kernel/time/clock.ts
export interface Clock {
  now(): Date;
  nowIso(): string; // convenience for metadata (ISO-8601, UTC)
  // lightweight numeric epoch millis when callers only need a number
  nowMs?(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowIso(): string {
    return this.now().toISOString();
  }
}

/**
 * Fixed/frozen clock for tests; can be advanced manually.
 */
export class FixedClock implements Clock {
  // Store a private Date instance and always return defensive copies
  private current: Date;
  constructor(current: Date | string) {
    this.current = new Date(current);
  }

  now(): Date {
    // return a copy so callers can't mutate internal state
    return new Date(this.current.getTime());
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  nowMs(): number {
    return this.current.getTime();
  }

  set(d: Date | string) {
    this.current = new Date(d);
  }

  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}
```

> Add more impls (e.g., `MonotonicClock`) only if you need stricter guarantees against clock skew.

---

## 5) NestJS Wiring (Infrastructure)

```ts
// infrastructure/time/nest-clock.provider.ts
import { Provider } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared-kernel/time/clock';

export const CLOCK = Symbol('CLOCK');

export const ClockProvider: Provider = {
  provide: CLOCK,
  useClass: SystemClock,
};
```

> Tip: the example above registers a singleton provider (default). If you need a request-scoped clock (one instance per incoming HTTP request or test override), consider using `scope: Scope.REQUEST` on the provider and import `Scope` from `@nestjs/common`. Request scope has runtime cost; use it only when you need per-request variability.

```ts
// request-scoped example (optional)
import { Provider, Scope } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared-kernel/time/clock';

export const ClockProviderRequestScoped: Provider = {
  provide: CLOCK,
  useClass: SystemClock,
  scope: Scope.REQUEST,
};
```

Register it in your root/app module:

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { ClockProvider } from './infrastructure/time/nest-clock.provider';

@Module({
  providers: [ClockProvider],
  exports: [ClockProvider],
})
export class AppModule {}
```

> You can replace `useClass` with a factory if you want to select an impl by env.

---

## 6) Event Metadata Contract

```ts
// catalog-domain/product/events/product.events.ts
export interface EventMetadata {
  // ISO-8601; must be set when the event is created
  occurredAt: string; // use Clock.nowIso() which uses toISOString() (UTC)
  // include correlationId, tenantId, userId, etc. as needed
  correlationId?: string;
  tenantId?: string;
  userId?: string;
}
```

> Suggestion: consider adding a small alias in your TS defs for clarity: `type IsoDateString = string;` and then use `occurredAt: IsoDateString` in `EventMetadata` so intent is explicit across the codebase.

> **Rule**: When minting events, the aggregate sets `occurredAt = clock.nowIso()` once.

---

## 7) Using `Clock` in the Aggregate (minting events)

**Prefer:** Compute time once at the start of the command method.

```ts
// catalog-domain/product/domain/product.aggregate.ts
import { Clock } from '../../../shared-kernel/time/clock';
import { CLOCK } from '../../../infrastructure/time/nest-clock.provider';
import { Inject } from '@nestjs/common';

export class ProductAggregate extends AggregateRootBase {
  constructor(@Inject(CLOCK) private readonly clock: Clock) { super(); }

  createProduct(/* ids, VOs, ... */, meta: Omit<EventMetadata, 'occurredAt'>) {
    // validate preconditions here...

    const occurredAt = this.clock.nowIso();
    this.apply(new ProductCreatedDomainEvent(
      id.getValue(),
      this.version + 1,
      { ...meta, occurredAt },
      {
        name: name.getValue(),
        sku: sku.getValue(),
        price: price.getValue(),
        currency: price.getCurrency(),
        categoryId: category.getId(),
        categoryName: category.getName(),
        status: 'DRAFT',
        description,
      },
    ));
  }
}
```

> Alternative: If your aggregates are not Nest-injected, pass `Clock` via factory method or module-level registration.

---

## 8) Using `Clock` in the Entity (touching updatedAt)

Two pragmatic options; pick one and **be consistent**.

### Option A – Constructor/Factory Injection (purest)

```ts
// product.entity.ts
import { Clock } from '../../../shared-kernel/time/clock';

export class ProductEntity extends EntityBase<ProductEntityProps, ProductId> {
  private constructor(
    private readonly props: ProductEntityProps,
    private readonly clock: Clock,
  ) {
    super(props, props.id);
  }

  static create(props: ProductEntityProps, clock: Clock) {
    // validate props...
    return ok(new ProductEntity(props, clock));
  }

  changePrice(newPrice: Price) {
    // domain rules...
    const updated = {
      ...this.props,
      price: newPrice,
      updatedAt: this.clock.now(),
    };
    return ProductEntity.create(updated, this.clock);
  }
}
```

### Option B – Static Setter (pragmatic & test-friendly)

```ts
export class ProductEntity extends EntityBase<ProductEntityProps, ProductId> {
  private static clock: Clock;
  static setClock(c: Clock) {
    this.clock = c;
  }

  changePrice(newPrice: Price) {
    const updated = {
      ...this.props,
      price: newPrice,
      updatedAt: ProductEntity.clock.now(),
    };
    return ProductEntity.create(updated);
  }
}
```

> Option A is purer. Option B is extremely convenient for tests and avoids passing `Clock` everywhere. Both are acceptable.

---

## 9) Applying Events: **Event Time Wins**

In `when(...)`, reconstruct state using the **event’s** timestamp.

```ts
private onProductCreated(e: ProductCreatedDomainEvent): void {
  const t = new Date(e.metadata.occurredAt);
  const props: ProductEntityProps = {
    id: ProductId.from(e.aggregateId),
    name: ProductName.from(e.payload.name),
    sku: Sku.from(e.payload.sku),
    price: Price.of(e.payload.price, e.payload.currency),
    category: Category.rehydrate(e.payload.categoryId, e.payload.categoryName),
    status: ProductStatus.fromString(e.payload.status),
    description: e.payload.description,
    createdAt: t,
    updatedAt: t,
  };
  this.entity = ProductEntity.reconstitute(props); // no Clock needed here
}
```

For subsequent events (e.g., price change), also prefer the event timestamp (if needed for `updatedAt`). You may set `updatedAt` from event metadata inside the entity method or in the aggregate before reconstitution.

---

## 10) Testing Recipes

### Unit Test: Aggregate with `FixedClock`

```ts
import { FixedClock } from '../../shared-kernel/time/clock';

const fixed = new FixedClock(new Date('2025-08-16T10:00:00Z'));
const agg = new ProductAggregate(fixed as any); // via ctor or factory

agg.createProduct(/* ... */, { correlationId: 'c1' });
const events = agg.pullUncommittedEvents();
expect(events[0].metadata.occurredAt).toBe('2025-08-16T10:00:00.000Z');
```

### Unit Test: Entity with `FixedClock`

```ts
ProductEntity.setClock(new FixedClock(new Date('2025-08-16T10:00:00Z')));
const created = ProductEntity.create(initialProps);
const updated = created.value.changePrice(Price.of(100, 'ZAR')).value;
expect(updated.updatedAt.toISOString()).toBe('2025-08-16T10:00:00.000Z');

// Additional minimal tests to add:
// - ensure FixedClock.now() returns defensive copies (mutating returned Date doesn't change internal state)
// - advance(0) is a no-op
// - advance(negative) moves clock backwards (document if this is allowed or throw on negative)
```

### E2E/Integration: Swap Clocks via Provider Override

```ts
await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(CLOCK)
  .useValue(new FixedClock(new Date('2025-08-16T10:00:00Z')))
  .compile();
```

---

## 11) Migration Playbook (from `new Date()`)

1. Create `Clock` interface + `SystemClock` in **shared-kernel**.
2. Add Nest provider for `CLOCK` token.
3. Replace direct `new Date()` in **aggregates** where events are minted → `clock.nowIso()`.
4. Replace direct `new Date()` in **entities** → `clock.now()` (via Option A or B).
5. In `when(...)`, prefer `event.metadata.occurredAt` for timestamps.
6. Add a `FixedClock` and update unit tests to be deterministic.

Note: the `FixedClock` implementation returns defensive copies from `now()` to avoid accidental test flakiness caused by mutating Dates retrieved from the clock.

---

## 12) Do’s & Don’ts

**Do**

- Use a single `Clock` instance per operation/request
- Stamp events with `occurredAt` once and reuse it
- Drive replays from `occurredAt` exclusively

**Don’t**

- Call `new Date()` directly in domain code
- Mix system time and event time in a single projection step
- Depend on DB default timestamps for domain logic

---

## 13) Checklist

- [ ] `Clock` interface in `shared-kernel/time/clock.ts`
- [ ] `SystemClock` and `FixedClock` implemented
- [ ] `CLOCK` Nest token + provider registered
- [ ] Aggregates set `occurredAt` via `clock.nowIso()`
- [ ] Entities set `updatedAt` via `clock.now()`
- [ ] `when(...)` uses event `occurredAt` for state timestamps
- [ ] Test modules override `CLOCK` with `FixedClock`
- [ ] All `new Date()` removed from domain layer

---

## 14) Advanced Options (Optional)

- **MonotonicClock**: Wrap a base Clock to guarantee non-decreasing `now()` to avoid time going backwards.
- **Time zones**: Keep all domain timestamps in UTC (`toISOString()`); convert at the UI/reporting layer.
- **Logical clocks**: If you need causality across services, use version vectors/sequence numbers in addition to timestamps.

---

## 15) Example: End‑to‑End Path

1. **Command** hits `ProductAggregate.changePrice` → validate → `occurredAt = clock.nowIso()` → `apply(ProductPriceChanged(...))`
2. **when(ProductPriceChanged)** → compute new entity via `entity.changePrice(...)` (use event data) → replace entity
3. **Snapshot** uses `entity.toSnapshot()`; **rehydration** rebuilds via `ProductEntity.reconstitute(...)`
4. **Tests** swap in `FixedClock` for reproducible timestamps

This keeps your domain deterministic, your tests clean, and your event stream authoritative for time.
