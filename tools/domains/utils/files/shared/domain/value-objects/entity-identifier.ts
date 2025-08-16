/**
 * Generic value object for entity identifiers in the domain layer.
 * Enforces immutability, type safety, and domain invariants.
 */
export abstract class EntityIdentifier<T extends string | number> {
  protected readonly _value: T;

  protected constructor(value: T) {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (typeof value === 'number' && isNaN(value))
    ) {
      throw new Error(
        'Identifier value must be a non-empty string or valid number',
      );
    }
    this._value = value;
  }

  public toString(): string {
    return String(this._value);
  }

  public equals(other: EntityIdentifier<T>): boolean {
    return (
      other &&
      other.constructor === this.constructor &&
      this._value === other._value
    );
  }

  public toJSON(): T {
    return this._value;
  }
}
