import {
  ApiProductName,
  ApiProductSKU,
  ApiProductPrice,
  ApiProductCategory,
  ApiProductDescription,
} from '../decorators';

export class CreateProductDto {
  @ApiProductName()
  name: string;

  @ApiProductSKU()
  sku: string;

  @ApiProductPrice()
  price: number;

  currency: string = 'USD';

  categoryId: string;

  @ApiProductCategory()
  categoryName: string;

  @ApiProductDescription({ required: false })
  description?: string;
}
