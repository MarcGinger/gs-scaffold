import { Logger } from '@nestjs/common';
import { IUserToken } from 'src/shared/auth';

/**
 * Base log context interface for consistent logging
 */
export interface ILogContext {
  userId?: string;
  userName?: string;
  operation?: string;
  [key: string]: any;
}

/**
 * Error context interface for structured error logging
 */
export interface IErrorContext extends ILogContext {
  error?: string;
  errorType?: string;
  stack?: string;
}

/**
 * Standardized logging and error handling helper
 * Provides consistent logging patterns and error context creation
 * to reduce repetitive code across use cases
 */
export class LoggingErrorHelper {
  /**
   * Creates a standardized log context from user token and additional context
   * @param user - User token containing user information
   * @param additionalContext - Additional context properties
   * @returns Standardized log context
   */
  static createLogContext(
    user: IUserToken,
    additionalContext: Record<string, any> = {},
  ): ILogContext {
    return {
      userId: user?.sub,
      userName: user?.name,
      ...LoggingErrorHelper.sanitizeForLog(additionalContext),
    };
  }

  /**
   * Creates a standardized error context for error logging
   * @param user - User token containing user information
   * @param error - The error that occurred
   * @param additionalContext - Additional context properties
   * @returns Standardized error context
   */
  static createErrorContext(
    user: IUserToken,
    error: unknown,
    additionalContext: Record<string, any> = {},
  ): IErrorContext {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType =
      error instanceof Error ? error.constructor.name : 'Unknown';
    const stack = error instanceof Error ? error.stack : undefined;

    return {
      userId: user?.sub,
      userName: user?.name,
      error: errorMessage,
      errorType,
      stack,
      ...LoggingErrorHelper.sanitizeForLog(additionalContext),
    };
  }

  /**
   * Sanitizes context data for logging by removing sensitive information
   * and handling circular references
   * @param context - Context object to sanitize
   * @returns Sanitized context
   */
  static sanitizeForLog(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(context)) {
      // Skip sensitive fields
      if (LoggingErrorHelper.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Handle different value types
      if (value === null || value === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        sanitized[key] = value;
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === 'object' ? '[Object]' : String(item),
        );
      } else if (typeof value === 'object') {
        // Prevent circular references and deep objects
        sanitized[key] = '[Object]';
      } else {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  /**
   * Logs a success message with standardized context
   * @param logger - Logger instance
   * @param message - Success message
   * @param user - User token
   * @param additionalContext - Additional context properties
   */
  static logSuccess(
    logger: Logger,
    message: string,
    user: IUserToken,
    additionalContext: Record<string, any> = {},
  ): void {
    const context = LoggingErrorHelper.createLogContext(
      user,
      additionalContext,
    );
    logger.log(message, context);
  }

  /**
   * Logs an info message with standardized context
   * @param logger - Logger instance
   * @param message - Info message
   * @param user - User token
   * @param additionalContext - Additional context properties
   */
  static logInfo(
    logger: Logger,
    message: string,
    user: IUserToken,
    additionalContext: Record<string, any> = {},
  ): void {
    const context = LoggingErrorHelper.createLogContext(
      user,
      additionalContext,
    );
    logger.log(message, context);
  }

  /**
   * Logs a warning message with standardized context
   * @param logger - Logger instance
   * @param message - Warning message
   * @param user - User token
   * @param additionalContext - Additional context properties
   */
  static logWarning(
    logger: Logger,
    message: string,
    user: IUserToken,
    additionalContext: Record<string, any> = {},
  ): void {
    const context = LoggingErrorHelper.createLogContext(
      user,
      additionalContext,
    );
    logger.warn(message, context);
  }

  /**
   * Logs an error with standardized context and error information
   * @param logger - Logger instance
   * @param message - Error message
   * @param user - User token
   * @param error - The error that occurred
   * @param additionalContext - Additional context properties
   */
  static logError(
    logger: Logger,
    message: string,
    user: IUserToken,
    error: unknown,
    additionalContext: Record<string, any> = {},
  ): void {
    const errorContext = LoggingErrorHelper.createErrorContext(
      user,
      error,
      additionalContext,
    );
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(message, errorContext, stack);
  }

  /**
   * Handles errors in a standardized way - logs the error and provides context
   * @param logger - Logger instance
   * @param message - Error message
   * @param user - User token
   * @param error - The error that occurred
   * @param additionalContext - Additional context properties
   */
  static handleError(
    logger: Logger,
    message: string,
    user: IUserToken,
    error: unknown,
    additionalContext: Record<string, any> = {},
  ): void {
    LoggingErrorHelper.logError(
      logger,
      message,
      user,
      error,
      additionalContext,
    );
  }

  /**
   * Creates a standardized operation context for tracking operations
   * @param operation - The operation being performed
   * @param additionalContext - Additional context properties
   * @returns Operation context
   */
  static createOperationContext(
    operation: string,
    additionalContext: Record<string, any> = {},
  ): Record<string, any> {
    return {
      operation,
      timestamp: new Date().toISOString(),
      ...additionalContext,
    };
  }

  /**
   * Checks if a field name is considered sensitive and should be redacted
   * @param fieldName - The field name to check
   * @returns True if the field is sensitive
   */
  private static isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'auth',
      'credentials',
      'private',
      'confidential',
    ];

    const lowerFieldName = fieldName.toLowerCase();
    return sensitiveFields.some((sensitive) =>
      lowerFieldName.includes(sensitive),
    );
  }
}
