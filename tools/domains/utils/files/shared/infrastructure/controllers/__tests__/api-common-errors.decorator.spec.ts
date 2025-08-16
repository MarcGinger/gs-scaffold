import { ApiCommonErrors } from '../api-common-errors.decorator';
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

jest.mock('@nestjs/common', () => ({
  applyDecorators: jest.fn(),
}));

jest.mock('@nestjs/swagger', () => ({
  ApiResponse: jest.fn((config: { status: number; description: string }) => ({
    status: config.status,
    description: config.description,
  })),
}));

describe('ApiCommonErrors Decorator', () => {
  it('should call applyDecorators with correct ApiResponse configurations', () => {
    ApiCommonErrors();

    expect(applyDecorators).toHaveBeenCalledWith(
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
  });
});
