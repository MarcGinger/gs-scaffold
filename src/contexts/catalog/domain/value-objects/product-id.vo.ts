import {
  Result,
  ok,
  err,
  DomainError,
} from '../../../../shared/errors/error.types';

export class ProductId {
  private constructor(private readonly value: string) {}

  public static create(value: string): Result<ProductId, DomainError> {
    if (!value || value.trim().length === 0) {
      return err({
        code: 'INVALID_PRODUCT_ID',
        title: 'Product ID cannot be empty',
        category: 'validation',
        context: { value },
        retryable: false,
      });
    }

    if (value.length > 50) {
      return err({
        code: 'PRODUCT_ID_TOO_LONG',
        title: 'Product ID cannot exceed 50 characters',
        category: 'validation',
        context: { value, length: value.length },
        retryable: false,
      });
    }

    return ok(new ProductId(value.trim()));
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: ProductId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
