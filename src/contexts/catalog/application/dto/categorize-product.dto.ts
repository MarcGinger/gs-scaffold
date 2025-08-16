import { ApiProductCategory } from '../decorators';

export class CategorizeProductDto {
  categoryId: string;

  @ApiProductCategory()
  categoryName: string;
}
