import { ProductResponseDto } from './product-response.dto';

export class ProductListResponseDto {
  products: ProductResponseDto[];
  total: number;
  page: number;
  limit: number;
}
