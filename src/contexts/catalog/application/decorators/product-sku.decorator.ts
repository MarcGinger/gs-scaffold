/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
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
 * Property decorator for Product SKU with required option
 * @param {Object} options - Options for the decorator
 * @returns {PropertyDecorator}
 */
export function ApiProductSKU(options: PropOptions = {}) {
  const { required = true } = options;

  return applyDecorators(
    ApiProperty({
      description: 'Stock Keeping Unit - unique product identifier',
      example: 'WH-PREM-001',
      type: String,
      minLength: 3,
      maxLength: 50,
      pattern: '^[A-Z0-9-]+$',
      required,
    }),
    IsString(),
    MinLength(3),
    MaxLength(50),
    Matches(/^[A-Z0-9-]+$/, {
      message: 'SKU must contain only uppercase letters, numbers, and hyphens',
    }),
    required ? IsNotEmpty() : IsOptional(),
  );
}
