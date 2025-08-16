/**
 * AttributeSet Value Object
 * Represents a set of key-value attributes for a domain entity
 */
export class AttributeSet {
  private readonly attributes: Record<string, any>;

  private constructor(attributes: Record<string, any>) {
    this.attributes = { ...attributes };
    this.validate();
  }

  public static create(attributes: Record<string, any>): AttributeSet {
    return new AttributeSet(attributes);
  }

  private validate(): void {
    // Example: keys must be non-empty strings
    for (const key of Object.keys(this.attributes)) {
      if (!key || typeof key !== 'string' || key.trim() === '') {
        throw new Error('Attribute keys must be non-empty strings');
      }
    }
  }

  public get(key: string): any {
    return this.attributes[key];
  }

  public getAll(): Record<string, any> {
    return { ...this.attributes };
  }

  public equals(other: AttributeSet): boolean {
    const keysA = Object.keys(this.attributes);
    const keysB = Object.keys(other.attributes);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (this.attributes[key] !== other.attributes[key]) return false;
    }
    return true;
  }
}
