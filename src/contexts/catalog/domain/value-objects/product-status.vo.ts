export type ProductStatusType = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'DELETED';

export class ProductStatus {
  private constructor(private readonly value: ProductStatusType) {}

  public static draft(): ProductStatus {
    return new ProductStatus('DRAFT');
  }

  public static active(): ProductStatus {
    return new ProductStatus('ACTIVE');
  }

  public static inactive(): ProductStatus {
    return new ProductStatus('INACTIVE');
  }

  public static deleted(): ProductStatus {
    return new ProductStatus('DELETED');
  }

  public static fromString(value: string): ProductStatus {
    const upperValue = value.toUpperCase() as ProductStatusType;
    switch (upperValue) {
      case 'DRAFT':
        return ProductStatus.draft();
      case 'ACTIVE':
        return ProductStatus.active();
      case 'INACTIVE':
        return ProductStatus.inactive();
      case 'DELETED':
        return ProductStatus.deleted();
      default:
        throw new Error(`Invalid product status: ${value}`);
    }
  }

  public getValue(): ProductStatusType {
    return this.value;
  }

  public isDraft(): boolean {
    return this.value === 'DRAFT';
  }

  public isActive(): boolean {
    return this.value === 'ACTIVE';
  }

  public isInactive(): boolean {
    return this.value === 'INACTIVE';
  }

  public isDeleted(): boolean {
    return this.value === 'DELETED';
  }

  public canTransitionTo(newStatus: ProductStatus): boolean {
    const transitions: Record<ProductStatusType, ProductStatusType[]> = {
      DRAFT: ['ACTIVE', 'DELETED'],
      ACTIVE: ['INACTIVE', 'DELETED'],
      INACTIVE: ['ACTIVE', 'DELETED'],
      DELETED: [], // No transitions from deleted state
    };

    return transitions[this.value].includes(newStatus.value);
  }

  public equals(other: ProductStatus): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
