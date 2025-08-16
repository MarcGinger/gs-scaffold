export interface ProductReadModel {
  id: string;
  name: string;
  sku: string;
  price: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  status: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ProductSummaryReadModel {
  id: string;
  name: string;
  sku: string;
  price: number;
  currency: string;
  status: string;
}

export interface ProductListReadModel {
  products: ProductSummaryReadModel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
