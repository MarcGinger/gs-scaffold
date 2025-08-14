import { Module } from '@nestjs/common';
import { ProductService } from './application/services/product.service';
import { ProductController } from './infrastructure/http/product.controller';
import { ProductProjectionsController } from './infrastructure/http/product-projections.controller';
import { ProductProjectionsModule } from './infrastructure/projections/product-projections.module';
import { ProductCommandsModule } from './application/commands/product-commands.module';

@Module({
  imports: [ProductProjectionsModule, ProductCommandsModule],
  controllers: [ProductController, ProductProjectionsController],
  providers: [ProductService],
})
export class ProductModule {}
