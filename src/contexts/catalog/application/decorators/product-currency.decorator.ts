/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

/**
 * Options for property decorators
 */
interface PropOptions {
  required?: boolean;
}

/**
 * Property decorator for Currency with required option
 * @param {Object} options - Options for the decorator
 * @returns {PropertyDecorator}
 */
export function ApiProductCurrency(options: PropOptions = {}) {
  const { required = true } = options;

  const decorators = [
    ApiProperty({
      description: 'Currency code in ISO 4217 format',
      example: 'USD',
      type: String,
      minLength: 3,
      maxLength: 3,
      pattern: '^[A-Z]{3}$',
      required,
    }),
    IsString(),
    Length(3, 3, {
      message: 'Currency code must be exactly 3 characters',
    }),
  ];

  if (required) {
    decorators.push(IsNotEmpty());
  } else {
    decorators.push(IsOptional());
  }

  return applyDecorators(...decorators);
}
