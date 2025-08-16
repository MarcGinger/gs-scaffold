import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { ListProductsQuery } from '../queries/list-products.query';
import { ProductAggregate } from '../../domain';
import { Result, DomainError } from '../../../../shared/errors/error.types';

export interface ProductListResult {
  products: ProductAggregate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<ListProductsQuery> {
  async execute(
    query: ListProductsQuery,
  ): Promise<Result<ProductListResult, DomainError>> {
    // TODO: Implement actual product listing with filters and pagination
    // For now, return empty list as placeholder
    const result: ProductListResult = {
      products: [],
      total: 0,
      page: query.pagination.page,
      limit: query.pagination.limit,
      totalPages: 0,
    };

    return { ok: true, value: result };
  }
}
