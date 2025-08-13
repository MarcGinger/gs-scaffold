// src/shared/errors/__tests__/http.problem.spec.ts

import { HttpStatus } from '@nestjs/common';
import {
  httpStatusFor,
  toProblem,
  toValidationProblem,
  shouldSanitizeError,
  toSanitizedProblem,
  domainErrorToProblem,
  httpStatusToProblem,
  isProblemDetails,
  ProblemDetails,
} from '../http.problem';
import { DomainError } from '../error.types';

describe('HTTP Problem Details', () => {
  describe('httpStatusFor', () => {
    it('should map security category to UNAUTHORIZED for authentication errors', () => {
      const error: DomainError = {
        code: 'USER.AUTHENTICATION_REQUIRED',
        title: 'Authentication required',
        category: 'security',
      };

      expect(httpStatusFor(error)).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should map security category to FORBIDDEN for authorization errors', () => {
      const error: DomainError = {
        code: 'USER.AUTHORIZATION_DENIED',
        title: 'Authorization denied',
        category: 'security',
      };

      expect(httpStatusFor(error)).toBe(HttpStatus.FORBIDDEN);
    });

    it('should map validation category to BAD_REQUEST', () => {
      const error: DomainError = {
        code: 'USER.INVALID_EMAIL',
        title: 'Invalid email',
        category: 'validation',
      };

      expect(httpStatusFor(error)).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should map NOT_FOUND pattern to NOT_FOUND status', () => {
      const error: DomainError = {
        code: 'USER.USER_NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      expect(httpStatusFor(error)).toBe(HttpStatus.NOT_FOUND);
    });

    it('should map application category to UNPROCESSABLE_ENTITY', () => {
      const error: DomainError = {
        code: 'ORDER.PROCESSING_FAILED',
        title: 'Processing failed',
        category: 'application',
      };

      expect(httpStatusFor(error)).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should map infrastructure category to SERVICE_UNAVAILABLE', () => {
      const error: DomainError = {
        code: 'USER.DATABASE_ERROR',
        title: 'Database error',
        category: 'infrastructure',
      };

      expect(httpStatusFor(error)).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('should default to INTERNAL_SERVER_ERROR for unknown categories', () => {
      const error: DomainError = {
        code: 'UNKNOWN.ERROR',
        title: 'Unknown error',
        category: 'unknown' as any,
      };

      expect(httpStatusFor(error)).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('toProblem', () => {
    it('should convert basic domain error to problem details', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const problem = toProblem(error);

      expect(problem).toEqual({
        type: 'https://errors.api.example.com/user/not_found',
        title: 'User not found',
        status: 404,
        code: 'USER.NOT_FOUND',
      });
    });

    it('should include detail when present', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        detail: 'The specified user does not exist.',
        category: 'domain',
      };

      const problem = toProblem(error);

      expect(problem.detail).toBe('The specified user does not exist.');
    });

    it('should include instance when provided', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const problem = toProblem(error, '/api/users/123');

      expect(problem.instance).toBe('/api/users/123');
    });

    it('should flatten context into problem details', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {
          userId: '123',
          correlationId: 'abc-def',
          operation: 'getUserById',
        },
      };

      const problem = toProblem(error);

      expect(problem.userId).toBe('123');
      expect(problem.correlationId).toBe('abc-def');
      expect(problem.operation).toBe('getUserById');
    });

    it('should not override standard problem details fields with context', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {
          title: 'Context Title',
          status: 'Context Status',
          code: 'Context Code',
        },
      };

      const problem = toProblem(error);

      // Standard fields should not be overridden
      expect(problem.title).toBe('User not found');
      expect(problem.status).toBe(404);
      expect(problem.code).toBe('USER.NOT_FOUND');
    });
  });

  describe('toValidationProblem', () => {
    it('should create validation problem details for multiple errors', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'name', message: 'Name is required' },
      ];

      const problem = toValidationProblem(validationErrors);

      expect(problem).toEqual({
        type: 'https://errors.api.example.com/validation/multiple-errors',
        title: 'Validation failed',
        status: 400,
        detail: '2 validation error(s) occurred',
        code: 'VALIDATION.MULTIPLE_ERRORS',
        errors: validationErrors,
      });
    });

    it('should include instance when provided', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
      ];

      const problem = toValidationProblem(validationErrors, '/api/users');

      expect(problem.instance).toBe('/api/users');
    });
  });

  describe('shouldSanitizeError', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should sanitize security errors in production', () => {
      process.env.NODE_ENV = 'production';

      const error: DomainError = {
        code: 'USER.AUTHORIZATION_DENIED',
        title: 'Authorization denied',
        category: 'security',
      };

      expect(shouldSanitizeError(error)).toBe(true);
    });

    it('should not sanitize security errors in development', () => {
      process.env.NODE_ENV = 'development';

      const error: DomainError = {
        code: 'USER.AUTHORIZATION_DENIED',
        title: 'Authorization denied',
        category: 'security',
      };

      expect(shouldSanitizeError(error)).toBe(false);
    });

    it('should sanitize infrastructure errors in production', () => {
      process.env.NODE_ENV = 'production';

      const error: DomainError = {
        code: 'USER.DATABASE_ERROR',
        title: 'Database error',
        category: 'infrastructure',
      };

      expect(shouldSanitizeError(error)).toBe(true);
    });

    it('should not sanitize domain errors', () => {
      process.env.NODE_ENV = 'production';

      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      expect(shouldSanitizeError(error)).toBe(false);
    });
  });

  describe('toSanitizedProblem', () => {
    it('should create sanitized problem for security errors', () => {
      const error: DomainError = {
        code: 'USER.AUTHORIZATION_DENIED',
        title: 'Authorization denied',
        detail: 'You do not have permission to access user 123',
        category: 'security',
        context: { userId: '123', permissions: ['read'] },
      };

      const problem = toSanitizedProblem(error);

      expect(problem).toEqual({
        type: 'https://errors.api.example.com/generic/security',
        title: 'Authentication or authorization failed',
        status: 403,
        code: 'USER.AUTHORIZATION_DENIED',
      });

      // Should not include detail or context
      expect(problem.detail).toBeUndefined();
      expect(problem.userId).toBeUndefined();
      expect(problem.permissions).toBeUndefined();
    });

    it('should create sanitized problem for infrastructure errors', () => {
      const error: DomainError = {
        code: 'USER.DATABASE_ERROR',
        title: 'Database connection failed',
        detail: 'Connection to user_db failed: timeout after 5000ms',
        category: 'infrastructure',
        context: { host: 'db.internal.com', timeout: 5000 },
      };

      const problem = toSanitizedProblem(error);

      expect(problem).toEqual({
        type: 'https://errors.api.example.com/generic/infrastructure',
        title: 'A system error occurred. Please try again later.',
        status: 503,
        code: 'USER.DATABASE_ERROR',
      });
    });
  });

  describe('domainErrorToProblem', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should use regular problem details for non-sensitive errors', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const problem = domainErrorToProblem(error);

      expect(problem.title).toBe('User not found');
      expect(problem.type).toBe(
        'https://errors.api.example.com/user/not_found',
      );
    });

    it('should use sanitized problem details for sensitive errors in production', () => {
      process.env.NODE_ENV = 'production';

      const error: DomainError = {
        code: 'USER.AUTHORIZATION_DENIED',
        title: 'Authorization denied',
        category: 'security',
      };

      const problem = domainErrorToProblem(error);

      expect(problem.title).toBe('Authentication or authorization failed');
      expect(problem.type).toBe(
        'https://errors.api.example.com/generic/security',
      );
    });
  });

  describe('httpStatusToProblem', () => {
    it('should create problem details from HTTP status', () => {
      const problem = httpStatusToProblem(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        'The requested resource was not found',
        '/api/resource/123',
      );

      expect(problem).toEqual({
        type: 'https://errors.api.example.com/http/404',
        title: 'Resource not found',
        status: 404,
        detail: 'The requested resource was not found',
        instance: '/api/resource/123',
        code: 'HTTP.404',
      });
    });

    it('should work without optional parameters', () => {
      const problem = httpStatusToProblem(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Internal server error',
      );

      expect(problem).toEqual({
        type: 'https://errors.api.example.com/http/500',
        title: 'Internal server error',
        status: 500,
        code: 'HTTP.500',
      });
    });
  });

  describe('isProblemDetails', () => {
    it('should return true for valid problem details object', () => {
      const problemDetails: ProblemDetails = {
        title: 'Error',
        status: 400,
        code: 'TEST.ERROR',
      };

      expect(isProblemDetails(problemDetails)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isProblemDetails(null)).toBe(false);
      expect(isProblemDetails(undefined)).toBe(false);
      expect(isProblemDetails('string')).toBe(false);
      expect(isProblemDetails(123)).toBe(false);
      expect(isProblemDetails({})).toBe(false);
      expect(isProblemDetails({ title: 'Error' })).toBe(false); // missing status and code
      expect(isProblemDetails({ title: 'Error', status: '400' })).toBe(false); // wrong type
    });

    it('should return true for problem details with extra properties', () => {
      const problemDetails = {
        title: 'Error',
        status: 400,
        code: 'TEST.ERROR',
        extra: 'property',
        correlationId: 'abc-123',
      };

      expect(isProblemDetails(problemDetails)).toBe(true);
    });
  });
});
