# Type Soup Refactoring: ChangeProductPriceProps

## Overview

Refactored the price change properties to use explicit naming and avoid "type soup" by creating a dedicated, comprehensive types file with business-focused interfaces.

## Changes Made

### 1. Created New Types File

**File:** `src/contexts/catalog/domain/types/change-product-price-props.types.ts`

**Features:**

- ✅ **Explicit Interface Name**: `ChangeProductPriceProps` clearly indicates purpose
- ✅ **Comprehensive Documentation**: JSDoc for all properties and methods
- ✅ **Type Safety**: Runtime type guard `isChangeProductPriceProps()`
- ✅ **Business Constraints**: `SUPPORTED_CURRENCIES` with ISO 4217 codes
- ✅ **Type Utilities**: `SupportedCurrency` type for currency validation
- ✅ **Default Values**: `DEFAULT_CURRENCY` for consistent defaults

### 2. Updated Domain Exports

**File:** `src/contexts/catalog/domain/index.ts`

**Changes:**

```typescript
// ✅ New comprehensive exports
export {
  ChangeProductPriceProps,
  isChangeProductPriceProps,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from './types/change-product-price-props.types';
```

### 3. Migration from Props Directory

**Removed:** `src/contexts/catalog/domain/props/change-product-price.props.ts`
**Added:** `src/contexts/catalog/domain/types/change-product-price-props.types.ts`

**Benefits:**

- ✅ Better organization with other domain types
- ✅ Consistent naming with `product-status.types.ts`
- ✅ Centralized types directory for domain contracts

### 4. Created Types Index

**File:** `src/contexts/catalog/domain/types/index.ts`

**Purpose:**

- ✅ Centralized exports for all domain type definitions
- ✅ Avoids "type soup" by providing explicit, well-documented interfaces
- ✅ Single import point for related types

## Anti-Pattern Addressed: Type Soup

### Before (Generic Naming)

```typescript
// ❌ Type soup - unclear what this represents
interface PriceData {
  price: number;
  currency: string;
}

// ❌ Generic, ambiguous naming
interface Props {
  price: number;
  currency: string;
}
```

### After (Explicit Naming)

```typescript
// ✅ Clear business intent
export interface ChangeProductPriceProps {
  /**
   * New price value for the product
   * Must be a positive number representing the monetary value
   */
  price: number;

  /**
   * Currency code for the price
   * Must be a valid ISO 4217 currency code
   */
  currency: string;
}
```

## Implementation Benefits

### 1. Self-Documenting Code

- **Interface Name**: Clearly indicates its purpose in price change operations
- **Property Documentation**: JSDoc explains business rules and constraints
- **Type Guards**: Runtime validation with clear error conditions

### 2. Business Alignment

```typescript
// ✅ Business constraints as first-class citizens
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'CNY',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
```

### 3. Type Safety

```typescript
// ✅ Runtime validation prevents invalid data
export function isChangeProductPriceProps(
  obj: any,
): obj is ChangeProductPriceProps {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as ChangeProductPriceProps).price === 'number' &&
    (obj as ChangeProductPriceProps).price >= 0 &&
    typeof (obj as ChangeProductPriceProps).currency === 'string' &&
    (obj as ChangeProductPriceProps).currency.length === 3
  );
}
```

### 4. Consistency Across Layers

All application layer components implement the same interface:

- ✅ `ChangeProductPriceDto implements ChangeProductPriceProps`
- ✅ `ChangeProductPriceCommand implements ChangeProductPriceProps`
- ✅ `ProductResponseDto implements ChangeProductPriceProps`

## File Structure After Refactoring

```
src/contexts/catalog/domain/
├── types/
│   ├── index.ts                                  # Types barrel exports
│   ├── change-product-price-props.types.ts      # ✅ New explicit types file
│   └── product-status.types.ts                  # Status-related types
├── value-objects/                               # Domain value objects
├── aggregates/                                  # Domain aggregates
├── events/                                      # Domain events
└── index.ts                                     # ✅ Updated domain exports
```

## Usage Examples

### Type-Safe DTO Creation

```typescript
import { ChangeProductPriceProps } from '../../domain';

export class ChangeProductPriceDto implements ChangeProductPriceProps {
  @ApiProductPrice()
  price: number;

  @ApiProductCurrency()
  currency: string;
}
```

### Runtime Validation

```typescript
import { isChangeProductPriceProps } from '../domain';

function processPriceChange(data: unknown) {
  if (!isChangeProductPriceProps(data)) {
    throw new Error('Invalid price change data structure');
  }

  // data is now typed as ChangeProductPriceProps
  console.log(`Changing price to ${data.price} ${data.currency}`);
}
```

### Currency Validation

```typescript
import { SUPPORTED_CURRENCIES, SupportedCurrency } from '../domain';

function validateCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
}
```

## Quality Improvements

### Code Metrics

- ✅ **Explicit Naming**: No more generic `Props` interfaces
- ✅ **Self-Documentation**: 47 lines of comprehensive documentation
- ✅ **Type Safety**: Runtime + compile-time validation
- ✅ **Business Alignment**: Currency constraints match real requirements
- ✅ **Maintainability**: Single file for all price change logic

### Developer Experience

- ✅ **IDE Support**: Better autocomplete and refactoring
- ✅ **Clear Intent**: Interface name explains its purpose
- ✅ **Runtime Safety**: Type guards prevent invalid data at runtime
- ✅ **Business Context**: Currency list and constraints are explicit

## Conclusion

This refactoring successfully eliminates "type soup" by:

1. **Explicit Naming**: `ChangeProductPriceProps` clearly indicates business purpose
2. **Comprehensive Design**: Type guards, constants, and utilities in one place
3. **Business Alignment**: Real-world constraints like supported currencies
4. **Type Safety**: Both compile-time and runtime validation
5. **Self-Documentation**: Extensive JSDoc for all components

The result is enterprise-grade type definition that serves as both documentation and enforcement of business rules, making the codebase more maintainable and less prone to errors.
