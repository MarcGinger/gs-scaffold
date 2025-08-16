import { ApiProductPrice, ApiProductCurrency } from '../decorators';
import { ChangeProductPriceProps } from '../../domain';

export class ChangeProductPricePropsDto implements ChangeProductPriceProps {
  @ApiProductPrice()
  price: number;

  @ApiProductCurrency()
  currency: string;
}
