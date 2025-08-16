/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Options for property decorators
 */
interface PropOptions {
  required?: boolean;
  currency?: string;
}

/**
 * Property decorator for Product Price with required option
 * @param {Object} options - Options for the decorator
 * @returns {PropertyDecorator}
 */
export function ApiProductPrice(options: PropOptions = {}) {
  const { required = true, currency = 'USD' } = options;

  return applyDecorators(
    ApiProperty({
      description: `Product price in ${currency}`,
      example: 199.99,
      type: Number,
      minimum: 0.01,
      maximum: 999999.99,
      required,
    }),
    Type(() => Number),
    IsNumber({ maxDecimalPlaces: 2 }),
    IsPositive(),
    Min(0.01),
    Max(999999.99),
    required ? IsNotEmpty() : IsOptional(),
  );
}
