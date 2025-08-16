/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

/**
 * Options for property decorators
 */
interface PropOptions {
  required?: boolean;
}

/**
 * Property decorator for Product ID with required option
 * @param {Object} options - Options for the decorator
 * @returns {PropertyDecorator}
 */
export function ApiProductId(options: PropOptions = {}) {
  const { required = true } = options;

  return applyDecorators(
    ApiProperty({
      description: 'Unique identifier for the product',
      example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      type: String,
      format: 'uuid',
      required,
    }),
    IsUUID('4'),
    required ? IsNotEmpty() : IsOptional(),
  );
}
