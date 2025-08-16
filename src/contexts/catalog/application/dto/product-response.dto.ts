import {
  ApiProductId,
  ApiProductName,
  ApiProductSKU,
  ApiProductPrice,
  ApiProductCurrency,
  ApiProductCategory,
  ApiProductStatus,
  ApiProductDescription,
  ApiCreatedAt,
  ApiUpdatedAt,
} from '../decorators';
import { ChangeProductPriceProps } from '../../domain';

export class ProductResponseDto implements ChangeProductPriceProps {
  @ApiProductId()
  id: string;

  @ApiProductName()
  name: string;

  @ApiProductSKU()
  sku: string;

  @ApiProductPrice()
  price: number;

  @ApiProductCurrency()
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
