import { ApiProductPrice } from '../decorators';

export class ChangeProductPriceDto {
  @ApiProductPrice()
  price: number;

  currency: string;
}
