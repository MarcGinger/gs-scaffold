import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILogger } from 'src/shared/logger';
import { IUserToken } from 'src/shared/auth';
import { IException } from 'src/shared/domain/exceptions';

const COMPONENT_NAME = 'DomainCommandRepository';
/**
 * Abstract base class for command repositories that use event streams
 * This extends DomainCommandRepository to add event stream functionality
 * @template TAggregate - Aggregate type extending AggregateRoot
 * @template TExceptionMessages - Exception messages type
 */

export abstract class InfrastructureRepository<
  TExceptionMessages extends Record<string, IException>,
> {
  protected debug = false;

  /**
   * Constructor
   * @param configService Config service
   * @param logger Logger service
   * @param exceptionMessages Messages used for exceptions
   * @param aggregateType Type for creating aggregates
   */
  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: ILogger,
    protected readonly exceptionMessages: TExceptionMessages,
  ) {
    this.debug =
      configService.get<string>('LOGGER_LEVEL')?.includes('debug') || false;
  }

  /**
   * Sanitizes sensitive data from objects before logging
   * @param data Object to sanitize
   * @returns Sanitized object safe for logging
   */ protected sanitizeForLog(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    // Create a deep copy to avoid modifying the original
    try {
      const sanitized = JSON.parse(JSON.stringify(data)) as unknown;

      // Derived classes should override this method to implement specific sanitization logic
      return sanitized;
    } catch (err) {
      this.logger.warn(
        {},
        `Failed to sanitize object for logging: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { sanitizationFailed: true };
    }
  }

  /**
   * Creates a standard operation log context
   * @param method Operation method name
   * @param user User token
   * @param code Entity code (if applicable)
   * @returns Log context object
   */
  protected createLogContext(
    component: string,
    method: string,
    code: string,
    user: IUserToken,
    operationId: string = `${this.constructor.name.toLowerCase()}-${method}-${Date.now()}`,
    logContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const tenant = user?.tenant || 'core';

    return {
      operationId,
      method,
      tenant,
      user: user?.preferred_username || 'unknown',
      code,
      component: this.constructor.name,
      ...logContext,
    };
  }

  /**
   * Creates a standard error context for logging
   * @param logContext Base log context
   * @param error Error that was caught
   * @param duration Operation duration in ms
   * @param props Operation props (will be sanitized)
   * @returns Error context for logging
   */
  protected createErrorContext(
    logContext: Record<string, unknown>,
    error: Error,
    duration: number,
    props?: unknown,
  ): Record<string, unknown> {
    return {
      ...logContext,
      errorName: error.name,
      errorMessage: error.message,
      stack: this.debug ? error.stack : undefined,
      duration,
      props: props ? this.sanitizeForLog(props) : undefined,
    };
  }
  /**
   * Handles errors in a standardized way for repository operations
   * @param error The error that was caught
   * @param user The user performing the operation
   * @param payload The data being processed (dto/entity/etc)
   * @param errorMessage Error message to use in the exception
   * @param duration Operation duration in ms
   */
  protected handleError(
    error: Error,
    user: IUserToken,
    payload: unknown,
    errorMessage: IException,
    duration: number,
  ): never {
    const operationId = `${COMPONENT_NAME}-operation-${Date.now()}`;
    const logContext = this.createLogContext(
      COMPONENT_NAME,
      'operation',
      '',
      user,
      operationId,
    );
    const errorContext = this.createErrorContext(
      logContext,
      error,
      duration,
      payload,
    );
    this.logger.error(
      {
        ...errorContext,
      },
      `Operation failed after ${duration}ms: ${error.message}`,
    );

    if (this.debug) {
      throw new BadRequestException(
        {
          message: errorMessage,
          errorDetails: error.message,
        },
        error.toString(),
      );
    }
    throw new BadRequestException(errorMessage);
  }

  // /**
  //  * Creates a domain event for entity deletion
  //  * @param user User who deleted the entity
  //  * @param aggregate Aggregate created from the entity before deletion
  //  * @returns Event object
  //  */
  // protected abstract getDeleteEvent(
  //   user: IUserToken,
  //   aggregate: TAggregate,
  // ): IEvent;

  /**
   * Extracts a standardized error message object from various error shapes
   */
  protected extractErrorMessage(
    error: unknown,
    fallback: IException,
  ): IException {
    if (isErrorWithResponseMessageAndCode(error)) {
      return {
        message: error.response.message,
        description: 'Error with response message and code',
        code: 'RESPONSE_ERROR',
        exception: error.response.exception,
        statusCode: error.response.statusCode,
        domain: error.response.domain,
      };
    } else if (isErrorWithMessageAndCode(error)) {
      return {
        message: error.message,
        description: 'Error with message and code',
        code: 'MESSAGE_ERROR',
        exception: error.exception,
        statusCode: error.statusCode,
        domain: error.domain,
      };
    } else if (isErrorWithMessage(error)) {
      return {
        message: error.message,
        description: 'Unknown error',
        code: 'UNKNOWN_ERROR',
        exception: '',
        statusCode: '500',
        domain: 'INFRASTRUCTURE',
      };
    } else {
      return fallback;
    }
  }
}

function isErrorWithResponseMessageAndCode(
  err: unknown,
): err is { response: IException } {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const e = err as { response: unknown };
    if (
      typeof e.response === 'object' &&
      e.response !== null &&
      'message' in e.response &&
      'code' in e.response
    ) {
      const r = e.response as { message: unknown; code: unknown };
      return typeof r.message === 'string' && typeof r.code === 'string';
    }
  }
  return false;
}

function isErrorWithMessageAndCode(err: unknown): err is IException {
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    'code' in err
  ) {
    const e = err as { message: unknown; code: unknown };
    return typeof e.message === 'string' && typeof e.code === 'string';
  }
  return false;
}

function isErrorWithMessage(err: unknown): err is { message: string } {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const e = err as { message: unknown };
    return typeof e.message === 'string';
  }
  return false;
}
