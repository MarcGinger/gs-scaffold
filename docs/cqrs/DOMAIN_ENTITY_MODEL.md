# Domain Entity Model Implementation

## Overview

The Catalog Domain now implements a proper **Entity Model** following Domain-Driven Design principles. This separates **Entities** (identity + data + basic operations) from **Aggregates** (complex business rules + event handling).

## Architecture: Entity vs Aggregate

### Traditional Pattern (Before)

```
ProductAggregate
├── Identity (ProductId)
├── Data (name, price, etc.)
├── Basic Operations (changePrice, etc.)
├── Complex Business Rules
├── Event Handling
└── Persistence Logic
```

### DDD Pattern (After)

```
ProductEntity                    ProductAggregate
├── Identity (ProductId)         ├── Contains ProductEntity
├── Data (name, price, etc.)     ├── Complex Business Rules
├── Basic Operations             ├── Event Sourcing
└── Validation                   ├── Domain Event Publishing
                                 └── Cross-Entity Operations
```

## Domain Entity Implementation

### 1. Entity Base Class

**File:** `domain/entities/entity.base.ts`

```typescript
export abstract class EntityBase<TProps, TId = string> {
  protected readonly _props: TProps;
  protected readonly _id: TId;

  constructor(props: TProps, id: TId) {
    this._props = props;
    this._id = id;
  }

  protected get props(): TProps {
    return this._props;
  }

  public equals(entity: EntityBase<any, TId>): boolean {
    if (!entity || !(entity instanceof EntityBase)) {
      return false;
    }

    if (this === entity) {
      return true;
    }

    return (this._id as any)?.equals
      ? (this._id as any).equals(entity._id)
      : this._id === entity._id;
  }
}
```

**Key Features:**

- ✅ **Generic Design**: Reusable across all domain entities
- ✅ **Identity Protection**: Private access to ID and props
- ✅ **Equality Logic**: Identity-based comparison (DDD principle)
- ✅ **Type Safety**: Generic constraints for props and ID types

### 2. Product Entity

**File:** `domain/entities/product.entity.ts`

```typescript
export interface ProductEntityProps {
  id: ProductId;
  name: ProductName;
  sku: Sku;
  price: Price;
  category: Category;
  status: ProductStatus;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ProductEntity extends EntityBase<ProductEntityProps, ProductId> {
  // Factory Methods
  public static create(
    props: ProductEntityProps,
  ): Result<ProductEntity, DomainError>;
  public static reconstitute(props: ProductEntityProps): ProductEntity;

  // Getters (Read-only access)
  public get id(): ProductId;
  public get name(): ProductName;
  public get price(): Price;
  // ... other getters

  // Business Operations (Return new instances)
  public updateName(newName: ProductName): Result<ProductEntity, DomainError>;
  public changePrice(newPrice: Price): Result<ProductEntity, DomainError>;
  public activate(): Result<ProductEntity, DomainError>;
  public deactivate(): Result<ProductEntity, DomainError>;
  public delete(): Result<ProductEntity, DomainError>;

  // Query Methods
  public isActive(): boolean;
  public isDeleted(): boolean;
  public sameAs(other: ProductEntity): boolean;

  // Serialization
  public toSnapshot(): ProductEntitySnapshot;
}
```

## Entity Design Principles

### 1. Immutability Pattern

Entities return **new instances** rather than mutating state:

```typescript
// ✅ Immutable approach
public changePrice(newPrice: Price): Result<ProductEntity, DomainError> {
  // Validation
  if (this.props.status.isDeleted()) {
    return err(ProductErrors.PRODUCT_DELETED);
  }

  // Create new props
  const updatedProps: ProductEntityProps = {
    ...this.props,
    price: newPrice,
    updatedAt: new Date(),
  };

  // Return new entity instance
  return ProductEntity.create(updatedProps);
}

// ❌ Mutable approach (avoided)
public changePriceMutable(newPrice: Price): void {
  this.props.price = newPrice; // Breaks immutability
}
```

### 2. Factory Pattern

Safe creation with validation:

```typescript
// ✅ Factory with validation
public static create(props: ProductEntityProps): Result<ProductEntity, DomainError> {
  const validationResult = ProductEntity.validate(props);
  if (validationResult.ok === false) {
    return err(validationResult.error);
  }
  return ok(new ProductEntity(props));
}

// ✅ Reconstitution without validation (from persistence)
public static reconstitute(props: ProductEntityProps): ProductEntity {
  return new ProductEntity(props);
}
```

### 3. Business Rule Enforcement

Entities validate operations at the entity level:

```typescript
public activate(): Result<ProductEntity, DomainError> {
  // Cannot activate deleted products
  if (this.props.status.isDeleted()) {
    return err(ProductErrors.PRODUCT_DELETED);
  }

  // Cannot activate already active products
  if (this.props.status.isActive()) {
    return err(ProductErrors.PRODUCT_ALREADY_ACTIVE);
  }

  // Check valid state transitions
  const activeStatus = ProductStatus.active();
  if (!this.props.status.canTransitionTo(activeStatus)) {
    return err(ProductErrors.INVALID_STATUS_TRANSITION);
  }

  // Create updated entity
  const updatedProps = { ...this.props, status: activeStatus, updatedAt: new Date() };
  return ProductEntity.create(updatedProps);
}
```

## Entity vs Value Object Distinction

### Entities (Have Identity)

- **ProductEntity**: Unique product with lifecycle
- **OrderEntity**: Unique order with tracking
- **CustomerEntity**: Unique customer with history

### Value Objects (No Identity)

- **ProductId**: Just an identifier value
- **Price**: Money concept (value + currency)
- **ProductName**: Text with validation rules

### Comparison Example

```typescript
// ✅ Entities - Identity matters
const product1 = ProductEntity.create(props);
const product2 = ProductEntity.reconstitute(props);
product1.sameAs(product2); // true - same ID

// ✅ Value Objects - Structure matters
const price1 = Price.create(100, 'USD');
const price2 = Price.create(100, 'USD');
price1.equals(price2); // true - same value and currency
```

## Integration with Aggregates

The Entity provides the **state container** while Aggregates handle **complex business rules**:

```typescript
export class ProductAggregate extends AggregateRootBase {
  private entity: ProductEntity;

  constructor(entity: ProductEntity) {
    super();
    this.entity = entity;
  }

  // Simple operations delegate to entity
  public changePrice(
    newPrice: Price,
    metadata: EventMetadata,
  ): Result<void, DomainError> {
    const result = this.entity.changePrice(newPrice);
    if (result.ok === false) {
      return err(result.error);
    }

    // Complex logic: publish events, handle side effects
    const event = new ProductPriceChangedEvent(
      this.entity.id.getValue(),
      this.version + 1,
      metadata,
      {
        /* event payload */
      },
    );

    this.apply(event);
    this.entity = result.value; // Update internal entity
    return ok(undefined);
  }
}
```

## Serialization & Persistence

### Entity Snapshot Pattern

```typescript
export interface ProductEntitySnapshot {
  id: string;
  name: string;
  sku: string;
  price: number;
  currency: string;
  categoryName: string;
  categoryId: string;
  status: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Entity → Snapshot (for saving)
const snapshot = entity.toSnapshot();

// Snapshot → Entity (for loading)
const entity = ProductEntity.reconstitute({
  id: ProductId.create(snapshot.id),
  name: ProductName.create(snapshot.name),
  // ... other value object reconstructions
});
```

## Benefits Achieved

### 1. Separation of Concerns

- **Entities**: Identity, basic operations, validation
- **Aggregates**: Complex business rules, events, consistency
- **Value Objects**: Immutable values with validation

### 2. Testability

```typescript
// Easy unit testing of entities
describe('ProductEntity', () => {
  it('should prevent price changes on deleted products', () => {
    const deletedProduct = ProductEntity.create(deletedProps);
    const result = deletedProduct.changePrice(newPrice);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(ProductErrors.PRODUCT_DELETED);
  });
});
```

### 3. Type Safety

- **Compile-time**: Generic constraints enforce proper typing
- **Runtime**: Factory validation prevents invalid states
- **IDE Support**: Full autocomplete and refactoring support

### 4. Maintainability

- **Single Responsibility**: Each entity handles its own concerns
- **Immutability**: No unexpected state mutations
- **Clear API**: Obvious methods for common operations

## File Organization

```
domain/
├── entities/
│   ├── entity.base.ts           # Base class for all entities
│   ├── product.entity.ts        # Product entity implementation
│   └── index.ts                 # Entity exports
├── value-objects/               # Immutable value types
├── aggregates/                  # Complex business logic
├── types/                       # Domain type definitions
├── props/                       # Property interfaces
├── events/                      # Domain events
└── errors/                      # Domain errors
```

## Usage Examples

### Creating New Products

```typescript
// Via Entity
const entityResult = ProductEntity.create({
  id: ProductId.generate(),
  name: ProductName.create('Laptop'),
  // ... other props
});

// Via Aggregate (recommended for complex operations)
const aggregateResult = ProductAggregate.create(
  {
    name: 'Laptop',
    price: 999.99,
    // ... other data
  },
  metadata,
);
```

### Querying Product State

```typescript
const product = // ... loaded from repository

if (product.isActive()) {
  console.log(`Product ${product.name.getValue()} is available`);
}

if (product.isDeleted()) {
  throw new Error('Cannot operate on deleted product');
}
```

### Updating Products

```typescript
// Entity level (basic validation)
const updatedEntity = product.changePrice(newPrice);

// Aggregate level (events + complex rules)
const result = productAggregate.changePrice(newPrice, metadata);
```

## Conclusion

The Entity Model provides a solid foundation for the domain layer:

- ✅ **Clear Boundaries**: Entities vs Aggregates vs Value Objects
- ✅ **Immutable Design**: Safe concurrent operations
- ✅ **Business Validation**: Rules enforced at entity level
- ✅ **Type Safety**: Compile-time and runtime guarantees
- ✅ **Testability**: Easy unit testing of business logic
- ✅ **Maintainability**: Single responsibility and clear APIs

This architecture scales well as the domain grows and provides excellent developer experience.
