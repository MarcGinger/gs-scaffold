import { UnauthorizedException, ForbiddenException } from '@nestjs/common';

/**
 * Centralized authentication error factory
 * Provides consistent error codes and messages for authentication failures
 * Works well with Result<T,E> pattern and Problem Details interceptor
 */
export const AuthErrors = {
  // Token-related errors
  tokenExpired: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'JWT token has expired',
      timestamp: new Date().toISOString(),
    }),

  tokenInvalid: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_INVALID',
      message: 'Invalid token signature',
      timestamp: new Date().toISOString(),
    }),

  tokenMalformed: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_MALFORMED',
      message: 'Malformed JWT token',
      timestamp: new Date().toISOString(),
    }),

  tokenNotActive: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_NOT_ACTIVE',
      message: 'Token not yet active',
      timestamp: new Date().toISOString(),
    }),

  tokenMissing: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_MISSING',
      message: 'No valid token provided',
      timestamp: new Date().toISOString(),
    }),

  tokenAudienceInvalid: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_AUDIENCE_INVALID',
      message: 'Invalid token audience',
      timestamp: new Date().toISOString(),
    }),

  tokenIssuerInvalid: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_ISSUER_INVALID',
      message: 'Invalid token issuer',
      timestamp: new Date().toISOString(),
    }),

  // JWT Strategy specific errors
  invalidPayload: () =>
    new UnauthorizedException({
      code: 'AUTH_INVALID_PAYLOAD',
      message: 'Invalid token payload',
      timestamp: new Date().toISOString(),
    }),

  subjectMissing: () =>
    new UnauthorizedException({
      code: 'AUTH_SUBJECT_MISSING',
      message: 'Subject (sub) claim missing',
      timestamp: new Date().toISOString(),
    }),

  tokenMappingFailed: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_MAPPING_FAILED',
      message: 'Unable to map token to user',
      timestamp: new Date().toISOString(),
    }),

  tokenNotYetValid: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_NOT_YET_VALID',
      message: 'Token not yet valid',
      timestamp: new Date().toISOString(),
    }),

  tokenIssuedInFuture: () =>
    new UnauthorizedException({
      code: 'AUTH_TOKEN_ISSUED_IN_FUTURE',
      message: 'Token issued in future',
      timestamp: new Date().toISOString(),
    }),

  // Header validation errors
  missingAuthorizationHeader: () =>
    new UnauthorizedException({
      code: 'AUTH_MISSING_HEADER',
      message: 'Authorization header missing',
      timestamp: new Date().toISOString(),
    }),

  invalidAuthorizationHeader: () =>
    new UnauthorizedException({
      code: 'AUTH_INVALID_HEADER',
      message: 'Authorization header must start with Bearer',
      timestamp: new Date().toISOString(),
    }),

  missingToken: () =>
    new UnauthorizedException({
      code: 'AUTH_MISSING_TOKEN',
      message: 'Bearer token missing',
      timestamp: new Date().toISOString(),
    }),

  // User context errors
  userIdMissing: () =>
    new UnauthorizedException({
      code: 'AUTH_USER_ID_MISSING',
      message: 'User ID is missing from authentication context',
      timestamp: new Date().toISOString(),
    }),

  userNotFound: () =>
    new UnauthorizedException({
      code: 'AUTH_USER_NOT_FOUND',
      message: 'No authenticated user found in request',
      timestamp: new Date().toISOString(),
    }),

  rolesMissing: () =>
    new UnauthorizedException({
      code: 'AUTH_ROLES_MISSING',
      message: 'User roles not found in authentication context',
      timestamp: new Date().toISOString(),
    }),

  // Permission errors
  insufficientPermissions: (resource?: string) =>
    new ForbiddenException({
      code: 'AUTH_INSUFFICIENT_PERMISSIONS',
      message: resource
        ? `Insufficient permissions to access ${resource}`
        : 'Insufficient permissions',
      timestamp: new Date().toISOString(),
    }),

  roleRequired: (role: string) =>
    new ForbiddenException({
      code: 'AUTH_ROLE_REQUIRED',
      message: `Role '${role}' is required for this operation`,
      timestamp: new Date().toISOString(),
    }),

  // Generic authentication failures
  authenticationFailed: (reason?: string) =>
    new UnauthorizedException({
      code: 'AUTH_AUTHENTICATION_FAILED',
      message: reason || 'Authentication failed',
      timestamp: new Date().toISOString(),
    }),

  // Tenant-related errors
  tenantMissing: () =>
    new UnauthorizedException({
      code: 'AUTH_TENANT_MISSING',
      message: 'Tenant information missing from authentication context',
      timestamp: new Date().toISOString(),
    }),

  tenantInvalid: (tenant: string) =>
    new ForbiddenException({
      code: 'AUTH_TENANT_INVALID',
      message: `Invalid tenant: ${tenant}`,
      timestamp: new Date().toISOString(),
    }),

  // Session-related errors
  sessionExpired: () =>
    new UnauthorizedException({
      code: 'AUTH_SESSION_EXPIRED',
      message: 'User session has expired',
      timestamp: new Date().toISOString(),
    }),

  sessionInvalid: () =>
    new UnauthorizedException({
      code: 'AUTH_SESSION_INVALID',
      message: 'Invalid user session',
      timestamp: new Date().toISOString(),
    }),

  // Custom error with message
  customError: (code: string, message: string, statusCode: 401 | 403 = 401) => {
    const ExceptionClass =
      statusCode === 403 ? ForbiddenException : UnauthorizedException;
    return new ExceptionClass({
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  },

  // Token format validation errors
  invalidTokenFormat: () =>
    new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN_FORMAT',
      message: 'Token must have exactly 3 parts separated by dots',
      timestamp: new Date().toISOString(),
    }),

  invalidTokenStructure: () =>
    new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN_STRUCTURE',
      message: 'Token structure is invalid or missing required claims',
      timestamp: new Date().toISOString(),
    }),

  // Authorization service errors
  authorizationServiceUnavailable: () =>
    new ForbiddenException({
      code: 'AUTHZ_TEMPORARILY_UNAVAILABLE',
      message: 'Authorization service temporarily unavailable',
      timestamp: new Date().toISOString(),
    }),

  authorizationServiceError: () =>
    new ForbiddenException({
      code: 'AUTHZ_ERROR',
      message: 'Authorization service error',
      timestamp: new Date().toISOString(),
    }),

  authorizationConfigurationInvalid: (details?: string) =>
    new Error(
      `Invalid authorization configuration${details ? ': ' + details : ''}`,
    ),

  authorizationPolicyInvalid: () =>
    new ForbiddenException({
      code: 'AUTHZ_POLICY_INVALID',
      message: 'Invalid authorization policy response',
      timestamp: new Date().toISOString(),
    }),

  authorizationDenied: (reason?: string) =>
    new ForbiddenException({
      code: 'AUTHZ_ACCESS_DENIED',
      message: reason || 'Access denied by authorization policy',
      timestamp: new Date().toISOString(),
    }),

  opaResponseInvalid: () =>
    new ForbiddenException({
      code: 'OPA_INVALID_RESPONSE',
      message: 'Invalid OPA response format',
      timestamp: new Date().toISOString(),
    }),
};

/**
 * Helper function to create authentication errors with additional context
 * Useful for adding tenant, correlation ID, or other metadata
 */
export const createAuthError = (
  code: string,
  message: string,
  statusCode: 401 | 403 = 401,
  context?: {
    correlationId?: string;
    tenantId?: string;
    userId?: string;
    requestId?: string;
    traceId?: string;
  },
) => {
  const ExceptionClass =
    statusCode === 403 ? ForbiddenException : UnauthorizedException;

  return new ExceptionClass({
    code,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  });
};

/**
 * Type definitions for error response structure
 */
export interface AuthErrorResponse {
  code: string;
  message: string;
  timestamp: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
}
