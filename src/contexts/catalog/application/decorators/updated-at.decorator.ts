/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * Options for property decorators
 */
interface PropOptions {
  required?: boolean;
}

/**
 * Property decorator for Updated Date with required option
 * @param {Object} options - Options for the decorator
 * @returns {PropertyDecorator}
 */
export function ApiUpdatedAt(options: PropOptions = {}) {
  const { required = true } = options;

  return applyDecorators(
    ApiProperty({
      description: 'Date and time when the resource was last updated',
      example: '2024-01-15T14:45:00Z',
      type: String,
      format: 'date-time',
      required,
    }),
    IsDateString(),
    required ? IsNotEmpty() : IsOptional(),
  );
}
