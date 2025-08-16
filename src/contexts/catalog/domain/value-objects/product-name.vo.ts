import {
  Result,
  ok,
  err,
  DomainError,
} from '../../../../shared/errors/error.types';

export class ProductName {
  private constructor(private readonly value: string) {}

  public static create(value: string): Result<ProductName, DomainError> {
    if (!value || value.trim().length === 0) {
      return err({
        code: 'INVALID_PRODUCT_NAME',
        title: 'Product name cannot be empty',
        category: 'validation',
        context: { value },
        retryable: false,
      });
    }

    if (value.trim().length < 2) {
      return err({
        code: 'PRODUCT_NAME_TOO_SHORT',
        title: 'Product name must be at least 2 characters',
        category: 'validation',
        context: { value, length: value.trim().length },
        retryable: false,
      });
    }

    if (value.trim().length > 100) {
      return err({
        code: 'PRODUCT_NAME_TOO_LONG',
        title: 'Product name cannot exceed 100 characters',
        category: 'validation',
        context: { value, length: value.trim().length },
        retryable: false,
      });
    }

    return ok(new ProductName(value.trim()));
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: ProductName): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
