import {
  ApiProductId,
  ApiProductName,
  ApiProductSKU,
  ApiProductPrice,
  ApiProductCategory,
  ApiProductStatus,
  ApiProductDescription,
  ApiCreatedAt,
  ApiUpdatedAt,
} from '../decorators';

export class ProductResponseDto {
  @ApiProductId()
  id: string;

  @ApiProductName()
  name: string;

  @ApiProductSKU()
  sku: string;

  @ApiProductPrice()
  price: number;

  currency: string;

  @ApiProductCategory()
  categoryName: string;

  @ApiProductStatus()
  status: string;

  @ApiProductDescription({ required: false })
  description?: string;

  @ApiCreatedAt()
  createdAt: string;

  @ApiUpdatedAt()
  updatedAt: string;
}

export class ProductListResponseDto {
  products: ProductResponseDto[];
  total: number;
  page: number;
  limit: number;
}
