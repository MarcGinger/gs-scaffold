/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * Options for property decorators
 */
interface PropOptions {
  required?: boolean;
}

/**
 * Property decorator for Product Description with required option
 * @param {Object} options - Options for the decorator
 * @returns {PropertyDecorator}
 */
export function ApiProductDescription(options: PropOptions = {}) {
  const { required = false } = options;

  return applyDecorators(
    ApiProperty({
      description: 'Detailed description of the product',
      example:
        'High-quality wireless headphones with noise cancellation and premium sound quality.',
      type: String,
      minLength: 10,
      maxLength: 1000,
      required,
    }),
    IsString(),
    MinLength(10),
    MaxLength(1000),
    required ? IsNotEmpty() : IsOptional(),
  );
}
