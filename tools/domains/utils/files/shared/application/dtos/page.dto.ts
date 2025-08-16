import { IsArray } from 'class-validator';
import { ListMetaResponse } from './list-meta.response';

export class ListDto<T> {
  @IsArray()
  readonly data: T[];

  readonly meta: ListMetaResponse;

  constructor(data: T[], meta: ListMetaResponse) {
    this.data = data;
    this.meta = meta;
  }
}
