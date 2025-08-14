// src/shared/errors/__tests__/http.problem.enhanced.spec.ts

/**
 * Tests for the enhanced HTTP Problem Details features
 * covering improved URI formatting, context handling, sanitization, and validation.
 */

import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../error.types';
import {
  ProblemDetails,
  httpStatusFor,
  toProblem,
  toValidationProblem,
  toSanitizedProblem,
  domainErrorToProblem,
  isProblemDetails,
} from '../http.problem';

describe('Enhanced HTTP Problem Details Features', () => {
  describe('httpStatusFor with context override', () => {
    it('should use context httpStatus override when provided', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {
          httpStatus: HttpStatus.GONE, // Override default 404
        },
      } as const;

      const status = httpStatusFor(error);
      expect(status).toBe(HttpStatus.GONE);
    });

    it('should fall back to pattern matching when no context override', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const status = httpStatusFor(error);
      expect(status).toBe(HttpStatus.NOT_FOUND);
    });

    it('should ignore invalid httpStatus in context', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {
          httpStatus: 'invalid', // Not a number
        },
      };

      const status = httpStatusFor(error);
      expect(status).toBe(HttpStatus.NOT_FOUND); // Falls back to pattern
    });
  });

  describe('Enhanced URI formatting', () => {
    it('should handle multiple dots in error codes correctly', () => {
      const error: DomainError = {
        code: 'BANKING.TRANSFER.INSUFFICIENT_FUNDS',
        title: 'Insufficient funds',
        category: 'domain',
      };

      const problem = toProblem(error);
      expect(problem.type).toBe(
        'https://errors.api.example.com/banking/transfer/insufficient_funds',
      );
    });

    it('should handle single dot correctly', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const problem = toProblem(error);
      expect(problem.type).toBe(
        'https://errors.api.example.com/user/not_found',
      );
    });

    it('should handle no dots correctly', () => {
      const error: DomainError = {
        code: 'SIMPLE_ERROR',
        title: 'Simple error',
        category: 'domain',
      };

      const problem = toProblem(error);
      expect(problem.type).toBe('https://errors.api.example.com/simple_error');
    });
  });

  describe('Enhanced context handling with extensions', () => {
    it('should place context in extensions field to avoid collisions', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {
          userId: '123',
          correlationId: 'abc-def',
          // These would previously collide with standard fields
          title: 'Context title', // Would collide with problem.title
          status: 'Context status', // Would collide with problem.status
        },
      };

      const problem = toProblem(error);

      // Standard fields should not be overridden
      expect(problem.title).toBe('User not found');
      expect(problem.status).toBe(HttpStatus.NOT_FOUND);

      // Context should be in extensions
      expect(problem.extensions).toEqual({
        userId: '123',
        correlationId: 'abc-def',
        title: 'Context title',
        status: 'Context status',
      });

      // Should not have top-level context fields
      expect(problem.userId).toBeUndefined();
      expect(problem.correlationId).toBeUndefined();
    });

    it('should handle empty context gracefully', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {},
      };

      const problem = toProblem(error);
      expect(problem.extensions).toEqual({});
    });

    it('should handle missing context gracefully', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const problem = toProblem(error);
      expect(problem.extensions).toBeUndefined();
    });
  });

  describe('Enhanced validation problems with required codes', () => {
    it('should create validation problem with required error codes', () => {
      const errors = [
        {
          field: 'email',
          message: 'Invalid email format',
          code: 'VALIDATION.INVALID_EMAIL',
        },
        {
          field: 'password',
          message: 'Password too short',
          code: 'VALIDATION.PASSWORD_TOO_SHORT',
        },
      ];

      const problem = toValidationProblem(errors);

      expect(problem.title).toBe('Validation failed');
      expect(problem.status).toBe(HttpStatus.BAD_REQUEST);
      expect(problem.code).toBe('VALIDATION.MULTIPLE_ERRORS');
      expect(problem.extensions).toBeDefined();
      expect(problem.extensions).toEqual({ errors });
    });

    it('should handle single validation error', () => {
      const errors = [
        {
          field: 'email',
          message: 'Email is required',
          code: 'VALIDATION.REQUIRED_FIELD',
        },
      ];

      const problem = toValidationProblem(errors);
      expect(problem.detail).toBe('1 validation error(s) occurred');
    });
  });

  describe('Enhanced sanitization with code masking', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should mask security error codes in production', () => {
      process.env.NODE_ENV = 'production';

      const error: DomainError = {
        code: 'AUTHZ.USER_DISABLED',
        title: 'User account disabled',
        category: 'security',
        context: { userId: '123', reason: 'suspended' },
      };

      const problem = toSanitizedProblem(error);

      expect(problem.code).toBe('GENERIC.SECURITY_ERROR');
      expect(problem.title).toBe('Authentication or authorization failed');
      expect(problem.extensions).toBeUndefined(); // Context stripped
    });

    it('should mask infrastructure error codes in production', () => {
      process.env.NODE_ENV = 'production';

      const error: DomainError = {
        code: 'DATABASE.CONNECTION_FAILED',
        title: 'Database connection failed',
        category: 'infrastructure',
        context: { host: 'db.internal.com', port: 5432 },
      };

      const problem = toSanitizedProblem(error);

      expect(problem.code).toBe('GENERIC.INFRASTRUCTURE_ERROR');
      expect(problem.title).toBe(
        'A system error occurred. Please try again later.',
      );
    });

    it('should not mask error codes in development', () => {
      process.env.NODE_ENV = 'development';

      const error: DomainError = {
        code: 'AUTHZ.USER_DISABLED',
        title: 'User account disabled',
        category: 'security',
      };

      const problem = toSanitizedProblem(error);

      expect(problem.code).toBe('AUTHZ.USER_DISABLED'); // Original code preserved
    });

    it('should not mask non-sensitive categories', () => {
      process.env.NODE_ENV = 'production';

      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const problem = toSanitizedProblem(error);

      expect(problem.code).toBe('USER.NOT_FOUND'); // Original code preserved
    });
  });

  describe('Enhanced isProblemDetails validation', () => {
    it('should validate basic Problem Details structure', () => {
      const validProblem: ProblemDetails = {
        title: 'Test error',
        status: HttpStatus.BAD_REQUEST,
        code: 'TEST.ERROR',
      };

      expect(isProblemDetails(validProblem)).toBe(true);
    });

    it('should reject invalid HTTP status codes', () => {
      const invalidProblem = {
        title: 'Test error',
        status: 999, // Invalid HTTP status
        code: 'TEST.ERROR',
      };

      expect(isProblemDetails(invalidProblem)).toBe(false);
    });

    it('should accept valid HTTP status codes', () => {
      const validStatuses = [
        HttpStatus.OK,
        HttpStatus.BAD_REQUEST,
        HttpStatus.UNAUTHORIZED,
        HttpStatus.FORBIDDEN,
        HttpStatus.NOT_FOUND,
        HttpStatus.INTERNAL_SERVER_ERROR,
      ];

      validStatuses.forEach((status) => {
        const problem = {
          title: 'Test error',
          status,
          code: 'TEST.ERROR',
        };

        expect(isProblemDetails(problem)).toBe(true);
      });
    });

    it('should reject missing required fields', () => {
      const missingTitle = {
        status: HttpStatus.BAD_REQUEST,
        code: 'TEST.ERROR',
      };

      const missingStatus = {
        title: 'Test error',
        code: 'TEST.ERROR',
      };

      const missingCode = {
        title: 'Test error',
        status: HttpStatus.BAD_REQUEST,
      };

      expect(isProblemDetails(missingTitle)).toBe(false);
      expect(isProblemDetails(missingStatus)).toBe(false);
      expect(isProblemDetails(missingCode)).toBe(false);
    });

    it('should reject wrong field types', () => {
      const wrongTitleType = {
        title: 123, // Should be string
        status: HttpStatus.BAD_REQUEST,
        code: 'TEST.ERROR',
      };

      const wrongStatusType = {
        title: 'Test error',
        status: '400', // Should be number
        code: 'TEST.ERROR',
      };

      const wrongCodeType = {
        title: 'Test error',
        status: HttpStatus.BAD_REQUEST,
        code: 123, // Should be string
      };

      expect(isProblemDetails(wrongTitleType)).toBe(false);
      expect(isProblemDetails(wrongStatusType)).toBe(false);
      expect(isProblemDetails(wrongCodeType)).toBe(false);
    });

    it('should reject null and non-objects', () => {
      expect(isProblemDetails(null)).toBe(false);
      expect(isProblemDetails(undefined)).toBe(false);
      expect(isProblemDetails('string')).toBe(false);
      expect(isProblemDetails(123)).toBe(false);
      expect(isProblemDetails([])).toBe(false);
    });
  });

  describe('Integration with domainErrorToProblem', () => {
    it('should use enhanced features in main conversion function', () => {
      const error: DomainError = {
        code: 'BANKING.TRANSFER.INSUFFICIENT_FUNDS',
        title: 'Insufficient funds',
        category: 'domain',
        context: {
          accountId: '123',
          attemptedAmount: 1000,
          availableBalance: 500,
        },
      };

      const problem = domainErrorToProblem(error);

      // Should use enhanced URI formatting
      expect(problem.type).toBe(
        'https://errors.api.example.com/banking/transfer/insufficient_funds',
      );

      // Should use extensions for context
      expect(problem.extensions).toEqual({
        accountId: '123',
        attemptedAmount: 1000,
        availableBalance: 500,
      });

      // Should be valid Problem Details
      expect(isProblemDetails(problem)).toBe(true);
    });
  });
});
