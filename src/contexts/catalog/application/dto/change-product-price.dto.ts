import { ApiProductPrice, ApiProductCurrency } from '../decorators';
import { ChangeProductPrice } from '../../domain';

export class ChangeProductPriceDto implements ChangeProductPrice {
  @ApiProductPrice()
  price: number;

  @ApiProductCurrency()
  currency: string;
}
