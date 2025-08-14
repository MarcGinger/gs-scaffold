// src/shared/errors/http.problem.ts

import { HttpStatus } from '@nestjs/common';
import { DomainError } from './error.types';

/**
 * RFC 9457 Problem Details for HTTP APIs interface.
 * Provides a standard format for HTTP error responses.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9457
 */
export interface ProblemDetails {
  /** A URI reference that identifies the problem type */
  type?: string;
  /** A short, human-readable summary of the problem type */
  title: string;
  /** The HTTP status code for this occurrence of the problem */
  status: number;
  /** A human-readable explanation specific to this occurrence */
  detail?: string;
  /** A URI reference that identifies the specific occurrence of the problem */
  instance?: string;
  /** The stable error code from the domain error */
  code: string;
  /** Additional properties specific to the problem type */
  [key: string]: any;
}

/**
 * Maps DomainError categories to appropriate HTTP status codes.
 * This provides consistent status code mapping across the application.
 *
 * @param error The domain error to map
 * @returns Appropriate HTTP status code
 */
export function httpStatusFor(error: DomainError): HttpStatus {
  // First check for context-based status override
  if (
    error.context?.httpStatus &&
    typeof error.context.httpStatus === 'number'
  ) {
    return error.context.httpStatus as HttpStatus;
  }

  // Then check for specific error patterns that need special status codes
  if (error.code.includes('NOT_FOUND')) {
    return HttpStatus.NOT_FOUND;
  }

  if (error.code.includes('ALREADY_EXISTS')) {
    return HttpStatus.CONFLICT;
  }

  if (error.code.includes('INSUFFICIENT_INVENTORY')) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

  // Then fall back to category-based mapping
  switch (error.category) {
    case 'security':
      // Authentication/Authorization errors
      return error.code.includes('AUTHENTICATION')
        ? HttpStatus.UNAUTHORIZED
        : HttpStatus.FORBIDDEN;

    case 'validation':
      // Input validation errors
      return HttpStatus.BAD_REQUEST;

    case 'domain':
      // Business rule violations - default to conflict for domain errors
      return HttpStatus.CONFLICT;

    case 'application':
      // Application logic errors
      return HttpStatus.UNPROCESSABLE_ENTITY;

    case 'infrastructure':
      // External service/database failures
      return HttpStatus.SERVICE_UNAVAILABLE;

    default:
      // Fallback for unknown categories
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Converts a DomainError to RFC 9457 Problem Details format.
 * This creates a standardized HTTP error response.
 *
 * @param error The domain error to convert
 * @param instance Optional URI identifying this specific occurrence
 * @returns Problem Details object ready for HTTP response
 */
export function toProblem(
  error: DomainError,
  instance?: string,
): ProblemDetails {
  const status = httpStatusFor(error);

  const problem: ProblemDetails = {
    type: `https://errors.api.example.com/${error.code.replace(/\./g, '/').toLowerCase()}`,
    title: error.title,
    status,
    code: error.code,
    ...(error.detail && { detail: error.detail }),
    ...(instance && { instance }),
  };

  // Add context as extensions to avoid field collisions
  if (error.context) {
    problem.extensions = { ...error.context };
  }

  return problem;
}

/**
 * Creates a Problem Details response for multiple validation errors.
 * Useful when multiple field validation errors occur simultaneously.
 *
 * @param errors Array of field validation errors with required error codes
 * @param instance Optional URI identifying this specific occurrence
 * @returns Problem Details object with validation error details
 */
export function toValidationProblem(
  errors: Array<{ field: string; message: string; code: string }>,
  instance?: string,
): ProblemDetails {
  return {
    type: 'https://errors.api.example.com/validation/multiple-errors',
    title: 'Validation failed',
    status: HttpStatus.BAD_REQUEST,
    detail: `${errors.length} validation error(s) occurred`,
    instance,
    code: 'VALIDATION.MULTIPLE_ERRORS',
    extensions: { errors },
  };
}

/**
 * Determines if an error should include sensitive information in the response.
 * Security and infrastructure errors may need sanitized responses.
 *
 * @param error The domain error to check
 * @returns True if error details should be sanitized
 */
export function shouldSanitizeError(error: DomainError): boolean {
  // Hide detailed information for security errors in production
  if (error.category === 'security' && process.env.NODE_ENV === 'production') {
    return true;
  }

  // Hide internal system details for infrastructure errors
  if (
    error.category === 'infrastructure' &&
    process.env.NODE_ENV === 'production'
  ) {
    return true;
  }

  return false;
}

/**
 * Creates a sanitized Problem Details response for sensitive errors.
 * Removes potentially sensitive information from error responses.
 *
 * @param error The domain error to sanitize
 * @param instance Optional URI identifying this specific occurrence
 * @returns Sanitized Problem Details object
 */
export function toSanitizedProblem(
  error: DomainError,
  instance?: string,
): ProblemDetails {
  const status = httpStatusFor(error);

  // Use generic messages for sensitive errors
  const sanitizedMessages = {
    security: 'Authentication or authorization failed',
    infrastructure: 'A system error occurred. Please try again later.',
  };

  // Mask sensitive error codes in production
  const shouldMaskCode =
    (error.category === 'security' || error.category === 'infrastructure') &&
    process.env.NODE_ENV === 'production';

  const sanitizedCode = shouldMaskCode
    ? `GENERIC.${error.category.toUpperCase()}_ERROR`
    : error.code;

  return {
    type: `https://errors.api.example.com/generic/${error.category}`,
    title:
      sanitizedMessages[error.category as keyof typeof sanitizedMessages] ||
      error.title,
    status,
    code: sanitizedCode,
    instance,
    // Remove detailed information and context for security
  };
}

/**
 * Main function to convert DomainError to Problem Details.
 * Automatically handles sanitization based on error type and environment.
 *
 * @param error The domain error to convert
 * @param instance Optional URI identifying this specific occurrence
 * @returns Problem Details object ready for HTTP response
 */
export function domainErrorToProblem(
  error: DomainError,
  instance?: string,
): ProblemDetails {
  if (shouldSanitizeError(error)) {
    return toSanitizedProblem(error, instance);
  }

  return toProblem(error, instance);
}

/**
 * Utility to create a Problem Details response from an HTTP status code.
 * Useful for cases where you need a standard HTTP error without a domain error.
 *
 * @param status HTTP status code
 * @param title Error title
 * @param detail Optional error detail
 * @param instance Optional URI identifying this specific occurrence
 * @returns Problem Details object
 */
export function httpStatusToProblem(
  status: HttpStatus,
  title: string,
  detail?: string,
  instance?: string,
): ProblemDetails {
  return {
    type: `https://errors.api.example.com/http/${status}`,
    title,
    status,
    detail,
    instance,
    code: `HTTP.${status}`,
  };
}

/**
 * Type guard to check if an object is a Problem Details response.
 * Includes validation of HTTP status codes for stricter type checking.
 *
 * @param obj Object to check
 * @returns True if object conforms to Problem Details interface
 */
export function isProblemDetails(obj: unknown): obj is ProblemDetails {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const problem = obj as Record<string, unknown>;

  // Check required fields and their types
  if (
    !('title' in problem) ||
    !('status' in problem) ||
    !('code' in problem) ||
    typeof problem.title !== 'string' ||
    typeof problem.status !== 'number' ||
    typeof problem.code !== 'string'
  ) {
    return false;
  }

  // Validate that status is a valid HTTP status code
  const validHttpStatuses = Object.values(HttpStatus).filter(
    (value) => typeof value === 'number',
  ) as number[];

  if (!validHttpStatuses.includes(problem.status)) {
    return false;
  }

  return true;
}
