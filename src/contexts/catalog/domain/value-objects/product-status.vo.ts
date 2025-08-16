import {
  ProductStatusType,
  PRODUCT_STATUS_TRANSITIONS,
} from '../types/product-status.types';

/**
 * ProductStatus value object
 *
 * Encapsulates the status of a product and provides business rules
 * for status validation and transitions.
 */
export class ProductStatus {
  private constructor(private readonly value: ProductStatusType) {}

  public static draft(): ProductStatus {
    return new ProductStatus(ProductStatusType.DRAFT);
  }

  public static active(): ProductStatus {
    return new ProductStatus(ProductStatusType.ACTIVE);
  }

  public static inactive(): ProductStatus {
    return new ProductStatus(ProductStatusType.INACTIVE);
  }

  public static deleted(): ProductStatus {
    return new ProductStatus(ProductStatusType.DELETED);
  }

  public static fromString(value: string): ProductStatus {
    const upperValue = value.toUpperCase() as ProductStatusType;
    switch (upperValue) {
      case ProductStatusType.DRAFT:
        return ProductStatus.draft();
      case ProductStatusType.ACTIVE:
        return ProductStatus.active();
      case ProductStatusType.INACTIVE:
        return ProductStatus.inactive();
      case ProductStatusType.DELETED:
        return ProductStatus.deleted();
      default:
        throw new Error(`Invalid product status: ${value}`);
    }
  }

  public getValue(): ProductStatusType {
    return this.value;
  }

  public isDraft(): boolean {
    return this.value === ProductStatusType.DRAFT;
  }

  public isActive(): boolean {
    return this.value === ProductStatusType.ACTIVE;
  }

  public isInactive(): boolean {
    return this.value === ProductStatusType.INACTIVE;
  }

  public isDeleted(): boolean {
    return this.value === ProductStatusType.DELETED;
  }

  public canTransitionTo(newStatus: ProductStatus): boolean {
    return PRODUCT_STATUS_TRANSITIONS[this.value].includes(newStatus.value);
  }

  public equals(other: ProductStatus): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
