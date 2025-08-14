// src/shared/errors/result.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { DomainError, Result, isErr, withContext } from './error.types';
import { domainErrorToProblem, httpStatusFor } from './http.problem';

/**
 * NestJS Interceptor that automatically converts Result<T, E> returns to HTTP responses.
 *
 * When a controller method returns a Result:
 * - If Result is Ok: returns the value directly with explicit 200 status
 * - If Result is Err: sets appropriate HTTP status and returns Problem Details
 *
 * This interceptor also:
 * - Preserves request context (correlationId, tenantId, traceId) in error responses
 * - Logs all errors consistently at the HTTP boundary
 * - Provides stricter Result type validation
 *
 * This allows controllers to work with the Result pattern while maintaining
 * proper HTTP semantics for API consumers.
 *
 * @example
 * ```typescript
 * // In main.ts or module
 * app.useGlobalInterceptors(new ResultInterceptor());
 *
 * // In controller
 * @Get(':id')
 * findUser(@Param('id') id: string): Result<User, UserDomainError> {
 *   return this.userService.findById(id);
 * }
 * ```
 */
@Injectable()
export class ResultInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResultInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data: unknown) => {
        // Check if the returned data is a Result
        if (this.isResult(data)) {
          if (isErr(data)) {
            // Handle error case with context preservation and logging
            const errorWithCtx = withContext(data.error, {
              correlationId: request.headers['x-correlation-id'],
              tenantId: request.headers['x-tenant-id'],
              traceId: request.headers['x-trace-id'],
              userAgent: request.headers['user-agent'],
              ipAddress: request.ip || undefined,
              ...data.error.context, // Preserve any existing context
            });

            // Log error at the HTTP boundary for consistent monitoring
            this.logger.warn(
              {
                code: errorWithCtx.code,
                category: errorWithCtx.category,
                context: errorWithCtx.context,
                url: request.originalUrl || request.url,
                method: request.method,
              },
              `HTTP Error: ${errorWithCtx.title}`,
            );

            const status = httpStatusFor(errorWithCtx);
            const instance = request?.originalUrl || request?.url || '';

            response.status(status);
            return domainErrorToProblem(errorWithCtx, instance);
          } else {
            // Handle success case with explicit status
            response.status(200);
            return data.value;
          }
        }

        // Return data as-is if it's not a Result
        return data;
      }),
    );
  }

  /**
   * Enhanced type guard to determine if returned data is a Result.
   * Performs stricter validation to ensure error actually looks like a DomainError.
   */
  private isResult(data: unknown): data is Result<unknown, DomainError> {
    return (
      data !== null &&
      data !== undefined &&
      typeof data === 'object' &&
      'ok' in data &&
      typeof (data as Record<string, unknown>).ok === 'boolean' &&
      ((data as Record<string, unknown>).ok === true
        ? 'value' in data
        : 'error' in data &&
          this.isDomainError((data as Record<string, unknown>).error))
    );
  }

  /**
   * Type guard to validate that an error object looks like a DomainError.
   * Ensures we have the required properties before treating it as a domain error.
   */
  private isDomainError(error: unknown): error is DomainError {
    return (
      error !== null &&
      error !== undefined &&
      typeof error === 'object' &&
      'code' in error &&
      'category' in error &&
      'title' in error &&
      typeof (error as Record<string, unknown>).code === 'string' &&
      typeof (error as Record<string, unknown>).category === 'string' &&
      typeof (error as Record<string, unknown>).title === 'string' &&
      // category should be one of the valid domain error categories
      ['domain', 'validation', 'infrastructure', 'security'].includes(
        (error as Record<string, unknown>).category as string,
      )
    );
  }
}

/**
 * Decorator to apply ResultInterceptor to specific controller methods.
 * Use this for granular control instead of global registration.
 *
 * @example
 * ```typescript
 * @UseResultInterceptor()
 * @Get(':id')
 * findUser(@Param('id') id: string): Result<User, UserDomainError> {
 *   return this.userService.findById(id);
 * }
 * ```
 */
export const UseResultInterceptor = () =>
  applyDecorators(UseInterceptors(ResultInterceptor));
