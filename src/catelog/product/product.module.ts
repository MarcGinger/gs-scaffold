import { Module } from '@nestjs/common';
import { ProductService } from './application/services/product.service';
import { ProductController } from './infrastructure/http/product.controller';
import { ProductProjectionsController } from './infrastructure/http/product-projections.controller';
import { RedisProjectionsModule } from '../../infrastructure/projections/redis-projections.module';

@Module({
  imports: [RedisProjectionsModule],
  controllers: [ProductController, ProductProjectionsController],
  providers: [ProductService],
})
export class ProductModule {}
