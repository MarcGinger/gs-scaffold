import { ApiProductName, ApiProductDescription } from '../decorators';

export class UpdateProductDto {
  @ApiProductName({ required: false })
  name?: string;

  @ApiProductDescription({ required: false })
  description?: string;
}
