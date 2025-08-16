// Application Layer Barrel Exports

// Commands
export { CreateProductCommand } from './commands/create-product.command';
export { UpdateProductCommand } from './commands/update-product.command';
export { DeleteProductCommand } from './commands/delete-product.command';
export { ActivateProductCommand } from './commands/activate-product.command';
export { DeactivateProductCommand } from './commands/deactivate-product.command';
export { CategorizeProductCommand } from './commands/categorize-product.command';
export { ChangeProductPriceCommand } from './commands/change-product-price.command';

// Queries
export { GetProductQuery } from './queries/get-product.query';
export { ListProductsQuery } from './queries/list-products.query';

// Handlers
export * from './handlers';

// Use Cases
export { CreateProductUseCase } from './use-cases/create-product.use-case';
export { UpdateProductUseCase } from './use-cases/update-product.use-case';

// DTOs
export {
  CreateProductDto,
  UpdateProductDto,
  ChangeProductPriceDto,
} from './dto/product.dto';
export { ProductReadModel } from './dto/product.read-model';

// Ports (Repository Interface)
export { ProductRepository } from './ports/product.repository.port';
