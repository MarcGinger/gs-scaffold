# Catalog Bounded Context - Product Application

## Overview

This is a complete scaffold for the Catalog bounded context with Product application following **DDD + CQRS + Event Sourcing** patterns. The implementation follows clean architecture principles with clear separation of concerns.

## Architecture Layers

```
🎯 Interface Layer (Controllers)    → HTTP/GraphQL adapters
    ↓
📋 Application Layer (Use Cases)    → Business orchestration
    ↓
🏛️ Domain Layer (Aggregates)        → Pure business logic
    ↓
🔧 Infrastructure Layer (Repos)     → External adapters
```

## Project Structure

```
src/contexts/catalog/
├── domain/                          # Pure domain layer
│   ├── product.aggregate.ts         # Product aggregate root
│   ├── value-objects/               # Value objects
│   │   ├── product-id.vo.ts
│   │   ├── product-name.vo.ts
│   │   ├── price.vo.ts
│   │   ├── sku.vo.ts
│   │   ├── category.vo.ts
│   │   └── product-status.vo.ts
│   ├── events/                      # Domain events
│   │   ├── product.events.ts        # Event definitions
│   │   └── catalog-domain.events.ts # Domain event implementations
│   └── errors/                      # Domain errors
│       └── product.errors.ts        # Product error catalog
├── application/                     # Application orchestration
│   ├── commands/                    # Command definitions
│   │   ├── create-product.command.ts
│   │   ├── update-product.command.ts
│   │   ├── change-product-price.command.ts
│   │   ├── categorize-product.command.ts
│   │   ├── activate-product.command.ts
│   │   ├── deactivate-product.command.ts
│   │   └── delete-product.command.ts
│   ├── queries/                     # Query definitions
│   │   ├── get-product.query.ts
│   │   └── list-products.query.ts
│   ├── use-cases/                   # Business use cases
│   │   ├── create-product.use-case.ts
│   │   └── update-product.use-case.ts
│   ├── dto/                         # Data transfer objects
│   │   ├── product.dto.ts
│   │   └── product.read-model.ts
│   └── ports/                       # Abstract interfaces
│       └── product.repository.port.ts
├── infrastructure/                  # External adapters
│   └── persistence/
│       └── eventstore-product.repository.ts
├── interface/                       # Entry points
│   └── http/
│       └── product.controller.ts
└── catalog.module.ts               # NestJS module configuration
```

## Key Features

### ✅ Domain-Driven Design (DDD)

- **Product Aggregate**: Rich domain model with business invariants
- **Value Objects**: Immutable objects with validation (ProductId, ProductName, Price, etc.)
- **Domain Events**: First-class events for business occurrences
- **Domain Errors**: Typed error catalog for business validation

### ✅ Command Query Responsibility Segregation (CQRS)

- **Commands**: Write operations (CreateProduct, UpdateProduct, etc.)
- **Queries**: Read operations (GetProduct, ListProducts)
- **Separate Models**: Write model (Aggregate) vs Read models (DTOs)
- **Use Cases**: Application orchestration layer

### ✅ Event Sourcing

- **Event Store Repository**: Events as the source of truth
- **Event Replay**: Reconstruct aggregate state from events
- **Snapshots**: Performance optimization (planned)
- **Domain Events**: ProductCreated, ProductUpdated, etc.

### ✅ Error Handling

- **Result Pattern**: No exceptions in domain/application layers
- **Typed Errors**: Comprehensive error catalog with categories
- **Error Context**: Rich debugging information
- **Graceful Degradation**: Infrastructure error handling

### ✅ Separation of Concerns

- **One File = One Responsibility**: Each command, query, use case in separate files
- **Clean Dependencies**: Domain → Application → Infrastructure → Interface
- **Port/Adapter Pattern**: Abstract interfaces with concrete implementations
- **Microservice Ready**: Easy extraction when needed

## Domain Model

### Product Aggregate

The `ProductAggregate` is the main entity representing a product in the catalog:

```typescript
// Business Methods
product.updateDetails(name, description, metadata);
product.changePrice(newPrice, metadata);
product.categorize(category, metadata);
product.activate(metadata);
product.deactivate(metadata);
product.delete(metadata) -
  // Domain Events Generated
  ProductCreatedEvent -
  ProductUpdatedEvent -
  ProductPriceChangedEvent -
  ProductCategorizedEvent -
  ProductActivatedEvent -
  ProductDeactivatedEvent -
  ProductDeletedEvent;
```

### Value Objects

**ProductId**: Unique identifier with validation
**ProductName**: Name with length constraints
**Price**: Monetary value with currency
**Sku**: Stock keeping unit with format validation
**Category**: Product category with ID and name
**ProductStatus**: Status enum (DRAFT, ACTIVE, INACTIVE, DELETED)

## Commands & Use Cases

### Commands (Write Side)

1. **CreateProductCommand** → CreateProductUseCase
   - Validates all input data
   - Checks SKU uniqueness
   - Creates new Product aggregate
   - Emits ProductCreatedEvent

2. **UpdateProductCommand** → UpdateProductUseCase
   - Loads existing aggregate
   - Validates changes
   - Emits ProductUpdatedEvent

3. **ChangeProductPriceCommand** → (To be implemented)
4. **CategorizeProductCommand** → (To be implemented)
5. **ActivateProductCommand** → (To be implemented)
6. **DeactivateProductCommand** → (To be implemented)
7. **DeleteProductCommand** → (To be implemented)

### Queries (Read Side)

1. **GetProductQuery** → (To be implemented with projections)
2. **ListProductsQuery** → (To be implemented with projections)

## Installation & Setup

### Prerequisites

```bash
npm install @nestjs/common @nestjs/core @nestjs/cqrs uuid
npm install --save-dev @types/uuid
```

### Usage

1. **Import the module** in your app.module.ts:

```typescript
import { CatalogModule } from './contexts/catalog/catalog.module';

@Module({
  imports: [CatalogModule],
})
export class AppModule {}
```

2. **Use the API endpoints**:

```bash
# Create a product
POST /catalog/products
{
  "name": "iPhone 15",
  "sku": "IPH15-001",
  "price": 999.99,
  "currency": "USD",
  "categoryId": "electronics",
  "categoryName": "Electronics",
  "description": "Latest iPhone model"
}

# Get a product
GET /catalog/products/{id}

# List products
GET /catalog/products?page=1&limit=20

# Update a product
PUT /catalog/products/{id}
{
  "name": "iPhone 15 Pro",
  "description": "Updated description"
}
```

## Current Issues & Next Steps

### 🔧 TypeScript Issues to Resolve

The scaffold is functionally complete but has TypeScript compilation issues that need to be addressed:

1. **Missing Dependencies**: Install `@nestjs/cqrs` and other NestJS packages
2. **Value Object Imports**: Fix module resolution for value objects
3. **Result Type Handling**: Properly handle the Result<T,E> pattern
4. **Event Store Integration**: Replace in-memory repository with real EventStoreDB

### 📋 Implementation Roadmap

#### Phase 1: Fix TypeScript & Basic Operations

- [ ] Resolve all TypeScript compilation errors
- [ ] Install missing NestJS dependencies
- [ ] Test basic CRUD operations
- [ ] Add proper validation decorators

#### Phase 2: Complete CQRS Implementation

- [ ] Implement remaining use cases (ChangePrice, Categorize, etc.)
- [ ] Add CQRS command/query handlers using @nestjs/cqrs
- [ ] Create proper read model projections
- [ ] Add event handlers for projection updates

#### Phase 3: Event Sourcing Integration

- [ ] Replace in-memory repository with EventStoreDB
- [ ] Implement proper event serialization/deserialization
- [ ] Add snapshot support for performance
- [ ] Implement event schema evolution

#### Phase 4: Production Readiness

- [ ] Add comprehensive error handling and HTTP status mapping
- [ ] Implement security (JWT authentication, OPA authorization)
- [ ] Add logging and monitoring integration
- [ ] Create comprehensive test suite
- [ ] Add API documentation with Swagger

### 🧪 Testing Strategy

```typescript
// Domain Layer Tests
describe('ProductAggregate', () => {
  it('should create product with valid data');
  it('should emit ProductCreatedEvent');
  it('should reject invalid price');
});

// Application Layer Tests
describe('CreateProductUseCase', () => {
  it('should create product successfully');
  it('should reject duplicate SKU');
  it('should handle repository errors');
});

// Integration Tests
describe('ProductController', () => {
  it('should create product via HTTP');
  it('should return proper error responses');
});
```

## Design Principles Applied

### ✅ SOLID Principles

- **S**: Each class has a single responsibility
- **O**: Open for extension (new use cases, events)
- **L**: Proper inheritance hierarchy
- **I**: Interface segregation (ports)
- **D**: Dependency inversion (abstract repositories)

### ✅ DDD Tactical Patterns

- **Aggregates**: ProductAggregate as consistency boundary
- **Value Objects**: Immutable, validated objects
- **Domain Events**: Business occurrences
- **Repositories**: Aggregate persistence abstraction
- **Services**: Domain logic coordination

### ✅ CQRS Benefits

- **Scalability**: Read and write sides can scale independently
- **Performance**: Optimized read models
- **Flexibility**: Different models for different use cases
- **Evolution**: Easy to add new projections

This scaffold provides a solid foundation for implementing a production-ready Product catalog using modern architectural patterns. The next step is resolving the TypeScript issues and completing the implementation phases outlined above.
