/**
 * Validation decorators for catalog context domain objects
 *
 * This module exports custom validation decorators that combine
 * API documentation (@nestjs/swagger) with validation rules (class-validator)
 * following the decorator-per-object pattern.
 */

// Product-related decorators
export { ApiProductId } from './product-id.decorator';
export { ApiProductName } from './product-name.decorator';
export { ApiProductSKU } from './product-sku.decorator';
export { ApiProductPrice } from './product-price.decorator';
export { ApiProductCurrency } from './product-currency.decorator';
export { ApiProductCategory } from './product-category.decorator';
export { ApiProductStatus } from './product-status.decorator';
export { ApiProductDescription } from './product-description.decorator';

// Common decorators for timestamps
export { ApiCreatedAt } from './created-at.decorator';
export { ApiUpdatedAt } from './updated-at.decorator';
