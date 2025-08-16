/**
 * Tag Value Object
 * Represents a tag for domain entities (immutable, value-based equality)
 */
export class Tag {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value.trim();
    this.validate();
  }

  public static create(value: string): Tag {
    return new Tag(value);
  }

  private validate(): void {
    if (!this.value || this.value.length === 0) {
      throw new Error('Tag cannot be empty');
    }
    if (this.value.length > 32) {
      throw new Error('Tag must be at most 32 characters');
    }
    // Add more rules as needed
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Tag): boolean {
    return this.value === other.value;
  }
}
