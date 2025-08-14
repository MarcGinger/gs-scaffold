import { Module } from '@nestjs/common';
import { ProductService } from './application/services/product.service';
import { ProductController } from './infrastructure/http/product.controller';
import { ProductProjectionsController } from './infrastructure/http/product-projections.controller';
import { ProductProjectionsModule } from './infrastructure/projections/product-projections.module';

@Module({
  imports: [ProductProjectionsModule],
  controllers: [ProductController, ProductProjectionsController],
  providers: [ProductService],
})
export class ProductModule {}
