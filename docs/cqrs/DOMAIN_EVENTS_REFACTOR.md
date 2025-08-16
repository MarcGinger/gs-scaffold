# Domain Events Refactor: One Event Per File

## Overview

Successfully refactored the domain events from a single monolithic file to individual event files following the **"one event per file"** pattern for better organization, maintainability, and discoverability.

## New File Structure

```
src/contexts/catalog/domain/events/
├── event-types.ts                  # Shared event interfaces
├── product-created.event.ts        # Product creation event
├── product-updated.event.ts        # Product update event
├── product-price-changed.event.ts  # Price change event
├── product-categorized.event.ts    # Category change event
├── product-activated.event.ts      # Product activation event
├── product-deactivated.event.ts    # Product deactivation event
├── product-deleted.event.ts        # Product deletion event
├── index.ts                        # Barrel exports
└── product.events.ts              # Legacy compatibility file
```

## Benefits Achieved

### 1. **Single Responsibility Principle**
- ✅ Each file contains exactly one event
- ✅ Easy to locate specific event logic
- ✅ Reduced cognitive load when working with events

### 2. **Better Organization**
- ✅ Shared types in dedicated `event-types.ts`
- ✅ Consistent naming convention: `[entity]-[action].event.ts`
- ✅ Clean barrel exports for easy importing

### 3. **Maintainability**
- ✅ Changes to one event don't affect others
- ✅ Easier code reviews and testing
- ✅ Better version control history

### 4. **Discoverability**
- ✅ Event files are immediately visible in file explorer
- ✅ Clear naming makes purpose obvious
- ✅ Better IDE navigation and search

## Event Structure Pattern

Each event file follows a consistent pattern:

```typescript
// Import shared types
import { EventMetadata } from './event-types';

// Event payload interface
export interface [Event]EventPayload {
  // Event-specific data
  // Common fields: version, timestamp, metadata
}

// Event class with documentation
export class [Event]Event {
  public readonly eventType = '[EventName]';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: [Event]EventPayload) {}

  // Getter methods for payload access
  get [field](): [Type] {
    return this.payload.[field];
  }
}
```

## Shared Types Architecture

### `event-types.ts`
Contains interfaces used across multiple events:

```typescript
/**
 * Base event metadata interface
 * Contains contextual information for all domain events
 */
export interface EventMetadata {
  correlationId: string;
  userId: string;
  tenantId: string;
  timestamp?: Date;
}

/**
 * Product change tracking interface
 * Used to track field-level changes in product updates
 */
export interface ProductChangeSet {
  name?: { old: string; new: string };
  description?: { old?: string; new?: string };
}
```

## Individual Event Files

### 1. **Product Created Event**
```typescript
// product-created.event.ts
export interface ProductCreatedEventPayload {
  productId: string;
  name: string;
  sku: string;
  price: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  status: string;
  description?: string;
  createdAt: Date;
  version: number;
  metadata: EventMetadata;
}
```

### 2. **Product Price Changed Event**
```typescript
// product-price-changed.event.ts
export interface ProductPriceChangedEventPayload {
  productId: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
  version: number;
  changedAt: Date;
  metadata: EventMetadata;
}
```

### 3. **Product Status Events**
- `product-activated.event.ts` - Product becomes available
- `product-deactivated.event.ts` - Product temporarily unavailable
- `product-deleted.event.ts` - Product soft delete

### 4. **Product Change Events**
- `product-updated.event.ts` - General product updates
- `product-categorized.event.ts` - Category changes

## Import Patterns

### Individual Event Import
```typescript
// Import specific event
import { ProductCreatedEvent } from './domain/events/product-created.event';

// Use in handler
@EventsHandler(ProductCreatedEvent)
export class ProductCreatedEventHandler { /* ... */ }
```

### Barrel Import (Multiple Events)
```typescript
// Import multiple events from barrel
import {
  ProductCreatedEvent,
  ProductPriceChangedEvent,
  ProductActivatedEvent,
} from './domain/events';

// Or import all
import * as ProductEvents from './domain/events';
```

### Legacy Compatibility Import
```typescript
// Still works for backward compatibility
import { ProductCreatedEvent } from './domain/events/product.events';
```

## Backward Compatibility

The refactor maintains 100% backward compatibility:

1. **Legacy File**: `product.events.ts` re-exports all events
2. **Barrel Exports**: `index.ts` provides clean imports
3. **Same API**: All event interfaces and classes unchanged
4. **Same Imports**: Existing imports continue to work

## File Organization Benefits

### Before: Monolithic File
```
product.events.ts (316 lines)
├── EventMetadata interface
├── ProductCreatedEvent + Payload (60 lines)
├── ProductUpdatedEvent + Payload (40 lines)
├── ProductPriceChangedEvent + Payload (45 lines)
├── ProductCategorizedEvent + Payload (45 lines)
├── ProductActivatedEvent + Payload (35 lines)
├── ProductDeactivatedEvent + Payload (35 lines)
├── ProductDeletedEvent + Payload (35 lines)
└── ProductEvents collection
```

### After: Focused Files
```
event-types.ts (20 lines) - Shared interfaces
product-created.event.ts (82 lines) - Creation logic
product-updated.event.ts (42 lines) - Update logic
product-price-changed.event.ts (50 lines) - Price logic
product-categorized.event.ts (48 lines) - Category logic
product-activated.event.ts (38 lines) - Activation logic
product-deactivated.event.ts (38 lines) - Deactivation logic
product-deleted.event.ts (36 lines) - Deletion logic
index.ts (66 lines) - Barrel exports
product.events.ts (12 lines) - Legacy compatibility
```

## Development Workflow Improvements

### 1. **Event Development**
```bash
# Before: Find event in 316-line file
# After: Open dedicated event file
code product-price-changed.event.ts
```

### 2. **Testing**
```bash
# Before: Test file with multiple events
# After: Test specific event
jest product-created.event.spec.ts
```

### 3. **Code Reviews**
```bash
# Before: Review changes mixed with other events
# After: Review focused changes to specific event
git diff product-activated.event.ts
```

## Implementation Quality

### Architecture Compliance
- ✅ **Single Responsibility**: One event per file
- ✅ **Domain-Driven Design**: Events represent business concepts
- ✅ **Clean Architecture**: Proper separation of concerns
- ✅ **Consistency**: All events follow same pattern

### Code Quality
- ✅ **Maintainability**: Easy to modify individual events
- ✅ **Readability**: Clear file names and structure
- ✅ **Testability**: Focused unit tests per event
- ✅ **Documentation**: Each event well documented

### Organization Benefits
- ✅ **Discoverability**: Events easy to find
- ✅ **Navigation**: Better IDE experience
- ✅ **Scalability**: Easy to add new events
- ✅ **Team Productivity**: Reduced merge conflicts

## Future Event Additions

Adding new events is now straightforward:

1. **Create Event File**: `product-[action].event.ts`
2. **Follow Pattern**: Payload interface + Event class
3. **Add to Barrel**: Export from `index.ts`
4. **Optional**: Add to legacy file for compatibility

Example new event:
```typescript
// product-restored.event.ts
import { EventMetadata } from './event-types';

export interface ProductRestoredEventPayload {
  productId: string;
  restoredAt: Date;
  version: number;
  metadata: EventMetadata;
}

export class ProductRestoredEvent {
  public readonly eventType = 'ProductRestored';
  public readonly eventVersion = '1.0';
  
  constructor(public readonly payload: ProductRestoredEventPayload) {}
  
  // Getters...
}
```

## Conclusion

The **"one event per file"** refactor successfully:

- ✅ **Improved Organization**: Events are now logically separated and easy to find
- ✅ **Enhanced Maintainability**: Changes to events are isolated and focused
- ✅ **Better Developer Experience**: Faster navigation and cleaner code reviews
- ✅ **Maintained Compatibility**: Existing code continues to work unchanged
- ✅ **Followed Patterns**: Consistent with DTO and decorator organization

This refactor demonstrates enterprise-grade code organization that scales well with team size and domain complexity while maintaining the quality standards established throughout the codebase.
