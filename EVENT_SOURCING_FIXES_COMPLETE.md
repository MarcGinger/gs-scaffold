# Event Sourcing Anti-Pattern Fixes - ProductAggregate Implementation

## Overview

This document captures the comprehensive refactoring of the ProductAggregate to eliminate event sourcing anti-patterns and implement proper domain-driven design principles.

## Problems Addressed

### 1. onProductCreated Did Nothing (Critical Event Replay Issue)

**Problem**: The `onProductCreated` event handler was empty, breaking event replay functionality.

**Solution**:

```typescript
private onProductCreated(event: ProductCreatedDomainEvent): void {
  // Extract all event payload data for entity reconstruction
  const id = unsafeUnwrap(ProductId.create(event.aggregateId));
  const name = unsafeUnwrap(ProductName.create(event.payload.name));
  const sku = unsafeUnwrap(Sku.create(event.payload.sku));
  const price = unsafeUnwrap(
    Price.create(event.payload.price, event.payload.currency),
  );
  const category = unsafeUnwrap(
    Category.create(event.payload.categoryId, event.payload.categoryName),
  );
  const status = ProductStatus.fromString(event.payload.status);

  // Create entity properties using event timestamp
  const entityProps: ProductEntityProps = {
    id,
    name,
    sku,
    price,
    category,
    status,
    description: event.payload.description,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
  };

  // Build entity from event data for proper event replay
  this.entity = ProductEntity.reconstitute(entityProps);
}
```

### 2. Pre-Mutation Anti-Pattern Eliminated

**Problem**: Business methods were mutating entity state before applying events, causing:

- Double work (validation + mutation before event, then event replay)
- Potential state divergence between command and event paths
- Incorrect event sourcing patterns

**Solution**: Implement validation → apply event pattern:

```typescript
public changePrice(newPrice: Price, metadata: EventMetadata): Result<void, DomainError> {
  // Precondition checks using entity (no pre-mutation)
  if (this.entity.isDeleted()) {
    return err(ProductErrors.PRODUCT_DELETED);
  }

  if (newPrice.getValue() <= 0) {
    return err(ProductErrors.INVALID_PRICE);
  }

  // No-op guard: check if price actually changed
  if (newPrice.equals && newPrice.equals(this.entity.price)) {
    return err(ProductErrors.PRICE_UNCHANGED);
  }

  // Prepare event data (capture old values before applying)
  const oldPrice = this.entity.price;

  const event = new ProductPriceChangedDomainEvent(
    this.entity.id.getValue(),
    this.version + 1,
    metadata,
    {
      oldPrice: oldPrice.getValue(),
      newPrice: newPrice.getValue(),
      currency: newPrice.getCurrency(),
    },
  );

  this.apply(event); // Entity state updated through event handling
  return ok(undefined);
}
```

### 3. No-Op Guards Added

**Problem**: Missing validation for unchanged operations leading to unnecessary events.

**Solution**: Added domain-specific no-op guards:

- `PRODUCT_NOT_MODIFIED` - for updateDetails when nothing changes
- `PRICE_UNCHANGED` - for changePrice when new price equals current
- `CATEGORY_UNCHANGED` - for categorize when category is the same

### 4. Type Safety Improvements

**Problem**: Snapshot methods used `any` types.

**Solution**:

```typescript
protected applySnapshot(snapshot: ProductEntitySnapshot): void {
  // Type-safe snapshot reconstruction
}

public createSnapshot(): ProductEntitySnapshot {
  return this.entity.toSnapshot();
}
```

## Key Event Sourcing Principles Implemented

### 1. Proper Event Replay Support

- `onProductCreated` now builds entity from event payload
- Uses event timestamp (`occurredAt`) for entity timestamps
- All event handlers properly reconstruct entity state

### 2. Validation-Only Business Methods

- Precondition checks using current entity state
- No entity mutation before event application
- Event preparation with captured old values
- Single source of truth: events drive all state changes

### 3. Immutable Entity Operations

- Entity methods return new instances (immutable)
- No side effects in validation logic
- Thread-safe concurrent access patterns

### 4. Domain-Specific No-Op Detection

- Business-relevant error messages for unchanged operations
- Prevents unnecessary event generation
- Clear feedback to consumers about operation results

## Implementation Patterns

### Entity-Aggregate Separation

```typescript
// Aggregate: Validates and coordinates
if (this.entity.isDeleted()) {
  return err(ProductErrors.PRODUCT_DELETED);
}

// Entity: Provides immutable operations
const result = this.entity.changePrice(newPrice);

// Event: Single source of state change
this.apply(event);
```

### Event-First State Management

```typescript
// ❌ Anti-pattern: Mutate then event
const result = this.entity.changePrice(newPrice); // Pre-mutation
this.apply(event); // Redundant state change

// ✅ Correct pattern: Validate then event
if (this.entity.isDeleted()) return err(...); // Validation only
this.apply(event); // Single state change through event
```

### Clock Injection Ready

```typescript
// Event handlers use event.occurredAt for timestamps
createdAt: event.occurredAt,
updatedAt: event.occurredAt,
```

## Testing Implications

### Event Replay Tests

```typescript
test('onProductCreated builds entity from event payload', () => {
  const event = new ProductCreatedDomainEvent(/*...*/);
  aggregate.apply(event);

  expect(aggregate.entity.name.getValue()).toBe(event.payload.name);
  expect(aggregate.entity.createdAt).toBe(event.occurredAt);
});
```

### No-Op Validation Tests

```typescript
test('changePrice returns PRICE_UNCHANGED for same price', () => {
  const currentPrice = aggregate.entity.price;
  const result = aggregate.changePrice(currentPrice, metadata);

  expect(result.error).toBe(ProductErrors.PRICE_UNCHANGED);
});
```

### Event Sourcing Flow Tests

```typescript
test('business method does not mutate entity before event', () => {
  const originalPrice = aggregate.entity.price;

  // Trigger validation that should fail
  const result = aggregate.changePrice(invalidPrice, metadata);

  // Entity should be unchanged (no pre-mutation)
  expect(aggregate.entity.price).toBe(originalPrice);
});
```

## Architectural Benefits

1. **Event Replay Correctness**: Aggregates can be reconstructed from events
2. **Command-Event Consistency**: Single code path for state changes
3. **Concurrency Safety**: Immutable operations prevent race conditions
4. **Business Clarity**: No-op guards provide clear domain feedback
5. **Testability**: Separated concerns enable focused unit tests

## Next Steps

1. **Clock Injection**: Implement configurable clock for deterministic timestamps
2. **Event Type Constants**: Define strongly-typed event type constants
3. **Integration Testing**: Verify event replay across aggregate lifecycle
4. **Performance Optimization**: Consider snapshot frequency for large aggregates

## Error Types Added

```typescript
PRODUCT_NOT_MODIFIED: {
  code: 'PRODUCT.PRODUCT_NOT_MODIFIED',
  title: 'Product not modified',
  detail: 'The requested changes would result in no actual modification',
  category: 'domain',
  retryable: false,
},

PRICE_UNCHANGED: {
  code: 'PRODUCT.PRICE_UNCHANGED',
  title: 'Price unchanged',
  detail: 'The new price is the same as the current price',
  category: 'domain',
  retryable: false,
},

CATEGORY_UNCHANGED: {
  code: 'PRODUCT.CATEGORY_UNCHANGED',
  title: 'Category unchanged',
  detail: 'The new category is the same as the current category',
  category: 'domain',
  retryable: false,
}
```

This refactoring transforms the ProductAggregate from an anti-pattern-laden implementation into a proper event sourcing aggregate that follows DDD principles and supports reliable event replay.
