# Product Aggregate Entity Integration

## Overview

Successfully integrated the **ProductEntity** into the **ProductAggregate**, implementing proper Domain-Driven Design separation of concerns between entities and aggregates.

## Architecture Pattern Implementation

### Before: Monolithic Aggregate

```typescript
export class ProductAggregate extends AggregateRootBase {
  private props: ProductProps; // Raw data management

  // Mixed concerns:
  // - State management
  // - Business validation
  // - Event handling
  // - Persistence logic
}
```

### After: Entity-Aggregate Collaboration

```typescript
export class ProductAggregate extends AggregateRootBase {
  private entity: ProductEntity; // Delegate to entity for state

  // Focused concerns:
  // - Event sourcing
  // - Complex business rules
  // - Cross-entity operations
  // - Aggregate-level validation
}
```

## Implementation Details

### 1. Entity Integration

The aggregate now uses ProductEntity for all state management:

```typescript
export class ProductAggregate extends AggregateRootBase {
  private entity: ProductEntity;

  private constructor(entity: ProductEntity) {
    super();
    this.entity = entity;
  }

  // Factory methods
  public static create(...): Result<ProductAggregate, DomainError>
  public static reconstitute(entity: ProductEntity): ProductAggregate
}
```

### 2. Business Method Pattern

All business operations follow a consistent pattern:

```typescript
public changePrice(newPrice: Price, metadata: EventMetadata): Result<void, DomainError> {
  // 1. Delegate validation and state change to entity
  const result = this.entity.changePrice(newPrice);
  if (result.ok === false) {
    return err(result.error);
  }

  // 2. Create and apply domain event
  const event = new ProductPriceChangedDomainEvent(
    this.entity.id.getValue(),
    this.version + 1,
    metadata,
    { /* event payload */ }
  );

  // 3. Apply event (triggers state update via event handler)
  this.apply(event);
  return ok(undefined);
}
```

### 3. Event Handler Pattern

Event handlers now update the entity immutably:

```typescript
private onProductPriceChanged(event: ProductPriceChangedDomainEvent): void {
  const newPrice = unsafeUnwrap(
    Price.create(event.payload.newPrice, event.payload.currency)
  );

  // Update entity immutably
  const result = this.entity.changePrice(newPrice);
  if (result.ok) {
    this.entity = result.value; // Replace with new instance
  }
}
```

### 4. Delegation Pattern

All property access delegates to the entity:

```typescript
// Getters delegate to entity
get id(): ProductId { return this.entity.id; }
get name(): ProductName { return this.entity.name; }
get price(): Price { return this.entity.price; }

// Business queries delegate to entity
public isActive(): boolean { return this.entity.isActive(); }
public isDeleted(): boolean { return this.entity.isDeleted(); }
```

## Key Benefits Achieved

### 1. Single Responsibility Principle

- **Entity**: Identity, basic operations, validation
- **Aggregate**: Events, complex business rules, persistence

### 2. Immutable State Management

```typescript
// Entity operations return new instances
const result = this.entity.changePrice(newPrice);
if (result.ok) {
  this.entity = result.value; // Replace, don't mutate
}
```

### 3. Type Safety

- Entity validates all operations with Result types
- Aggregate benefits from entity's type safety
- Compiler catches invalid state transitions

### 4. Testability

```typescript
// Test entity behavior independently
describe('ProductEntity', () => {
  it('should validate price changes', () => {
    const entity = ProductEntity.create(props);
    const result = entity.changePrice(invalidPrice);
    expect(result.ok).toBe(false);
  });
});

// Test aggregate event handling
describe('ProductAggregate', () => {
  it('should emit price changed event', () => {
    const aggregate = ProductAggregate.create(...);
    aggregate.changePrice(newPrice, metadata);
    expect(aggregate.getUncommittedEvents()).toHaveLength(1);
  });
});
```

## Method Implementations

### Factory Methods

```typescript
// Create new aggregate with entity validation
public static create(
  id: ProductId,
  name: ProductName,
  // ... other params
): Result<ProductAggregate, DomainError> {
  const entityProps: ProductEntityProps = { /* ... */ };
  const entityResult = ProductEntity.create(entityProps);

  if (entityResult.ok === false) {
    return err(entityResult.error);
  }

  const aggregate = new ProductAggregate(entityResult.value);
  // Apply creation event...
  return ok(aggregate);
}

// Reconstitute from existing entity
public static reconstitute(entity: ProductEntity): ProductAggregate {
  return new ProductAggregate(entity);
}
```

### Business Operations

```typescript
public updateDetails(name: ProductName, description?: string, metadata: EventMetadata) {
  // Chain entity operations for complex updates
  const nameResult = this.entity.updateName(name);
  if (nameResult.ok === false) return err(nameResult.error);

  const descResult = nameResult.value.updateDescription(description);
  if (descResult.ok === false) return err(descResult.error);

  // Apply update event...
}
```

### Snapshot Management

```typescript
// Delegate snapshot creation to entity
public createSnapshot(): any {
  return this.entity.toSnapshot();
}

// Reconstitute entity from snapshot
protected applySnapshot(snapshot: any): void {
  const entityProps: ProductEntityProps = {
    id: unsafeUnwrap(ProductId.create(snapshot.id)),
    // ... other props from snapshot
  };

  this.entity = ProductEntity.reconstitute(entityProps);
}
```

## Integration Benefits

### 1. Clean Separation of Concerns

- **Entity**: Handles data integrity and basic business rules
- **Aggregate**: Handles complex workflows and event sourcing
- **Value Objects**: Handle domain concepts and validation

### 2. Improved Maintainability

- Entity logic is tested independently
- Aggregate focuses on event handling
- Clear boundaries between layers

### 3. Enhanced Type Safety

- Entity validates all operations
- Aggregate benefits from entity's type guarantees
- Immutable operations prevent unexpected mutations

### 4. Better Developer Experience

```typescript
// Clear, predictable API
const aggregate = ProductAggregate.create(...);
const result = aggregate.changePrice(newPrice, metadata);

if (result.ok === false) {
  // Handle business rule violation
  console.error(result.error);
}

// Access entity state through aggregate
console.log(aggregate.name.getValue());
console.log(aggregate.isActive());
```

## Usage Examples

### Creating Products

```typescript
// Via factory method with full validation
const result = ProductAggregate.create(
  ProductId.generate(),
  ProductName.create('Laptop'),
  Sku.create('LAP-001'),
  Price.create(999.99, 'USD'),
  Category.create('electronics', 'Electronics'),
  metadata,
  'High-performance laptop',
);

if (result.ok) {
  const aggregate = result.value;
  // Save aggregate...
}
```

### Updating Products

```typescript
// Entity handles validation, aggregate handles events
const priceResult = aggregate.changePrice(
  Price.create(899.99, 'USD'),
  metadata,
);

if (priceResult.ok) {
  // Event was applied, aggregate state updated
  const events = aggregate.getUncommittedEvents();
  // Persist events...
}
```

### Querying State

```typescript
// Delegate to entity for state queries
if (aggregate.isActive()) {
  console.log(`Product ${aggregate.name.getValue()} is available`);
}

// Access entity directly if needed
const entity = aggregate.getEntity();
const snapshot = entity.toSnapshot();
```

## Conclusion

The entity-aggregate integration provides:

- ✅ **Clean Architecture**: Clear separation between entity and aggregate responsibilities
- ✅ **Type Safety**: Full compile-time and runtime validation through entity layer
- ✅ **Immutability**: No accidental state mutations, safe concurrent access
- ✅ **Testability**: Independent testing of entity behavior and aggregate workflows
- ✅ **Maintainability**: Single responsibility principle applied consistently
- ✅ **Event Sourcing**: Proper event handling with entity state synchronization

This architecture scales well as domain complexity grows and provides excellent developer experience with predictable, type-safe operations.
