export interface ProductFilter {
  name?: string;
  sku?: string;
  categoryId?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class ListProductsQuery {
  constructor(
    public readonly filter: ProductFilter = {},
    public readonly pagination: Pagination = { page: 1, limit: 20 },
    // Metadata
    public readonly correlationId?: string,
    public readonly userId?: string,
    public readonly tenantId?: string,
  ) {}
}
