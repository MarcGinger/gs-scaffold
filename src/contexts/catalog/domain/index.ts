// Value Objects
export { ProductId } from './value-objects/product-id.vo';
export { ProductName } from './value-objects/product-name.vo';
export { Price } from './value-objects/price.vo';
export { Sku } from './value-objects/sku.vo';
export { Category } from './value-objects/category.vo';
export {
  ProductStatus,
  ProductStatusType,
} from './value-objects/product-status.vo';

// Aggregates
export { ProductAggregate, ProductProps } from './product.aggregate';

// Events
export * from './events/product.events';
export * from './events/catalog-domain.events';

// Errors
export { ProductErrors, ProductErrorCode } from './errors/product.errors';
