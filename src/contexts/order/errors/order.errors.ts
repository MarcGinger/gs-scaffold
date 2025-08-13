// src/contexts/order/errors/order.errors.ts

import { makeCatalog } from '../../_shared/errors/catalog';

/**
 * Order domain error catalog.
 * Contains all possible errors that can occur in order-related operations.
 *
 * Naming convention: UPPER_SNAKE_CASE for error keys
 * Code format: ORDER.{ERROR_KEY}
 */
export const OrderErrors = makeCatalog(
  {
    ORDER_NOT_FOUND: {
      title: 'Order not found',
      detail: 'The specified order does not exist or is not accessible.',
      category: 'domain',
      retryable: false,
    },
    ORDER_ALREADY_EXISTS: {
      title: 'Order already exists',
      detail: 'An order with this identifier already exists.',
      category: 'domain',
      retryable: false,
    },
    INVALID_ORDER_STATUS: {
      title: 'Invalid order status',
      detail: 'The requested status transition is not valid for this order.',
      category: 'domain',
      retryable: false,
    },
    ORDER_CANNOT_BE_MODIFIED: {
      title: 'Order cannot be modified',
      detail: 'This order is in a state that does not allow modifications.',
      category: 'domain',
      retryable: false,
    },
    INVALID_ORDER_DATA: {
      title: 'Invalid order data',
      detail: 'The provided order data does not meet validation requirements.',
      category: 'validation',
      retryable: false,
    },
    INSUFFICIENT_INVENTORY: {
      title: 'Insufficient inventory',
      detail: 'Not enough inventory available to fulfill this order.',
      category: 'domain',
      retryable: false,
    },
    ORDER_AUTHORIZATION_DENIED: {
      title: 'Order authorization denied',
      detail: 'You do not have permission to access this order.',
      category: 'security',
      retryable: false,
    },
    ORDER_PAYMENT_REQUIRED: {
      title: 'Payment required for order',
      detail: 'Valid payment information is required to process this order.',
      category: 'domain',
      retryable: false,
    },
    ORDER_DATABASE_ERROR: {
      title: 'Order database operation failed',
      detail: 'A database error occurred while processing the order operation.',
      category: 'infrastructure',
      retryable: true,
    },
    ORDER_SERVICE_UNAVAILABLE: {
      title: 'Order service temporarily unavailable',
      detail:
        'The order service is currently unavailable. Please try again later.',
      category: 'infrastructure',
      retryable: true,
    },
    ORDER_PROCESSING_TIMEOUT: {
      title: 'Order processing timeout',
      detail: 'Order processing timed out. Please retry the operation.',
      category: 'infrastructure',
      retryable: true,
    },
    EXTERNAL_PAYMENT_SERVICE_ERROR: {
      title: 'External payment service error',
      detail: 'The external payment service is currently unavailable.',
      category: 'infrastructure',
      retryable: true,
    },
  },
  'ORDER',
);

/**
 * Type alias for all order error codes.
 * Useful for type-safe error handling in order-related functions.
 */
export type OrderErrorCode = keyof typeof OrderErrors;

/**
 * Type alias for all order domain errors.
 * Useful for function return types and error handling.
 */
export type OrderDomainError = (typeof OrderErrors)[OrderErrorCode];
