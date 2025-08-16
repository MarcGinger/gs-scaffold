export class CreateProductDto {
  name: string;
  sku: string;
  price: number;
  currency: string = 'USD';
  categoryId: string;
  categoryName: string;
  description?: string;
}

export class UpdateProductDto {
  name?: string;
  description?: string;
}

export class ChangeProductPriceDto {
  price: number;
  currency: string;
}

export class CategorizeProductDto {
  categoryId: string;
  categoryName: string;
}
