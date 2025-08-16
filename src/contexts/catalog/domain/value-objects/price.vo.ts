import {
  Result,
  ok,
  err,
  DomainError,
} from '../../../../shared/errors/error.types';

export class Price {
  private constructor(
    private readonly value: number,
    private readonly currency: string,
  ) {}

  public static create(
    value: number,
    currency: string = 'USD',
  ): Result<Price, DomainError> {
    if (value < 0) {
      return err({
        code: 'INVALID_PRICE_NEGATIVE',
        title: 'Price cannot be negative',
        category: 'validation',
        context: { value, currency },
        retryable: false,
      });
    }

    if (!currency || currency.trim().length !== 3) {
      return err({
        code: 'INVALID_CURRENCY_CODE',
        title: 'Currency code must be 3 characters',
        category: 'validation',
        context: { value, currency },
        retryable: false,
      });
    }

    // Round to 2 decimal places for currency
    const roundedValue = Math.round(value * 100) / 100;

    return ok(new Price(roundedValue, currency.toUpperCase()));
  }

  public getValue(): number {
    return this.value;
  }

  public getCurrency(): string {
    return this.currency;
  }

  public add(other: Price): Result<Price, DomainError> {
    if (this.currency !== other.currency) {
      return err({
        code: 'CURRENCY_MISMATCH',
        title: 'Cannot add prices with different currencies',
        category: 'domain',
        context: {
          currency1: this.currency,
          currency2: other.currency,
        },
        retryable: false,
      });
    }

    return Price.create(this.value + other.value, this.currency);
  }

  public multiply(factor: number): Result<Price, DomainError> {
    if (factor < 0) {
      return err({
        code: 'INVALID_PRICE_MULTIPLIER',
        title: 'Price multiplier cannot be negative',
        category: 'validation',
        context: { factor, originalPrice: this.value },
        retryable: false,
      });
    }

    return Price.create(this.value * factor, this.currency);
  }

  public equals(other: Price): boolean {
    return this.value === other.value && this.currency === other.currency;
  }

  public toString(): string {
    return `${this.value} ${this.currency}`;
  }

  public toJSON(): { value: number; currency: string } {
    return {
      value: this.value,
      currency: this.currency,
    };
  }
}
