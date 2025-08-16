import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IListOption, ListOrder } from '../../domain/properties';

/** Represents the options for pagination of a list of items. */
export class ListOptionResponse extends IListOption {
  /** The order in which the items should be sorted. */
  @ApiProperty({
    enum: ListOrder,
    required: false,
    default: ListOrder.asc,
    description: 'The order in which the items should be sorted.',
  })
  @IsEnum(ListOrder)
  @IsOptional()
  readonly order?: ListOrder = ListOrder.asc;

  /** The page number to retrieve. */
  @ApiProperty({
    type: Number,
    format: 'int32',
    required: false,
    default: 1,
    minimum: 1,
    description: 'The page number to retrieve.',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  readonly page?: number = 1;

  /** The number of items to retrieve per page. Must be between 1 and 500. */
  @ApiProperty({
    type: Number,
    required: false,
    default: 250,
    minimum: 1,
    maximum: 500,
    format: 'int32',
    description:
      'The number of items to retrieve per page. Must be between 1 and 500.',
  })
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  @IsOptional()
  readonly size?: number = 250;
}
