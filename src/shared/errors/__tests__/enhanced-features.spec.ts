// src/shared/errors/__tests__/enhanced-features.spec.ts

/**
 * Tests for the enhanced error management features
 * including improved type safety, collision detection, and developer feedback.
 */

import {
  DomainError,
  Result,
  ok,
  err,
  unsafeUnwrap,
  fromError,
  withContext,
} from '../error.types';
import { makeCatalog, mergeCatalogs, validateCatalogNaming } from '../catalog';

describe('Enhanced Error Management Features', () => {
  describe('Type Safety for Context', () => {
    interface UserContext extends Record<string, unknown> {
      userId: string;
      correlationId: string;
      operation: string;
    }

    interface PaymentContext extends Record<string, unknown> {
      transactionId: string;
      amount: number;
      currency: string;
    }

    it('should allow typed context on DomainError', () => {
      const userError: DomainError<'USER.NOT_FOUND', UserContext> = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {
          userId: '123',
          correlationId: 'abc-def',
          operation: 'findUser',
        },
      };

      // TypeScript should enforce the correct context shape
      expect(userError.context?.userId).toBe('123');
      expect(userError.context?.correlationId).toBe('abc-def');
      expect(userError.context?.operation).toBe('findUser');
    });

    it('should support different context types for different errors', () => {
      const paymentError: DomainError<'PAYMENT.FAILED', PaymentContext> = {
        code: 'PAYMENT.FAILED',
        title: 'Payment processing failed',
        category: 'infrastructure',
        context: {
          transactionId: 'txn-456',
          amount: 99.99,
          currency: 'USD',
        },
      };

      expect(paymentError.context?.transactionId).toBe('txn-456');
      expect(paymentError.context?.amount).toBe(99.99);
      expect(paymentError.context?.currency).toBe('USD');
    });

    it('should work with withContext helper maintaining type safety', () => {
      const baseError: DomainError<'USER.NOT_FOUND', UserContext> = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: {
          userId: '123',
          correlationId: 'abc-def',
          operation: 'findUser',
        },
      };

      const enrichedError = withContext(baseError, {
        userId: '456', // Should override
        additionalInfo: 'extra data', // Should be added
      });

      expect(enrichedError.context?.userId).toBe('456');
      expect(enrichedError.context?.correlationId).toBe('abc-def');
      expect(enrichedError.context?.operation).toBe('findUser');
    });
  });

  describe('unsafeUnwrap', () => {
    it('should extract value from Ok result', () => {
      const result: Result<string, DomainError> = ok('success');
      const value = unsafeUnwrap(result);
      expect(value).toBe('success');
    });

    it('should throw with detailed error information for Err result', () => {
      const error: DomainError = {
        code: 'TEST.ERROR',
        title: 'Test error',
        category: 'domain',
        context: { userId: '123', operation: 'test' },
      };

      const result: Result<string, DomainError> = err(error);

      expect(() => unsafeUnwrap(result)).toThrow(
        /Attempted to unwrap Err result: TEST\.ERROR - Test error\./,
      );

      expect(() => unsafeUnwrap(result)).toThrow(
        /Context: {"userId":"123","operation":"test"}/,
      );
    });

    it('should throw with basic message when no context exists', () => {
      const error: DomainError = {
        code: 'TEST.SIMPLE_ERROR',
        title: 'Simple error',
        category: 'domain',
      };

      const result: Result<string, DomainError> = err(error);

      expect(() => unsafeUnwrap(result)).toThrow(
        'Attempted to unwrap Err result: TEST.SIMPLE_ERROR - Simple error.',
      );
    });
  });

  describe('fromError helper', () => {
    const catalogError: DomainError = {
      code: 'USER.DATABASE_ERROR',
      title: 'Database operation failed',
      category: 'infrastructure',
      retryable: true,
    };

    it('should map Error instance with message and stack', () => {
      const originalError = new Error('Connection timeout');
      originalError.stack = 'Error: Connection timeout\n    at test.js:1:1';

      const domainError = fromError(catalogError, originalError, {
        userId: '123',
      });

      expect(domainError.code).toBe('USER.DATABASE_ERROR');
      expect(domainError.title).toBe('Database operation failed');
      expect(domainError.context?.cause).toBe('Connection timeout');
      expect(domainError.context?.causeStack).toContain(
        'Error: Connection timeout',
      );
      expect(domainError.context?.userId).toBe('123');
    });

    it('should map string error', () => {
      const domainError = fromError(catalogError, 'Simple error message', {
        operation: 'findUser',
      });

      expect(domainError.context?.cause).toBe('Simple error message');
      expect(domainError.context?.causeStack).toBeUndefined();
      expect(domainError.context?.operation).toBe('findUser');
    });

    it('should map any unknown value', () => {
      const domainError = fromError(catalogError, {
        code: 500,
        message: 'Server Error',
      });

      expect(domainError.context?.cause).toBe('[object Object]');
      expect(domainError.context?.causeStack).toBeUndefined();
    });

    it('should merge with existing context', () => {
      const errorWithContext: DomainError = {
        ...catalogError,
        context: { existing: 'value' },
      };

      const domainError = fromError(errorWithContext, new Error('Test'), {
        new: 'context',
      });

      expect(domainError.context?.existing).toBe('value');
      expect(domainError.context?.new).toBe('context');
      expect(domainError.context?.cause).toBe('Test');
    });
  });

  describe('Enhanced mergeCatalogs', () => {
    const userCatalog = {
      USER_NOT_FOUND: {
        code: 'USER.USER_NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      } as DomainError,
    };

    const orderCatalog = {
      ORDER_NOT_FOUND: {
        code: 'ORDER.ORDER_NOT_FOUND',
        title: 'Order not found',
        category: 'domain',
      } as DomainError,
    };

    it('should merge catalogs successfully when no conflicts', () => {
      const merged = mergeCatalogs(userCatalog, orderCatalog);

      expect(merged.USER_NOT_FOUND.code).toBe('USER.USER_NOT_FOUND');
      expect(merged.ORDER_NOT_FOUND.code).toBe('ORDER.ORDER_NOT_FOUND');
    });

    it('should detect duplicate catalog keys', () => {
      const conflictingCatalog = {
        USER_NOT_FOUND: {
          code: 'PROFILE.USER_NOT_FOUND',
          title: 'Profile user not found',
          category: 'domain',
        } as DomainError,
      };

      expect(() => mergeCatalogs(userCatalog, conflictingCatalog)).toThrow(
        /Duplicate catalog key "USER_NOT_FOUND"/,
      );
    });

    it('should detect duplicate error codes', () => {
      const duplicateCodeCatalog = {
        DUPLICATE_USER: {
          code: 'USER.USER_NOT_FOUND', // Same code as userCatalog but different key
          title: 'Duplicate user',
          category: 'domain',
        } as DomainError,
      };

      expect(() => mergeCatalogs(userCatalog, duplicateCodeCatalog)).toThrow(
        /Duplicate error code "USER\.USER_NOT_FOUND"/,
      );
    });
  });

  describe('Enhanced validateCatalogNaming', () => {
    it('should provide detailed feedback for invalid naming', () => {
      const invalidDefinitions = {
        invalidCamelCase: {
          title: 'Invalid camel case',
          category: 'domain',
        },
        'invalid-kebab-case': {
          title: 'Invalid kebab case',
          category: 'domain',
        },
        VALID_CASE: {
          title: 'Valid case',
          category: 'domain',
        },
      } as const;

      const errors = validateCatalogNaming(invalidDefinitions);

      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('invalidCamelCase');
      expect(errors[0]).toContain('INVALID_CAMEL_CASE');
      expect(errors[0]).toContain('Pattern:');

      expect(errors[1]).toContain('invalid-kebab-case');
      expect(errors[1]).toContain('INVALID_KEBAB_CASE');
    });

    it('should handle edge cases in naming suggestions', () => {
      const edgeCases = {
        'multiple---dashes': {
          title: 'Multiple dashes',
          category: 'domain',
        },
        camelCaseWithNumbers123: {
          title: 'Camel case with numbers',
          category: 'domain',
        },
      } as const;

      const errors = validateCatalogNaming(edgeCases);

      expect(errors[0]).toContain('MULTIPLE_DASHES');
      expect(errors[1]).toContain('CAMEL_CASE_WITH_NUMBERS123');
    });

    it('should return empty array for valid naming', () => {
      const validDefinitions = {
        VALID_UPPER_SNAKE_CASE: {
          title: 'Valid naming',
          category: 'domain',
        },
        ANOTHER_VALID_CASE_123: {
          title: 'Another valid',
          category: 'domain',
        },
      } as const;

      const errors = validateCatalogNaming(validDefinitions);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Auto-validation in makeCatalog', () => {
    let originalNodeEnv: string | undefined;
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      consoleSpy.mockRestore();
    });

    it('should log warnings in development environment', () => {
      process.env.NODE_ENV = 'development';

      const invalidDefinitions = {
        invalidCase: {
          title: 'Invalid case',
          category: 'domain',
        },
      } as const;

      makeCatalog(invalidDefinitions, 'TEST');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Error Catalog Warning] Namespace "TEST"'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalidCase'),
      );
    });

    it('should not log warnings in production environment', () => {
      process.env.NODE_ENV = 'production';

      const invalidDefinitions = {
        invalidCase: {
          title: 'Invalid case',
          category: 'domain',
        },
      } as const;

      makeCatalog(invalidDefinitions, 'TEST');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not log warnings for valid naming', () => {
      process.env.NODE_ENV = 'development';

      const validDefinitions = {
        VALID_CASE: {
          title: 'Valid case',
          category: 'domain',
        },
      } as const;

      makeCatalog(validDefinitions, 'TEST');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
