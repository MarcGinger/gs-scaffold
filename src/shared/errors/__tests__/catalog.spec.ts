// src/shared/errors/__tests__/catalog.spec.ts

import {
  makeCatalog,
  makeValidatedCatalog,
  validateCatalogNaming,
  mergeCatalogs,
  CatalogErrorCode,
  CatalogError,
} from '../catalog';

describe('Catalog Builder', () => {
  describe('makeCatalog', () => {
    it('should create a catalog with namespaced error codes', () => {
      const catalog = makeCatalog(
        {
          USER_NOT_FOUND: {
            title: 'User not found',
            category: 'domain' as const,
          },
          INVALID_EMAIL: {
            title: 'Invalid email format',
            category: 'validation' as const,
            retryable: false,
          },
        },
        'USER',
      );

      expect(catalog.USER_NOT_FOUND.code).toBe('USER.USER_NOT_FOUND');
      expect(catalog.USER_NOT_FOUND.title).toBe('User not found');
      expect(catalog.USER_NOT_FOUND.category).toBe('domain');

      expect(catalog.INVALID_EMAIL.code).toBe('USER.INVALID_EMAIL');
      expect(catalog.INVALID_EMAIL.title).toBe('Invalid email format');
      expect(catalog.INVALID_EMAIL.category).toBe('validation');
      expect(catalog.INVALID_EMAIL.retryable).toBe(false);
    });

    it('should preserve all original error properties', () => {
      const catalog = makeCatalog(
        {
          COMPLEX_ERROR: {
            title: 'Complex Error',
            detail: 'This is a detailed description',
            category: 'application' as const,
            retryable: true,
            context: { source: 'test' },
          },
        },
        'TEST',
      );

      const error = catalog.COMPLEX_ERROR;
      expect(error.code).toBe('TEST.COMPLEX_ERROR');
      expect(error.title).toBe('Complex Error');
      expect(error.detail).toBe('This is a detailed description');
      expect(error.category).toBe('application');
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ source: 'test' });
    });

    it('should work with different namespaces', () => {
      const userCatalog = makeCatalog(
        { USER_ERROR: { title: 'User Error', category: 'domain' as const } },
        'USER',
      );

      const orderCatalog = makeCatalog(
        { ORDER_ERROR: { title: 'Order Error', category: 'domain' as const } },
        'ORDER',
      );

      expect(userCatalog.USER_ERROR.code).toBe('USER.USER_ERROR');
      expect(orderCatalog.ORDER_ERROR.code).toBe('ORDER.ORDER_ERROR');
    });
  });

  describe('Type Helpers', () => {
    const TestCatalog = makeCatalog(
      {
        ERROR_ONE: { title: 'Error One', category: 'domain' as const },
        ERROR_TWO: { title: 'Error Two', category: 'validation' as const },
      },
      'TEST',
    );

    it('should extract error codes correctly', () => {
      type TestErrorCode = CatalogErrorCode<typeof TestCatalog>;

      // This is more of a compile-time test, but we can verify the values
      const codes: TestErrorCode[] = [
        TestCatalog.ERROR_ONE.code,
        TestCatalog.ERROR_TWO.code,
      ];

      expect(codes).toContain('TEST.ERROR_ONE');
      expect(codes).toContain('TEST.ERROR_TWO');
    });

    it('should extract errors correctly', () => {
      type TestError = CatalogError<typeof TestCatalog>;

      // Verify the errors have the expected shape
      const errors: TestError[] = [
        TestCatalog.ERROR_ONE,
        TestCatalog.ERROR_TWO,
      ];

      expect(errors[0].code).toBe('TEST.ERROR_ONE');
      expect(errors[1].code).toBe('TEST.ERROR_TWO');
    });
  });

  describe('validateCatalogNaming', () => {
    it('should pass valid UPPER_SNAKE_CASE names', () => {
      const validNames = {
        USER_NOT_FOUND: { title: 'Test', category: 'domain' as const },
        INVALID_EMAIL_FORMAT: { title: 'Test', category: 'domain' as const },
        DATABASE_CONNECTION_ERROR: {
          title: 'Test',
          category: 'domain' as const,
        },
        API_TIMEOUT: { title: 'Test', category: 'domain' as const },
        USER123_ERROR: { title: 'Test', category: 'domain' as const },
      };

      const errors = validateCatalogNaming(validNames);
      expect(errors).toHaveLength(0);
    });

    it('should fail invalid naming patterns', () => {
      const invalidNames = {
        userNotFound: { title: 'Test', category: 'domain' as const }, // camelCase
        'user-not-found': { title: 'Test', category: 'domain' as const }, // kebab-case
        'user.not.found': { title: 'Test', category: 'domain' as const }, // dot-notation
        USER_NOT_FOUND_: { title: 'Test', category: 'domain' as const }, // trailing underscore
        _USER_NOT_FOUND: { title: 'Test', category: 'domain' as const }, // leading underscore
        '123_ERROR': { title: 'Test', category: 'domain' as const }, // starts with number
      };

      const errors = validateCatalogNaming(invalidNames);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('should be UPPER_SNAKE_CASE');
    });
  });

  describe('makeValidatedCatalog', () => {
    it('should create catalog with valid names', () => {
      const catalog = makeValidatedCatalog(
        {
          USER_NOT_FOUND: {
            title: 'User not found',
            category: 'domain' as const,
          },
          INVALID_EMAIL: {
            title: 'Invalid email',
            category: 'validation' as const,
          },
        },
        'USER',
      );

      expect(catalog.USER_NOT_FOUND.code).toBe('USER.USER_NOT_FOUND');
      expect(catalog.INVALID_EMAIL.code).toBe('USER.INVALID_EMAIL');
    });

    it('should throw error with invalid names', () => {
      expect(() => {
        makeValidatedCatalog(
          {
            userNotFound: {
              title: 'User not found',
              category: 'domain' as const,
            },
          },
          'USER',
        );
      }).toThrow('Catalog validation failed for namespace "USER"');
    });
  });

  describe('mergeCatalogs', () => {
    const UserCatalog = makeCatalog(
      {
        USER_NOT_FOUND: {
          title: 'User not found',
          category: 'domain' as const,
        },
        USER_INVALID: {
          title: 'User invalid',
          category: 'validation' as const,
        },
      },
      'USER',
    );

    const OrderCatalog = makeCatalog(
      {
        ORDER_NOT_FOUND: {
          title: 'Order not found',
          category: 'domain' as const,
        },
        ORDER_INVALID: {
          title: 'Order invalid',
          category: 'validation' as const,
        },
      },
      'ORDER',
    );

    it('should merge catalogs without conflicts', () => {
      const merged = mergeCatalogs(UserCatalog, OrderCatalog);

      expect(merged.USER_NOT_FOUND.code).toBe('USER.USER_NOT_FOUND');
      expect(merged.USER_INVALID.code).toBe('USER.USER_INVALID');
      expect(merged.ORDER_NOT_FOUND.code).toBe('ORDER.ORDER_NOT_FOUND');
      expect(merged.ORDER_INVALID.code).toBe('ORDER.ORDER_INVALID');
    });

    it('should detect and throw on duplicate keys', () => {
      const ConflictCatalog = makeCatalog(
        {
          USER_NOT_FOUND: {
            title: 'Conflicting error',
            category: 'domain' as const,
          },
        },
        'CONFLICT',
      );

      expect(() => {
        mergeCatalogs(UserCatalog, ConflictCatalog);
      }).toThrow(
        'Duplicate error key "USER_NOT_FOUND" found when merging catalogs',
      );
    });

    it('should handle empty catalogs', () => {
      const EmptyCatalog = makeCatalog({}, 'EMPTY');
      const merged = mergeCatalogs(UserCatalog, EmptyCatalog);

      expect(merged.USER_NOT_FOUND.code).toBe('USER.USER_NOT_FOUND');
      expect(merged.USER_INVALID.code).toBe('USER.USER_INVALID');
    });

    it('should merge multiple catalogs', () => {
      const PaymentCatalog = makeCatalog(
        {
          PAYMENT_FAILED: {
            title: 'Payment failed',
            category: 'infrastructure' as const,
          },
        },
        'PAYMENT',
      );

      const merged = mergeCatalogs(UserCatalog, OrderCatalog, PaymentCatalog);

      expect(merged.USER_NOT_FOUND.code).toBe('USER.USER_NOT_FOUND');
      expect(merged.ORDER_NOT_FOUND.code).toBe('ORDER.ORDER_NOT_FOUND');
      expect(merged.PAYMENT_FAILED.code).toBe('PAYMENT.PAYMENT_FAILED');
    });
  });

  describe('Real-world usage patterns', () => {
    it('should support complex error definitions', () => {
      const APIErrors = makeCatalog(
        {
          RATE_LIMIT_EXCEEDED: {
            title: 'Rate limit exceeded',
            detail: 'Too many requests in the given timeframe',
            category: 'security' as const,
            retryable: true,
            context: { rateLimitType: 'requests_per_minute' },
          },
          AUTHENTICATION_REQUIRED: {
            title: 'Authentication required',
            detail: 'Valid authentication token is required',
            category: 'security' as const,
            retryable: false,
          },
          SERVICE_UNAVAILABLE: {
            title: 'Service temporarily unavailable',
            detail: 'The service is undergoing maintenance',
            category: 'infrastructure' as const,
            retryable: true,
          },
        },
        'API',
      );

      expect(APIErrors.RATE_LIMIT_EXCEEDED.code).toBe(
        'API.RATE_LIMIT_EXCEEDED',
      );
      expect(APIErrors.RATE_LIMIT_EXCEEDED.retryable).toBe(true);
      expect(APIErrors.RATE_LIMIT_EXCEEDED.context).toEqual({
        rateLimitType: 'requests_per_minute',
      });

      expect(APIErrors.AUTHENTICATION_REQUIRED.retryable).toBe(false);
      expect(APIErrors.SERVICE_UNAVAILABLE.category).toBe('infrastructure');
    });
  });
});
