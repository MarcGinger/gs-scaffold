// src/shared/errors/http.problem.ts

import { HttpStatus } from '@nestjs/common';
import { DomainError } from './error.types';
import { AppConfigUtil } from '../config/app-config.util';

/**
 * RFC 9457 Problem Details extensions interface.
 * Type-safe extensions for problem details.
 */
export interface ProblemExtensions {
  /** Additional error-specific properties */
  errors?: Array<{ field: string; message: string; code: string }>;
  /** Request correlation/trace ID */
  traceId?: string;
  /** Additional context data (sanitized) */
  context?: Record<string, any>;
  /** Timestamp of the error occurrence */
  timestamp?: string;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * RFC 9457 Problem Details for HTTP APIs interface.
 * Provides a standard format for HTTP error responses.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9457
 */
export interface ProblemDetails {
  /** A URI reference that identifies the problem type (defaults to "about:blank") */
  type: string;
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
  /** Type-safe extensions for additional problem-specific data */
  extensions?: ProblemExtensions;
}

/**
 * Lookup table for specific error codes to HTTP status mappings.
 * Provides exact matching to avoid false positives with substring matching.
 */
const ERROR_CODE_STATUS_MAP: Record<string, HttpStatus> = {
  // Authentication & Authorization
  'AUTHENTICATION.INVALID_TOKEN': HttpStatus.UNAUTHORIZED,
  'AUTHENTICATION.EXPIRED_TOKEN': HttpStatus.UNAUTHORIZED,
  'AUTHENTICATION.MISSING_TOKEN': HttpStatus.UNAUTHORIZED,
  'AUTHORIZATION.ACCESS_DENIED': HttpStatus.FORBIDDEN,
  'AUTHORIZATION.INSUFFICIENT_PERMISSIONS': HttpStatus.FORBIDDEN,

  // Validation & Input
  'VALIDATION.INVALID_FORMAT': HttpStatus.BAD_REQUEST,
  'VALIDATION.REQUIRED_FIELD_MISSING': HttpStatus.BAD_REQUEST,
  'VALIDATION.INVALID_VALUE': HttpStatus.BAD_REQUEST,

  // Resource Management
  'RESOURCE.NOT_FOUND': HttpStatus.NOT_FOUND,
  'RESOURCE.ALREADY_EXISTS': HttpStatus.CONFLICT,
  'RESOURCE.GONE': HttpStatus.GONE,

  // Rate Limiting & Capacity
  'RATE_LIMIT.EXCEEDED': HttpStatus.TOO_MANY_REQUESTS,
  'CAPACITY.INSUFFICIENT_INVENTORY': HttpStatus.UNPROCESSABLE_ENTITY,

  // Conditions & State
  'CONDITION.PRECONDITION_FAILED': HttpStatus.PRECONDITION_FAILED,
  'CONDITION.IDEMPOTENCY_VIOLATION': HttpStatus.CONFLICT,
  'STATE.INVALID_TRANSITION': HttpStatus.CONFLICT,

  // External Dependencies
  'UPSTREAM.TIMEOUT': HttpStatus.GATEWAY_TIMEOUT,
  'UPSTREAM.BAD_GATEWAY': HttpStatus.BAD_GATEWAY,
  'UPSTREAM.SERVICE_UNAVAILABLE': HttpStatus.BAD_GATEWAY,
  'EXTERNAL.TIMEOUT': HttpStatus.GATEWAY_TIMEOUT,
  'EXTERNAL.CONNECTION_FAILED': HttpStatus.BAD_GATEWAY,
};

/**
 * Validates HTTP status code to ensure it's in valid range.
 *
 * @param status Status code to validate
 * @returns True if status is valid HTTP status code
 */
function isValidHttpStatus(status: number): status is HttpStatus {
  return status >= 100 && status < 600 && Number.isInteger(status);
}

/**
 * Maps DomainError categories to appropriate HTTP status codes.
 * This provides consistent status code mapping across the application.
 *
 * @param error The domain error to map
 * @returns Appropriate HTTP status code
 */
export function httpStatusFor(error: DomainError): HttpStatus {
  // First validate and check for context-based status override
  if (
    error.context?.httpStatus &&
    typeof error.context.httpStatus === 'number'
  ) {
    if (isValidHttpStatus(error.context.httpStatus)) {
      return error.context.httpStatus;
    }
    // Log warning about invalid status code but continue with fallback
    console.warn(
      `Invalid HTTP status code in context: ${error.context.httpStatus}, using fallback`,
    );
  }

  // Check exact error code mapping first
  const exactMatch = ERROR_CODE_STATUS_MAP[error.code];
  if (exactMatch) {
    return exactMatch;
  }

  // Check for prefix patterns with exact segment matching
  const codeSegments = error.code.split('.');
  if (codeSegments.length >= 2) {
    const prefix = codeSegments[0];
    const specificType = codeSegments[1];

    switch (prefix) {
      case 'AUTHENTICATION':
        return HttpStatus.UNAUTHORIZED;
      case 'AUTHORIZATION':
        return HttpStatus.FORBIDDEN;
      case 'VALIDATION':
        return HttpStatus.BAD_REQUEST;
      case 'RESOURCE':
        if (specificType === 'NOT_FOUND') return HttpStatus.NOT_FOUND;
        if (specificType === 'ALREADY_EXISTS') return HttpStatus.CONFLICT;
        break;
      case 'RATE_LIMIT':
        return HttpStatus.TOO_MANY_REQUESTS;
      case 'UPSTREAM':
      case 'EXTERNAL':
        if (specificType === 'TIMEOUT') return HttpStatus.GATEWAY_TIMEOUT;
        return HttpStatus.BAD_GATEWAY;
    }
  }

  // Fall back to category-based mapping
  switch (error.category) {
    case 'security':
      return HttpStatus.FORBIDDEN; // Default to forbidden for security
    case 'validation':
      return HttpStatus.BAD_REQUEST;
    case 'domain':
      return HttpStatus.CONFLICT; // Business rule violations
    case 'application':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'infrastructure':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Configuration options for problem details generation.
 */
export interface ProblemOptions {
  /** Whether to sanitize sensitive information */
  sanitize?: boolean;
  /** Request correlation/trace ID */
  traceId?: string;
  /** Base URL for problem type URIs */
  baseUrl?: string;
  /** API version for stable URIs */
  version?: string;
}

/**
 * Get default configuration for problem details from app configuration.
 * Uses centralized configuration management instead of hardcoded values.
 */
function getDefaultProblemOptions(): Required<ProblemOptions> {
  const errorConfig = AppConfigUtil.getErrorConfig();

  return {
    sanitize: errorConfig.sanitize,
    traceId: '',
    baseUrl: errorConfig.baseUrl,
    version: errorConfig.version,
  };
}

/**
 * Converts a DomainError to RFC 9457 Problem Details format.
 * This creates a standardized HTTP error response.
 *
 * @param error The domain error to convert
 * @param instance Optional URI identifying this specific occurrence
 * @param options Configuration options for the conversion
 * @returns Problem Details object ready for HTTP response
 */
export function toProblem(
  error: DomainError,
  instance?: string,
  options: ProblemOptions = {},
): ProblemDetails {
  const config = { ...getDefaultProblemOptions(), ...options };
  const status = httpStatusFor(error);

  // Build type URI with versioning
  const typeUri = error.code
    ? `${config.baseUrl}/${config.version}/${error.code.replace(/\./g, '/').toLowerCase()}`
    : 'about:blank';

  const problem: ProblemDetails = {
    type: typeUri,
    title: error.title,
    status,
    code: error.code,
    ...(error.detail && { detail: error.detail }),
    ...(instance && { instance }),
  };

  // Build extensions object conditionally
  const extensions: ProblemExtensions = {
    ...(config.traceId && { traceId: config.traceId }),
    timestamp: new Date().toISOString(),
  };

  // Add context if present and not sanitizing
  if (error.context && !config.sanitize) {
    // Remove httpStatus from context to avoid duplication
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { httpStatus, ...contextWithoutStatus } = error.context;
    if (Object.keys(contextWithoutStatus).length > 0) {
      extensions.context = contextWithoutStatus;
    }
  }

  // Only add extensions if there are any
  if (Object.keys(extensions).length > 0) {
    problem.extensions = extensions;
  }

  return problem;
}

/**
 * Creates a Problem Details response for multiple validation errors.
 * Useful when multiple field validation errors occur simultaneously.
 *
 * @param errors Array of field validation errors with required error codes
 * @param instance Optional URI identifying this specific occurrence
 * @param options Configuration options for the conversion
 * @returns Problem Details object with validation error details
 */
export function toValidationProblem(
  errors: Array<{ field: string; message: string; code: string }>,
  instance?: string,
  options: ProblemOptions = {},
): ProblemDetails {
  const config = { ...getDefaultProblemOptions(), ...options };

  const problem: ProblemDetails = {
    type: `${config.baseUrl}/${config.version}/validation/multiple-errors`,
    title: 'Validation failed',
    status: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION.MULTIPLE_ERRORS',
    ...(errors.length > 0 && {
      detail: `${errors.length} validation error(s) occurred`,
    }),
    ...(instance && { instance }),
  };

  // Build extensions with validation errors
  const extensions: ProblemExtensions = {
    errors,
    ...(config.traceId && { traceId: config.traceId }),
    timestamp: new Date().toISOString(),
  };

  problem.extensions = extensions;
  return problem;
}

/**
 * Determines if an error should include sensitive information in the response.
 * Security and infrastructure errors may need sanitized responses.
 *
 * @param error The domain error to check
 * @param sanitizeOverride Optional override for sanitization (for testing)
 * @returns True if error details should be sanitized
 */
export function shouldSanitizeError(
  error: DomainError,
  sanitizeOverride?: boolean,
): boolean {
  if (sanitizeOverride !== undefined) {
    return sanitizeOverride;
  }

  const isProduction = AppConfigUtil.isProduction();

  // Hide detailed information for security errors in production
  if (error.category === 'security' && isProduction) {
    return true;
  }

  // Hide internal system details for infrastructure errors
  if (error.category === 'infrastructure' && isProduction) {
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
 * @param options Configuration options for the conversion
 * @returns Sanitized Problem Details object
 */
export function toSanitizedProblem(
  error: DomainError,
  instance?: string,
  options: ProblemOptions = {},
): ProblemDetails {
  const config = { ...getDefaultProblemOptions(), ...options };
  const status = httpStatusFor(error);

  // Use generic messages for sensitive errors
  const sanitizedMessages = {
    security: 'Authentication or authorization failed',
    infrastructure: 'A system error occurred. Please try again later.',
  };

  // Mask sensitive error codes in production
  const shouldMaskCode =
    (error.category === 'security' || error.category === 'infrastructure') &&
    config.sanitize;

  const sanitizedCode = shouldMaskCode
    ? `GENERIC.${error.category.toUpperCase()}_ERROR`
    : error.code;

  const problem: ProblemDetails = {
    type: `${config.baseUrl}/${config.version}/generic/${error.category}`,
    title:
      sanitizedMessages[error.category as keyof typeof sanitizedMessages] ||
      error.title,
    status,
    code: sanitizedCode,
    ...(instance && { instance }),
  };

  // Add minimal extensions for sanitized responses
  const extensions: ProblemExtensions = {
    ...(config.traceId && { traceId: config.traceId }),
    timestamp: new Date().toISOString(),
  };

  if (Object.keys(extensions).length > 0) {
    problem.extensions = extensions;
  }

  return problem;
}

/**
 * Main function to convert DomainError to Problem Details.
 * Automatically handles sanitization based on error type and environment.
 *
 * @param error The domain error to convert
 * @param instance Optional URI identifying this specific occurrence
 * @param options Configuration options for the conversion
 * @returns Problem Details object ready for HTTP response
 */
export function domainErrorToProblem(
  error: DomainError,
  instance?: string,
  options: ProblemOptions = {},
): ProblemDetails {
  const shouldSanitize = shouldSanitizeError(error, options.sanitize);

  if (shouldSanitize) {
    return toSanitizedProblem(error, instance, { ...options, sanitize: true });
  }

  return toProblem(error, instance, options);
}

/**
 * Utility to create a Problem Details response from an HTTP status code.
 * Useful for cases where you need a standard HTTP error without a domain error.
 *
 * @param status HTTP status code
 * @param title Error title
 * @param detail Optional error detail
 * @param instance Optional URI identifying this specific occurrence
 * @param options Configuration options for the conversion
 * @returns Problem Details object
 */
export function httpStatusToProblem(
  status: HttpStatus,
  title: string,
  detail?: string,
  instance?: string,
  options: ProblemOptions = {},
): ProblemDetails {
  const config = { ...getDefaultProblemOptions(), ...options };

  // Validate status code
  if (!isValidHttpStatus(status)) {
    throw new Error(`Invalid HTTP status code: ${String(status)}`);
  }

  const problem: ProblemDetails = {
    type: `${config.baseUrl}/${config.version}/http/${status}`,
    title,
    status,
    code: `HTTP.${status}`,
    ...(detail && { detail }),
    ...(instance && { instance }),
  };

  // Add extensions
  const extensions: ProblemExtensions = {
    ...(config.traceId && { traceId: config.traceId }),
    timestamp: new Date().toISOString(),
  };

  if (Object.keys(extensions).length > 0) {
    problem.extensions = extensions;
  }

  return problem;
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
    !('type' in problem) ||
    !('title' in problem) ||
    !('status' in problem) ||
    !('code' in problem) ||
    typeof problem.type !== 'string' ||
    typeof problem.title !== 'string' ||
    typeof problem.status !== 'number' ||
    typeof problem.code !== 'string'
  ) {
    return false;
  }

  // Validate that status is a valid HTTP status code
  if (!isValidHttpStatus(problem.status)) {
    return false;
  }

  // Validate optional fields if present
  if ('detail' in problem && typeof problem.detail !== 'string') {
    return false;
  }

  if ('instance' in problem && typeof problem.instance !== 'string') {
    return false;
  }

  if (
    'extensions' in problem &&
    (typeof problem.extensions !== 'object' || problem.extensions === null)
  ) {
    return false;
  }

  return true;
}
