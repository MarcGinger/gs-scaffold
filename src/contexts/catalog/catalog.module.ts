import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Controllers
import { ProductController } from './interface/http/product.controller';

// Use Cases
import { CreateProductUseCase } from './application/use-cases/create-product.use-case';
import { UpdateProductUseCase } from './application/use-cases/update-product.use-case';

// Repositories
import { ProductRepository } from './application/ports/product.repository.port';
import { EventStoreProductRepository } from './infrastructure/persistence/eventstore-product.repository';

@Module({
  imports: [CqrsModule],
  controllers: [ProductController],
  providers: [
    // Use Cases
    CreateProductUseCase,
    UpdateProductUseCase,

    // Repository implementations
    {
      provide: ProductRepository,
      useClass: EventStoreProductRepository,
    },
  ],
  exports: [ProductRepository, CreateProductUseCase, UpdateProductUseCase],
})
export class CatalogModule {}
