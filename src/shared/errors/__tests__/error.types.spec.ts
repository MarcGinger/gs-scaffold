// src/shared/errors/__tests__/error.types.spec.ts

import {
  DomainError,
  ok,
  err,
  withContext,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
} from '../error.types';

describe('Error Types', () => {
  describe('Result Pattern', () => {
    it('should create successful results with ok()', () => {
      const result = ok('success');

      expect(result).toEqual({
        ok: true,
        value: 'success',
      });
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('should create error results with err()', () => {
      const domainError: DomainError = {
        code: 'TEST.ERROR',
        title: 'Test Error',
        category: 'domain',
      };
      const result = err(domainError);

      expect(result).toEqual({
        ok: false,
        error: domainError,
      });
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('DomainError', () => {
    it('should create domain error with required fields', () => {
      const error: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      expect(error.code).toBe('USER.NOT_FOUND');
      expect(error.title).toBe('User not found');
      expect(error.category).toBe('domain');
    });

    it('should support optional fields', () => {
      const error: DomainError = {
        code: 'USER.VALIDATION_FAILED',
        title: 'Validation failed',
        detail: 'The user data is invalid',
        category: 'validation',
        retryable: false,
        context: { field: 'email', value: 'invalid-email' },
      };

      expect(error.detail).toBe('The user data is invalid');
      expect(error.retryable).toBe(false);
      expect(error.context).toEqual({ field: 'email', value: 'invalid-email' });
    });
  });

  describe('withContext', () => {
    it('should add context to existing error', () => {
      const originalError: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
      };

      const enrichedError = withContext(originalError, {
        userId: '123',
        correlationId: 'abc-def',
      });

      expect(enrichedError.context).toEqual({
        userId: '123',
        correlationId: 'abc-def',
      });
    });

    it('should merge with existing context', () => {
      const originalError: DomainError = {
        code: 'USER.NOT_FOUND',
        title: 'User not found',
        category: 'domain',
        context: { existing: 'value' },
      };

      const enrichedError = withContext(originalError, {
        userId: '123',
      });

      expect(enrichedError.context).toEqual({
        existing: 'value',
        userId: '123',
      });
    });
  });

  describe('Result utilities', () => {
    it('should map successful results', () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);

      expect(mapped).toEqual(ok(10));
    });

    it('should not map error results', () => {
      const error: DomainError = {
        code: 'TEST.ERROR',
        title: 'Test Error',
        category: 'domain',
      };
      const result = err(error);
      const mapped = map(result, (x) => x * 2);

      expect(mapped).toEqual(result);
    });

    it('should map error results with mapErr', () => {
      const originalError: DomainError = {
        code: 'ORIGINAL.ERROR',
        title: 'Original Error',
        category: 'domain',
      };
      const result = err(originalError);

      const mapped = mapErr(result, (error) => ({
        ...error,
        code: 'MAPPED.ERROR',
        title: 'Mapped Error',
      }));

      expect(isErr(mapped) && mapped.error.code).toBe('MAPPED.ERROR');
    });

    it('should chain successful operations with andThen', () => {
      const result = ok(5);
      const chained = andThen(result, (x) => ok(x * 2));

      expect(chained).toEqual(ok(10));
    });

    it('should short-circuit on error with andThen', () => {
      const error: DomainError = {
        code: 'TEST.ERROR',
        title: 'Test Error',
        category: 'domain',
      };
      const result = err(error);
      const chained = andThen(result, (x) => ok(x * 2));

      expect(chained).toEqual(result);
    });
  });

  describe('Error Categories', () => {
    it('should support all error categories', () => {
      const categories = [
        'domain',
        'validation',
        'security',
        'application',
        'infrastructure',
      ] as const;

      categories.forEach((category) => {
        const error: DomainError = {
          code: `TEST.${category.toUpperCase()}`,
          title: `Test ${category} error`,
          category,
        };

        expect(error.category).toBe(category);
      });
    });
  });
});
