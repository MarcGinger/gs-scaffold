// Value Objects
export { ProductId } from './value-objects/product-id.vo';
export { ProductName } from './value-objects/product-name.vo';
export { Price } from './value-objects/price.vo';
export { Sku } from './value-objects/sku.vo';
export { Category } from './value-objects/category.vo';
export { ProductStatus } from './value-objects/product-status.vo';

// Domain Types
export {
  ProductStatusType,
  PRODUCT_STATUS_TRANSITIONS,
} from './types/product-status.types';
export {
  ChangeProductPriceProps,
  isChangeProductPriceProps,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from './props/change-product-price.props.';

// Entities
export {
  EntityBase,
  ProductEntity,
  ProductEntityProps,
  ProductEntitySnapshot,
} from './entities';

// Aggregates
export { ProductAggregate } from './product.aggregate';

// Events
export * from './events/product.events';
export * from './events/catalog-domain.events';

// Errors
export { ProductErrors, ProductErrorCode } from './errors/product.errors';
