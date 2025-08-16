import {
  Result,
  ok,
  err,
  DomainError,
} from '../../../../shared/errors/error.types';

export class Sku {
  private constructor(private readonly value: string) {}

  public static create(value: string): Result<Sku, DomainError> {
    if (!value || value.trim().length === 0) {
      return err({
        code: 'INVALID_SKU_EMPTY',
        title: 'SKU cannot be empty',
        category: 'validation',
        context: { value },
        retryable: false,
      });
    }

    const trimmed = value.trim().toUpperCase();

    // SKU must be alphanumeric with optional dashes and underscores
    const skuPattern = /^[A-Z0-9_-]+$/;
    if (!skuPattern.test(trimmed)) {
      return err({
        code: 'INVALID_SKU_FORMAT',
        title:
          'SKU must contain only letters, numbers, dashes, and underscores',
        category: 'validation',
        context: { value: trimmed },
        retryable: false,
      });
    }

    if (trimmed.length < 3) {
      return err({
        code: 'SKU_TOO_SHORT',
        title: 'SKU must be at least 3 characters',
        category: 'validation',
        context: { value: trimmed, length: trimmed.length },
        retryable: false,
      });
    }

    if (trimmed.length > 50) {
      return err({
        code: 'SKU_TOO_LONG',
        title: 'SKU cannot exceed 50 characters',
        category: 'validation',
        context: { value: trimmed, length: trimmed.length },
        retryable: false,
      });
    }

    return ok(new Sku(trimmed));
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Sku): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
