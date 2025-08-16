/**
 * Product Status enumeration
 *
 * Represents the lifecycle states of a product in the catalog domain.
 * These states define the business rules and allowed transitions for products.
 */
export enum ProductStatusType {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

/**
 * Product status transitions matrix
 *
 * Defines the valid state transitions for products according to business rules:
 * - DRAFT products can be activated or deleted
 * - ACTIVE products can be deactivated or deleted
 * - INACTIVE products can be reactivated or deleted
 * - DELETED products cannot transition to any other state (terminal state)
 */
export const PRODUCT_STATUS_TRANSITIONS: Record<
  ProductStatusType,
  ProductStatusType[]
> = {
  [ProductStatusType.DRAFT]: [
    ProductStatusType.ACTIVE,
    ProductStatusType.DELETED,
  ],
  [ProductStatusType.ACTIVE]: [
    ProductStatusType.INACTIVE,
    ProductStatusType.DELETED,
  ],
  [ProductStatusType.INACTIVE]: [
    ProductStatusType.ACTIVE,
    ProductStatusType.DELETED,
  ],
  [ProductStatusType.DELETED]: [], // Terminal state - no transitions allowed
};
