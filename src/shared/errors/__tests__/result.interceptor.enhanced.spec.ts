// src/shared/errors/__tests__/result.interceptor.enhanced.spec.ts

import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { of } from 'rxjs';
import { ResultInterceptor, UseResultInterceptor } from '../result.interceptor';
import { err, ok, withContext } from '../error.types';
import { UserErrors } from '../../../contexts/user/errors/user.errors';
import { ProblemDetails } from '../http.problem';

describe('ResultInterceptor - Enhanced Features', () => {
  let interceptor: ResultInterceptor;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: Partial<CallHandler>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResultInterceptor],
    }).compile();

    interceptor = module.get<ResultInterceptor>(ResultInterceptor);

    // Mock response object
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Mock request object with headers
    mockRequest = {
      originalUrl: '/api/users/123',
      url: '/api/users/123',
      method: 'GET',
      ip: '192.168.1.100',
      headers: {
        'x-correlation-id': 'corr-123',
        'x-tenant-id': 'tenant-abc',
        'x-trace-id': 'trace-xyz',
        'user-agent': 'Mozilla/5.0 Test Browser',
      },
    } as unknown as Partial<Request>;

    // Mock execution context
    mockExecutionContext = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;

    // Mock call handler
    mockCallHandler = {
      handle: jest.fn(),
    };

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Context Preservation', () => {
    it('should preserve request context in error responses', (done) => {
      const userError = withContext(UserErrors.USER_NOT_FOUND, {
        userId: '123',
        existingContext: 'preserved',
      });
      const errorResult = err(userError);

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(errorResult));

      interceptor
        .intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler as CallHandler,
        )
        .subscribe((result) => {
          const problemDetails = result as ProblemDetails;
          expect(problemDetails).toEqual({
            type: 'https://errors.api.example.com/user/not_found',
            title: 'User not found',
            status: 404,
            code: 'USER.NOT_FOUND',
            extensions: {
              // Original context preserved
              userId: '123',
              existingContext: 'preserved',
              // Request context added
              correlationId: 'corr-123',
              tenantId: 'tenant-abc',
              traceId: 'trace-xyz',
              userAgent: 'Mozilla/5.0 Test Browser',
              ipAddress: '192.168.1.100',
            },
            instance: '/api/users/123',
          });
          done();
        });
    });

    it('should handle missing request headers gracefully', (done) => {
      // Request without context headers
      const requestWithoutHeaders = {
        ...mockRequest,
        headers: {},
      };

      const contextWithoutHeaders = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => requestWithoutHeaders,
        }),
      } as ExecutionContext;

      const userError = UserErrors.USER_NOT_FOUND;
      const errorResult = err(userError);

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(errorResult));

      interceptor
        .intercept(contextWithoutHeaders, mockCallHandler as CallHandler)
        .subscribe((result) => {
          const problemDetails = result as ProblemDetails;
          expect(problemDetails.extensions).toEqual({
            correlationId: undefined,
            tenantId: undefined,
            traceId: undefined,
            userAgent: undefined,
            ipAddress: undefined,
          });
          done();
        });
    });
  });

  describe('Enhanced Logging', () => {
    it('should log errors consistently at HTTP boundary', (done) => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');
      const userError = withContext(UserErrors.USER_NOT_FOUND, {
        userId: '123',
      });
      const errorResult = err(userError);

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(errorResult));

      interceptor
        .intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler as CallHandler,
        )
        .subscribe(() => {
          expect(loggerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              code: 'USER.NOT_FOUND',
              category: 'domain',
              url: '/api/users/123',
              method: 'GET',
            }),
            'HTTP Error: User not found',
          );
          done();
        });
    });

    it('should not log successful responses', (done) => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');
      const successResult = ok({ id: '123', name: 'John Doe' });

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(successResult));

      interceptor
        .intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler as CallHandler,
        )
        .subscribe(() => {
          expect(loggerSpy).not.toHaveBeenCalled();
          done();
        });
    });
  });

  describe('Enhanced isResult Validation', () => {
    it('should reject objects that look like Results but have invalid errors', (done) => {
      const invalidResult = {
        ok: false,
        error: {
          // Missing required DomainError properties
          message: 'Some error',
          stack: 'Stack trace',
        },
      };

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(invalidResult));

      interceptor
        .intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler as CallHandler,
        )
        .subscribe((result) => {
          // Should return the invalid object as-is since it's not a valid Result
          expect(result).toBe(invalidResult);
          expect(mockResponse.status).not.toHaveBeenCalled();
          done();
        });
    });

    it('should accept valid DomainErrors', (done) => {
      const validResult = err(UserErrors.USER_NOT_FOUND);

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(validResult));

      interceptor
        .intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler as CallHandler,
        )
        .subscribe((result) => {
          expect(mockResponse.status).toHaveBeenCalledWith(404);
          const problemDetails = result as ProblemDetails;
          expect(problemDetails).toHaveProperty('type');
          expect(problemDetails).toHaveProperty('title');
          expect(problemDetails).toHaveProperty('status');
          expect(problemDetails).toHaveProperty('code');
          done();
        });
    });
  });

  describe('Explicit Status Codes', () => {
    it('should set explicit 200 status for successful Results', (done) => {
      const successResult = ok({ id: '123', name: 'John Doe' });

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(successResult));

      interceptor
        .intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler as CallHandler,
        )
        .subscribe((result) => {
          expect(mockResponse.status).toHaveBeenCalledWith(200);
          expect(result).toEqual({ id: '123', name: 'John Doe' });
          done();
        });
    });

    it('should not set status for non-Result responses', (done) => {
      const nonResultResponse = { message: 'Direct response' };

      (mockCallHandler.handle as jest.Mock).mockReturnValue(
        of(nonResultResponse),
      );

      interceptor
        .intercept(
          mockExecutionContext as ExecutionContext,
          mockCallHandler as CallHandler,
        )
        .subscribe((result) => {
          expect(mockResponse.status).not.toHaveBeenCalled();
          expect(result).toBe(nonResultResponse);
          done();
        });
    });
  });

  describe('UseResultInterceptor Decorator', () => {
    it('should be a function that returns a decorator', () => {
      expect(typeof UseResultInterceptor).toBe('function');

      const decorator = UseResultInterceptor();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined request properties gracefully', (done) => {
      const requestWithNulls = {
        originalUrl: null,
        url: undefined,
        method: null,
        ip: undefined,
        headers: {},
      } as unknown as Partial<Request>;

      const contextWithNulls = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => requestWithNulls,
        }),
      } as ExecutionContext;

      const errorResult = err(UserErrors.USER_NOT_FOUND);

      (mockCallHandler.handle as jest.Mock).mockReturnValue(of(errorResult));

      interceptor
        .intercept(contextWithNulls, mockCallHandler as CallHandler)
        .subscribe((result) => {
          const problemDetails = result as ProblemDetails;
          expect(problemDetails.instance).toBe('');
          expect(problemDetails.extensions).toBeDefined();
          done();
        });
    });
  });
});
