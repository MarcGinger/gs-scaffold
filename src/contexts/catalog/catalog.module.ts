import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Import from barrel exports
import { ProductController } from './interface';
import {
  CreateProductUseCase,
  UpdateProductUseCase,
  ProductRepository,
  // Command Handlers
  CreateProductHandler,
  UpdateProductHandler,
  DeleteProductHandler,
  ActivateProductHandler,
  DeactivateProductHandler,
  CategorizeProductHandler,
  ChangeProductPricePropsHandler,
  // Query Handlers
  GetProductHandler,
  ListProductsHandler,
} from './application';
import { EventStoreProductRepository } from './infrastructure';

@Module({
  imports: [CqrsModule],
  controllers: [ProductController],
  providers: [
    // Use Cases
    CreateProductUseCase,
    UpdateProductUseCase,

    // Command Handlers
    CreateProductHandler,
    UpdateProductHandler,
    DeleteProductHandler,
    ActivateProductHandler,
    DeactivateProductHandler,
    CategorizeProductHandler,
    ChangeProductPricePropsHandler,

    // Query Handlers
    GetProductHandler,
    ListProductsHandler,

    // Repository implementations
    {
      provide: ProductRepository,
      useClass: EventStoreProductRepository,
    },
  ],
  exports: [
    ProductRepository,
    CreateProductUseCase,
    UpdateProductUseCase,
    // Handlers can be exported if needed by other modules
    CreateProductHandler,
    UpdateProductHandler,
    DeleteProductHandler,
    ActivateProductHandler,
    DeactivateProductHandler,
    CategorizeProductHandler,
    ChangeProductPricePropsHandler,
    GetProductHandler,
    ListProductsHandler,
  ],
})
export class CatalogModule {}
