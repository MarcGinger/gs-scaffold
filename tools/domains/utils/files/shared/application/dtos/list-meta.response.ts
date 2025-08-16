import { ApiProperty } from '@nestjs/swagger';

import { ListMetaParameters } from './list-meta-parameters.interface';
import { IListMeta } from '../../domain/properties';

export class ListMetaResponse extends IListMeta {
  @ApiProperty({
    description: 'Current page number (1-based)',
    example: 1,
  })
  readonly page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
  })
  readonly size: number;

  @ApiProperty({
    description: 'Total number of items across all pages',
    example: 25,
  })
  readonly itemCount: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 3,
  })
  readonly pageCount: number;

  @ApiProperty({
    description: 'Whether there is a previous page available',
    example: false,
  })
  readonly hasPreviousPage: boolean;

  @ApiProperty({
    description: 'Whether there is a next page available',
    example: true,
  })
  readonly hasNextPage: boolean;

  constructor({ pageOptionsDto, itemCount }: ListMetaParameters) {
    super();
    const page = pageOptionsDto?.page;
    const size = pageOptionsDto?.size;
    this.page = page ? +page : 1;
    this.size = size ? +size : (itemCount ?? 0);
    this.itemCount = itemCount ? itemCount : 0;
    this.pageCount = this.size ? Math.ceil(this.itemCount / this.size) : 0;
    this.hasPreviousPage = this.page > 1;
    this.hasNextPage = this.page < this.pageCount;
  }
}
