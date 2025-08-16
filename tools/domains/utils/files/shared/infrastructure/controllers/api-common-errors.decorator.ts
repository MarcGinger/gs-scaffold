import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/**
 * Decorator to DRY up common error responses for all controllers.
 * Usage: @ApiCommonErrors() above your route handler or controller class.
 */
export function ApiCommonErrors() {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Bad Request. Invalid input or business rule violation.',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized. Authentication required.',
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden. Insufficient permissions.',
    }),
    ApiResponse({
      status: 404,
      description: 'Not Found. Resource does not exist.',
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict. Resource already exists or state conflict.',
    }),
    ApiResponse({ status: 500, description: 'Internal Server Error.' }),
  );
}
