import {
  Result,
  ok,
  err,
  DomainError,
} from '../../../../shared/errors/error.types';

export class Category {
  private constructor(
    private readonly id: string,
    private readonly name: string,
  ) {}

  public static create(
    id: string,
    name: string,
  ): Result<Category, DomainError> {
    if (!id || id.trim().length === 0) {
      return err({
        code: 'INVALID_CATEGORY_ID',
        title: 'Category ID cannot be empty',
        category: 'validation',
        context: { id, name },
        retryable: false,
      });
    }

    if (!name || name.trim().length === 0) {
      return err({
        code: 'INVALID_CATEGORY_NAME',
        title: 'Category name cannot be empty',
        category: 'validation',
        context: { id, name },
        retryable: false,
      });
    }

    if (name.trim().length > 100) {
      return err({
        code: 'CATEGORY_NAME_TOO_LONG',
        title: 'Category name cannot exceed 100 characters',
        category: 'validation',
        context: { id, name, length: name.trim().length },
        retryable: false,
      });
    }

    return ok(new Category(id.trim(), name.trim()));
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public equals(other: Category): boolean {
    return this.id === other.id && this.name === other.name;
  }

  public toString(): string {
    return `${this.name} (${this.id})`;
  }

  public toJSON(): { id: string; name: string } {
    return {
      id: this.id,
      name: this.name,
    };
  }
}
