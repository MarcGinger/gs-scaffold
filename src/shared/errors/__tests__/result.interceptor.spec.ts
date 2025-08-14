// src/shared/errors/__tests__/result.interceptor.spec.ts

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { of } from 'rxjs';
import { err, ok, Result } from '../error.types';
import { ResultInterceptor } from '../result.interceptor';
import { UserErrors } from '../../../contexts/user/errors/user.errors';
import { OrderErrors } from '../../../contexts/order/errors/order.errors';
import { withContext } from '../error.types';

describe('ResultInterceptor', () => {
  let interceptor: ResultInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let mockResponse: Partial<Response>;
  let mockRequest: { originalUrl?: string; url?: string };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ResultInterceptor],
    }).compile();

    interceptor = module.get<ResultInterceptor>(ResultInterceptor);

    // Mock response object
    mockResponse = {
      status: jest.fn().mockReturnThis(),
    };

    // Mock request object
    mockRequest = {
      originalUrl: '/api/users/123',
      url: '/api/users/123',
    };

    // Mock execution context
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;

    // Mock call handler
    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  describe('when controller returns successful Result', () => {
    it('should return the value directly', (done) => {
      const testValue = { id: '123', name: 'John Doe' };
      const successResult = ok(testValue);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(successResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(testValue);
          expect(mockResponse.status).not.toHaveBeenCalled();
          done();
        });
    });

    it('should handle primitive values in Result', (done) => {
      const primitiveValue = 'test-string';
      const successResult = ok(primitiveValue);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(successResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBe(primitiveValue);
          done();
        });
    });

    it('should handle null values in Result', (done) => {
      const successResult = ok(null);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(successResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBeNull();
          done();
        });
    });
  });

  describe('when controller returns error Result', () => {
    it('should set HTTP status and return Problem Details for User errors', (done) => {
      const userError = withContext(UserErrors.USER_NOT_FOUND, {
        userId: '123',
      });
      const errorResult = err(userError);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(errorResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(mockResponse.status).toHaveBeenCalledWith(
            HttpStatus.NOT_FOUND,
          );
          expect(result).toEqual({
            type: 'https://errors.api.example.com/user/user_not_found',
            title: 'User not found',
            status: 404,
            detail: 'The specified user does not exist or is not accessible.',
            instance: '/api/users/123',
            code: 'USER.USER_NOT_FOUND',
            extensions: { userId: '123' },
          });
          done();
        });
    });

    it('should set HTTP status and return Problem Details for Order errors', (done) => {
      const orderError = withContext(OrderErrors.INSUFFICIENT_INVENTORY, {
        itemId: 'ITEM123',
        requested: 5,
        available: 2,
      });
      const errorResult = err(orderError);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(errorResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(mockResponse.status).toHaveBeenCalledWith(
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
          expect(result).toEqual({
            type: 'https://errors.api.example.com/order/insufficient_inventory',
            title: 'Insufficient inventory',
            status: 422,
            detail: 'Not enough inventory available to fulfill this order.',
            instance: '/api/users/123',
            code: 'ORDER.INSUFFICIENT_INVENTORY',
            extensions: {
              itemId: 'ITEM123',
              requested: 5,
              available: 2,
            },
          });
          done();
        });
    });

    it('should handle missing originalUrl gracefully', (done) => {
      const userError = withContext(UserErrors.USER_NOT_FOUND, {
        userId: '123',
      });
      const errorResult = err(userError);

      // Remove originalUrl but keep url
      mockRequest = { url: '/fallback-url' };
      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      });

      mockCallHandler.handle = jest.fn().mockReturnValue(of(errorResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          const problemDetails = result as Record<string, unknown>;
          expect(problemDetails.instance).toBe('/fallback-url');
          done();
        });
    });

    it('should handle missing request URL properties gracefully', (done) => {
      const userError = withContext(UserErrors.USER_NOT_FOUND, {
        userId: '123',
      });
      const errorResult = err(userError);

      // Remove both originalUrl and url
      mockRequest = {};
      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      });

      mockCallHandler.handle = jest.fn().mockReturnValue(of(errorResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          const problemDetails = result as Record<string, unknown>;
          // Check that the request passed through correctly despite missing URL fields
          expect(problemDetails.code).toBe('USER.USER_NOT_FOUND');
          expect(problemDetails.extensions).toEqual({ userId: '123' });
          done();
        });
    });
  });

  describe('when controller returns non-Result data', () => {
    it('should pass through regular objects unchanged', (done) => {
      const regularData = { message: 'Hello World' };

      mockCallHandler.handle = jest.fn().mockReturnValue(of(regularData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(regularData);
          expect(mockResponse.status).not.toHaveBeenCalled();
          done();
        });
    });

    it('should pass through primitive values unchanged', (done) => {
      const primitiveData = 'Hello World';

      mockCallHandler.handle = jest.fn().mockReturnValue(of(primitiveData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBe(primitiveData);
          done();
        });
    });

    it('should pass through arrays unchanged', (done) => {
      const arrayData = [1, 2, 3];

      mockCallHandler.handle = jest.fn().mockReturnValue(of(arrayData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(arrayData);
          done();
        });
    });

    it('should pass through null values unchanged', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of(null));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBeNull();
          done();
        });
    });

    it('should pass through undefined values unchanged', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of(undefined));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBeUndefined();
          done();
        });
    });
  });

  describe('Result type detection', () => {
    it('should correctly identify valid Ok Results', (done) => {
      const validResult = ok({ test: 'data' });

      mockCallHandler.handle = jest.fn().mockReturnValue(of(validResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual({ test: 'data' });
          done();
        });
    });

    it('should correctly identify valid Err Results', (done) => {
      const errorResult = err(UserErrors.USER_NOT_FOUND);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(errorResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          const problemDetails = result as Record<string, unknown>;
          expect(problemDetails.code).toBe('USER.USER_NOT_FOUND');
          done();
        });
    });

    it('should not treat objects with similar structure as Results', (done) => {
      const fakeResult = {
        ok: true,
        data: 'not a real result',
        // Missing 'value' property
      };

      mockCallHandler.handle = jest.fn().mockReturnValue(of(fakeResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(fakeResult);
          done();
        });
    });

    it('should not treat objects with non-boolean ok property as Results', (done) => {
      const fakeResult = {
        ok: 'not-boolean',
        value: 'some data',
      };

      mockCallHandler.handle = jest.fn().mockReturnValue(of(fakeResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(fakeResult);
          done();
        });
    });
  });

  describe('edge cases', () => {
    it('should handle complex nested objects in successful Results', (done) => {
      const complexValue = {
        user: {
          id: '123',
          profile: {
            name: 'John',
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        metadata: {
          timestamp: '2023-01-01',
          version: 1,
        },
      };
      const successResult = ok(complexValue);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(successResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(complexValue);
          done();
        });
    });

    it('should handle Results with empty objects', (done) => {
      const emptyObject = {};
      const successResult = ok(emptyObject);

      mockCallHandler.handle = jest.fn().mockReturnValue(of(successResult));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toEqual(emptyObject);
          done();
        });
    });
  });
});

describe('ResultInterceptor integration scenarios', () => {
  let interceptor: ResultInterceptor;

  beforeEach(() => {
    interceptor = new ResultInterceptor();
  });

  it('should demonstrate typical controller integration pattern', (done) => {
    // Simulate what a real controller method would return
    const mockUserServiceResponse: Result<
      { id: string; email: string },
      (typeof UserErrors)[keyof typeof UserErrors]
    > = ok({ id: '123', email: 'user@example.com' });

    const mockContext = {
      switchToHttp: () => ({
        getResponse: () => ({ status: jest.fn().mockReturnThis() }),
        getRequest: () => ({ originalUrl: '/api/users/123' }),
      }),
    } as ExecutionContext;

    const mockHandler = {
      handle: () => of(mockUserServiceResponse),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(result).toEqual({ id: '123', email: 'user@example.com' });
      done();
    });
  });
});
