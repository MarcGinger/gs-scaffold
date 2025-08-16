import { IException } from './exception.model';

/**
 * Base domain exception class for all aggregate-specific exceptions.
 *
 * This abstract class provides common functionality for domain exceptions
 * while allowing each aggregate to have its own specific exception type.
 *
 * Follows DDD principles by:
 * - Encapsulating domain-specific error information
 * - Maintaining consistency across all domain exceptions
 * - Supporting event sourcing through serialization
 * - Providing semantic factory methods for common scenarios
 */
export abstract class DomainException extends Error implements IException {
  public readonly description: string;
  public readonly code: string;
  public readonly exception: string;
  public readonly statusCode: string;
  public readonly domain: string;
  public readonly errorCode: string;

  constructor(exceptionMessage: IException, aggregateName: string) {
    super(exceptionMessage.message);

    this.name = `${aggregateName}DomainException`;
    this.message = exceptionMessage.message;
    this.description = exceptionMessage.description;
    this.code = exceptionMessage.code;
    this.exception = exceptionMessage.exception;
    this.statusCode = exceptionMessage.statusCode;
    this.domain = exceptionMessage.domain;

    // Maintains proper stack trace for debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Creates a domain exception for business rule violations
   */
  static businessRuleViolation<T extends DomainException>(
    this: new (exceptionMessage: IException) => T,
    exceptionMessage: IException,
  ): T {
    return new this(exceptionMessage);
  }

  /**
   * Creates a domain exception for not found scenarios
   */
  static notFound<T extends DomainException>(
    this: new (exceptionMessage: IException) => T,
    exceptionMessage: IException,
  ): T {
    return new this(exceptionMessage);
  }

  /**
   * Creates a domain exception for validation failures
   */
  static validationFailed<T extends DomainException>(
    this: new (exceptionMessage: IException) => T,
    exceptionMessage: IException,
  ): T {
    return new this(exceptionMessage);
  }

  /**
   * Creates a domain exception for invariant violations
   */
  static invariantViolation<T extends DomainException>(
    this: new (exceptionMessage: IException) => T,
    exceptionMessage: IException,
  ): T {
    return new this(exceptionMessage);
  }

  /**
   * Creates a domain exception for concurrency conflicts
   */
  static concurrencyConflict<T extends DomainException>(
    this: new (exceptionMessage: IException) => T,
    exceptionMessage: IException,
  ): T {
    return new this(exceptionMessage);
  }

  /**
   * Creates a domain exception for authorization failures
   */
  static unauthorized<T extends DomainException>(
    this: new (exceptionMessage: IException) => T,
    exceptionMessage: IException,
  ): T {
    return new this(exceptionMessage);
  }

  /**
   * Serializes the exception for logging and event sourcing
   */
  toDto(): IException {
    return {
      message: this.message,
      description: this.description,
      code: this.code,
      exception: this.exception,
      statusCode: this.statusCode,
      domain: this.domain,
    };
  }

  /**
   * Returns a string representation of the exception for logging
   */
  toString(): string {
    return `${this.name}: ${this.message} [${this.code}]`;
  }

  /**
   * Checks if this exception matches a specific error code
   */
  hasErrorCode(errorCode: string): boolean {
    return this.errorCode === errorCode || this.code === errorCode;
  }

  /**
   * Checks if this exception has a specific status code
   */
  hasStatusCode(statusCode: number): boolean {
    return parseInt(this.statusCode) === statusCode;
  }
}
