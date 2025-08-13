// src/shared/errors/result.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { DomainError, Result, isErr } from './error.types';
import { domainErrorToProblem, httpStatusFor } from './http.problem';

/**
 * NestJS Interceptor that automatically converts Result<T, E> returns to HTTP responses.
 *
 * When a controller method returns a Result:
 * - If Result is Ok: returns the value directly
 * - If Result is Err: sets appropriate HTTP status and returns Problem Details
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
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data: unknown) => {
        // Check if the returned data is a Result
        if (this.isResult(data)) {
          if (isErr(data)) {
            // Handle error case
            const error = data.error;
            const status = httpStatusFor(error);
            const instance = request?.originalUrl || request?.url || '';

            response.status(status);
            return domainErrorToProblem(error, instance);
          } else {
            // Handle success case
            return data.value;
          }
        }

        // Return data as-is if it's not a Result
        return data;
      }),
    );
  }

  /**
   * Type guard to determine if returned data is a Result.
   * Checks for the Result interface structure.
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
        : 'error' in data)
    );
  }
}

/**
 * Decorator to apply ResultInterceptor to specific controller methods.
 * Use this for granular control instead of global registration.
 *
 * @example
 * ```typescript
 * @UseInterceptors(ResultInterceptor)
 * @Get(':id')
 * findUser(@Param('id') id: string): Result<User, UserDomainError> {
 *   return this.userService.findById(id);
 * }
 * ```
 */
export const UseResultInterceptor = () => {
  // This will be implemented when needed
  return (
    target: unknown,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) => {
    // Placeholder for method decorator implementation
    return descriptor;
  };
};
