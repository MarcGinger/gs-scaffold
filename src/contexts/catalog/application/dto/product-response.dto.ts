/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNumber,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';

enum ProductStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

export class ProductResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the product',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    type: String,
    format: 'uuid',
  })
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'The display name of the product',
    example: 'Premium Wireless Headphones',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Stock Keeping Unit - unique product identifier',
    example: 'WH-PREM-001',
    type: String,
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @IsNotEmpty()
  sku: string;

  @ApiProperty({
    description: 'Product price in USD',
    example: 199.99,
    type: Number,
    minimum: 0.01,
    maximum: 999999.99,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsNotEmpty()
  price: number;

  currency: string;

  @ApiProperty({
    description: 'Product category classification',
    example: 'Electronics',
    type: String,
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @IsNotEmpty()
  categoryName: string;

  @ApiProperty({
    description: 'Current status of the product',
    example: ProductStatusEnum.ACTIVE,
    enum: ProductStatusEnum,
  })
  @IsEnum(ProductStatusEnum)
  @IsNotEmpty()
  status: string;

  @ApiProperty({
    description: 'Detailed description of the product',
    example: 'High-quality wireless headphones with noise cancellation.',
    type: String,
    minLength: 10,
    maxLength: 1000,
    required: false,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Date and time when the product was created',
    example: '2024-01-15T10:30:00Z',
    type: String,
    format: 'date-time',
  })
  @IsDateString()
  @IsNotEmpty()
  createdAt: string;

  @ApiProperty({
    description: 'Date and time when the product was last updated',
    example: '2024-01-15T14:45:00Z',
    type: String,
    format: 'date-time',
  })
  @IsDateString()
  @IsNotEmpty()
  updatedAt: string;
}

export class ProductListResponseDto {
  products: ProductResponseDto[];
  total: number;
  page: number;
  limit: number;
}
