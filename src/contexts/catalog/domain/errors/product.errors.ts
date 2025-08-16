import { DomainError } from '../../../../shared/errors/error.types';

// Product domain errors catalog
export const ProductErrors = {
  // Product not found errors
  PRODUCT_NOT_FOUND: {
    code: 'PRODUCT.PRODUCT_NOT_FOUND',
    title: 'Product not found',
    category: 'domain',
    retryable: false,
  } as DomainError,

  // Product validation errors
  INVALID_PRICE: {
    code: 'PRODUCT.INVALID_PRICE',
    title: 'Invalid product price',
    detail: 'Product price must be a non-negative number',
    category: 'validation',
    retryable: false,
  } as DomainError,

  INVALID_PRODUCT_DATA: {
    code: 'PRODUCT.INVALID_PRODUCT_DATA',
    title: 'Invalid product data',
    category: 'validation',
    retryable: false,
  } as DomainError,

  // Product state errors
  PRODUCT_DELETED: {
    code: 'PRODUCT.PRODUCT_DELETED',
    title: 'Cannot modify deleted product',
    detail: 'Product has been deleted and cannot be modified',
    category: 'domain',
    retryable: false,
  } as DomainError,

  PRODUCT_ALREADY_ACTIVE: {
    code: 'PRODUCT.PRODUCT_ALREADY_ACTIVE',
    title: 'Product is already active',
    category: 'domain',
    retryable: false,
  } as DomainError,

  PRODUCT_ALREADY_INACTIVE: {
    code: 'PRODUCT.PRODUCT_ALREADY_INACTIVE',
    title: 'Product is already inactive',
    category: 'domain',
    retryable: false,
  } as DomainError,

  PRODUCT_ALREADY_DELETED: {
    code: 'PRODUCT.PRODUCT_ALREADY_DELETED',
    title: 'Product is already deleted',
    category: 'domain',
    retryable: false,
  } as DomainError,

  INVALID_STATUS_TRANSITION: {
    code: 'PRODUCT.INVALID_STATUS_TRANSITION',
    title: 'Invalid product status transition',
    category: 'domain',
    retryable: false,
  } as DomainError,

  // SKU related errors
  DUPLICATE_SKU: {
    code: 'PRODUCT.DUPLICATE_SKU',
    title: 'Product SKU already exists',
    detail: 'Another product with this SKU already exists',
    category: 'domain',
    retryable: false,
  } as DomainError,

  // Category related errors
  CATEGORY_NOT_FOUND: {
    code: 'PRODUCT.CATEGORY_NOT_FOUND',
    title: 'Product category not found',
    category: 'domain',
    retryable: false,
  } as DomainError,

  INVALID_CATEGORY: {
    code: 'PRODUCT.INVALID_CATEGORY',
    title: 'Invalid product category',
    category: 'validation',
    retryable: false,
  } as DomainError,

  // Infrastructure errors
  PRODUCT_PERSISTENCE_ERROR: {
    code: 'PRODUCT.PRODUCT_PERSISTENCE_ERROR',
    title: 'Product persistence error',
    detail: 'Failed to save or retrieve product data',
    category: 'infrastructure',
    retryable: true,
  } as DomainError,

  EVENT_STORE_ERROR: {
    code: 'PRODUCT.EVENT_STORE_ERROR',
    title: 'Event store error',
    detail: 'Failed to save or retrieve product events',
    category: 'infrastructure',
    retryable: true,
  } as DomainError,

  PROJECTION_UPDATE_ERROR: {
    code: 'PRODUCT.PROJECTION_UPDATE_ERROR',
    title: 'Projection update error',
    detail: 'Failed to update product read models',
    category: 'infrastructure',
    retryable: true,
  } as DomainError,

  // Concurrency errors
  PRODUCT_VERSION_CONFLICT: {
    code: 'PRODUCT.PRODUCT_VERSION_CONFLICT',
    title: 'Product version conflict',
    detail: 'Product has been modified by another process',
    category: 'domain',
    retryable: true,
  } as DomainError,

  // Security/Authorization errors
  PRODUCT_ACCESS_DENIED: {
    code: 'PRODUCT.PRODUCT_ACCESS_DENIED',
    title: 'Access denied to product',
    detail: 'Insufficient permissions to access this product',
    category: 'security',
    retryable: false,
  } as DomainError,

  PRODUCT_MODIFICATION_DENIED: {
    code: 'PRODUCT.PRODUCT_MODIFICATION_DENIED',
    title: 'Product modification denied',
    detail: 'Insufficient permissions to modify this product',
    category: 'security',
    retryable: false,
  } as DomainError,

  // Business rule errors
  PRICE_CHANGE_NOT_ALLOWED: {
    code: 'PRODUCT.PRICE_CHANGE_NOT_ALLOWED',
    title: 'Price change not allowed',
    detail: 'Price changes are not allowed for this product type',
    category: 'domain',
    retryable: false,
  } as DomainError,

  MINIMUM_PRICE_VIOLATION: {
    code: 'PRODUCT.MINIMUM_PRICE_VIOLATION',
    title: 'Minimum price violation',
    detail: 'Price is below the minimum allowed price',
    category: 'domain',
    retryable: false,
  } as DomainError,

  MAXIMUM_PRICE_VIOLATION: {
    code: 'PRODUCT.MAXIMUM_PRICE_VIOLATION',
    title: 'Maximum price violation',
    detail: 'Price exceeds the maximum allowed price',
    category: 'domain',
    retryable: false,
  } as DomainError,

  // No-op guard errors for business methods
  PRODUCT_NOT_MODIFIED: {
    code: 'PRODUCT.PRODUCT_NOT_MODIFIED',
    title: 'Product not modified',
    detail: 'The requested changes would result in no actual modification',
    category: 'domain',
    retryable: false,
  } as DomainError,

  PRICE_UNCHANGED: {
    code: 'PRODUCT.PRICE_UNCHANGED',
    title: 'Price unchanged',
    detail: 'The new price is the same as the current price',
    category: 'domain',
    retryable: false,
  } as DomainError,

  CATEGORY_UNCHANGED: {
    code: 'PRODUCT.CATEGORY_UNCHANGED',
    title: 'Category unchanged',
    detail: 'The new category is the same as the current category',
    category: 'domain',
    retryable: false,
  } as DomainError,
} as const;

// Type helper for Product error codes
export type ProductErrorCode = keyof typeof ProductErrors;
