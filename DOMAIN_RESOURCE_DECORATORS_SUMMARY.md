# Domain-Specific Resource Decorators Implementation Summary

## Overview

Successfully separated domain-specific resource decorators from shared infrastructure, maintaining clean architecture principles and proper separation of concerns.

## Changes Made

### 1. Shared Infrastructure Cleanup

- **File**: `src/shared/security/opa/resource.decorator.ts`
- **Action**: Removed domain-specific decorators (`ProductResource`, `OrderResource`, `UserResource`)
- **Kept**: Core `Resource` decorator and `ResourceOptions` interface with enhanced async support
- **Enhancement**: Added support for async extractors (`extractId` and `extractAttributes` can return Promises)

### 2. User Module Resource Decorators

- **File**: `src/user/user.resource.ts`
- **Components**:
  - `UserResource(action: string)` - Standard user operations
  - `UserProfileResource(action: string)` - Profile-specific operations
- **Features**:
  - Proper TypeScript typing with Express Request interface
  - Safe extraction of user attributes (department, role, status, manager)
  - Profile-specific attributes (profileType, visibility)

### 3. Order Module Resource Decorators

- **File**: `src/order/order.resource.ts`
- **Components**:
  - `OrderResource(action: string)` - Standard order operations
  - `OrderFulfillmentResource(action: string)` - Fulfillment-specific operations
- **Features**:
  - Order-specific attributes (customerId, status, amount, priority, region)
  - Fulfillment attributes (warehouseId, shippingMethod, carrier)

### 4. Product Module Resource Decorators

- **File**: `src/product/product.resource.ts`
- **Components**:
  - `ProductResource(action: string)` - Standard product operations
  - `ProductCatalogResource(action: string)` - Catalog-specific operations
- **Features**:
  - Product attributes (category, brand, price, status, vendorId)
  - Catalog attributes (visibility, region, targetAudience)

### 5. Controller Updates

- **User Controller**: Updated to use `@UserResource('action')` and `@UserProfileResource('action')`
- **Order Controller**: Updated to use `@OrderResource('action')`
- **Auth Test Controller**: Fixed imports to reference domain-specific decorators from their respective modules

## Architecture Benefits

### 1. Clean Separation of Concerns

- Shared infrastructure contains only reusable components
- Domain-specific logic stays within domain modules
- No circular dependencies between domains

### 2. Type Safety

- Proper Express Request typing
- Safe extraction of request attributes
- Union types for optional values

### 3. Maintainability

- Each domain manages its own resource decorators
- Easy to extend domain-specific functionality
- Clear ownership and responsibility

### 4. Reusability

- Core `Resource` decorator can be used across all domains
- Domain decorators provide consistent patterns
- Enhanced async support for future extensibility

## Usage Examples

### User Operations

```typescript
@Get(':id')
@UseGuards(SafeJwtAuthGuard)
@UserResource('read')
findUser(@Param('id') id: string) {
  // Authorization handled by decorator
  return this.userService.findUser(id);
}
```

### Order Operations

```typescript
@Post()
@OrderResource('create')
createOrder(@Body() orderData: CreateOrderDto) {
  // Authorization with order-specific attributes
  return this.orderService.processOrder(orderData);
}
```

### Product Operations

```typescript
@Get(':id')
@ProductResource('read')
getProduct(@Param('id') id: string) {
  // Product-specific authorization
  return this.productService.getProduct(id);
}
```

## Technical Details

### Enhanced Resource Options

```typescript
interface ResourceOptions {
  type: string;
  action: string;
  extractId?: (req: Request) => string | Promise<string>;
  extractAttributes?: (
    req: Request,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}
```

### Async Support

- Both `extractId` and `extractAttributes` can return Promises
- Enables database lookups or API calls for attribute extraction
- Maintains backward compatibility with synchronous extractors

## Build Status

✅ **All builds successful**
✅ **TypeScript compilation clean**
✅ **Import dependencies resolved**

## Next Steps

1. Add middleware for correlation ID injection (as noted in guard comments)
2. Document authorization patterns for team adoption
3. Consider adding validation decorators for request attributes
4. Implement integration tests for domain-specific authorization flows

## Files Modified

- `src/shared/security/opa/resource.decorator.ts` - Cleaned up, kept core infrastructure
- `src/user/user.resource.ts` - New domain-specific decorators
- `src/order/order.resource.ts` - New domain-specific decorators
- `src/product/product.resource.ts` - New domain-specific decorators
- `src/user/user.controller.ts` - Applied user resource decorators
- `src/order/order.controller.ts` - Applied order resource decorators
- `src/auth-test/auth-test.controller.ts` - Fixed imports to use domain modules

This implementation provides a clean, maintainable, and scalable authorization decorator system with proper separation of concerns between shared infrastructure and domain-specific functionality.
