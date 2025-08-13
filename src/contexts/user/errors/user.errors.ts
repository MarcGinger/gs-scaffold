// src/contexts/user/errors/user.errors.ts

import { makeCatalog } from '../../_shared/errors/catalog';

/**
 * User domain error catalog.
 * Contains all possible errors that can occur in user-related operations.
 *
 * Naming convention: UPPER_SNAKE_CASE for error keys
 * Code format: USER.{ERROR_KEY}
 */
export const UserErrors = makeCatalog(
  {
    USER_NOT_FOUND: {
      title: 'User not found',
      detail: 'The specified user does not exist or is not accessible.',
      category: 'domain',
      retryable: false,
    },
    USER_ALREADY_EXISTS: {
      title: 'User already exists',
      detail: 'A user with this email or identifier already exists.',
      category: 'domain',
      retryable: false,
    },
    INVALID_EMAIL_FORMAT: {
      title: 'Invalid email format',
      detail: 'The provided email address is not in a valid format.',
      category: 'validation',
      retryable: false,
    },
    INVALID_USER_DATA: {
      title: 'Invalid user data',
      detail: 'The provided user data does not meet validation requirements.',
      category: 'validation',
      retryable: false,
    },
    USER_AUTHENTICATION_REQUIRED: {
      title: 'Authentication required',
      detail: 'Valid authentication is required to access this user resource.',
      category: 'security',
      retryable: false,
    },
    USER_AUTHORIZATION_DENIED: {
      title: 'Authorization denied',
      detail: 'You do not have permission to access this user resource.',
      category: 'security',
      retryable: false,
    },
    USER_DATABASE_ERROR: {
      title: 'User database operation failed',
      detail: 'A database error occurred while processing the user operation.',
      category: 'infrastructure',
      retryable: true,
    },
    USER_SERVICE_UNAVAILABLE: {
      title: 'User service temporarily unavailable',
      detail:
        'The user service is currently unavailable. Please try again later.',
      category: 'infrastructure',
      retryable: true,
    },
    USER_RATE_LIMIT_EXCEEDED: {
      title: 'Rate limit exceeded for user operations',
      detail:
        'Too many user operations attempted. Please wait before retrying.',
      category: 'security',
      retryable: true,
    },
    USER_VALIDATION_TIMEOUT: {
      title: 'User validation timeout',
      detail: 'User validation process timed out. Please retry the operation.',
      category: 'infrastructure',
      retryable: true,
    },
  },
  'USER',
);

/**
 * Type alias for all user error codes.
 * Useful for type-safe error handling in user-related functions.
 */
export type UserErrorCode = keyof typeof UserErrors;

/**
 * Type alias for all user domain errors.
 * Useful for function return types and error handling.
 */
export type UserDomainError = (typeof UserErrors)[UserErrorCode];
