import {
  ApiProductName,
  ApiProductSKU,
  ApiProductPrice,
  ApiProductCurrency,
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

  @ApiProductCurrency({ required: false })
  currency: string = 'USD';

  categoryId: string;

  @ApiProductCategory()
  categoryName: string;

  @ApiProductDescription({ required: false })
  description?: string;
}
