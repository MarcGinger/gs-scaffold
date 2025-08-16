/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ProductStatusType } from '../../domain/types/product-status.types';

/**
 * Options for property decorators
 */
interface PropOptions {
  required?: boolean;
}

/**
 * Property decorator for Product Status with required option
 * @param {Object} options - Options for the decorator
 * @returns {PropertyDecorator}
 */
export function ApiProductStatus(options: PropOptions = {}) {
  const { required = true } = options;

  return applyDecorators(
    ApiProperty({
      description: 'Current status of the product',
      example: ProductStatusType.ACTIVE,
      enum: ProductStatusType,
      type: String,
      required,
    }),
    IsEnum(ProductStatusType),
    required ? IsNotEmpty() : IsOptional(),
  );
}
