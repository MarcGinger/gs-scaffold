import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { CreateProductUseCase } from '../../application/use-cases/create-product.use-case';
import { UpdateProductUseCase } from '../../application/use-cases/update-product.use-case';
import { CreateProductCommand } from '../../application/commands/create-product.command';
import { UpdateProductCommand } from '../../application/commands/update-product.command';
import {
  CreateProductDto,
  UpdateProductDto,
} from '../../application/dto/product.dto';
import {
  ProductReadModel,
  ProductListReadModel,
} from '../../application/dto/product.read-model';
import { Result, isOk } from '../../../../shared/errors/error.types';
import { v4 as uuidv4 } from 'uuid';

@Controller('catalog/products')
export class ProductController {
  constructor(
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly updateProductUseCase: UpdateProductUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProduct(
    @Body() dto: CreateProductDto,
  ): Promise<{ id: string; message: string }> {
    const command = new CreateProductCommand(
      uuidv4(), // Generate product ID
      dto.name,
      dto.sku,
      dto.price,
      dto.currency,
      dto.categoryId,
      dto.categoryName,
      dto.description,
      uuidv4(), // correlationId
      'system', // userId - should come from JWT
      'default', // tenantId - should come from JWT
    );

    const result = await this.createProductUseCase.execute(command);

    if (isOk(result)) {
      return {
        id: result.value.id.getValue(),
        message: 'Product created successfully',
      };
    } else {
      // In a real implementation, you'd map domain errors to HTTP status codes
      throw new Error(`Failed to create product: ${result.error.title}`);
    }
  }

  @Put(':id')
  async updateProduct(
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<{ message: string }> {
    const command = new UpdateProductCommand(
      productId,
      dto.name,
      dto.description,
      uuidv4(), // correlationId
      'system', // userId - should come from JWT
      'default', // tenantId - should come from JWT
    );

    const result = await this.updateProductUseCase.execute(command);

    if (isOk(result)) {
      return {
        message: 'Product updated successfully',
      };
    } else {
      throw new Error(`Failed to update product: ${result.error.title}`);
    }
  }

  @Get(':id')
  async getProduct(@Param('id') productId: string): Promise<ProductReadModel> {
    // This would typically use a query handler that reads from projections
    // For now, return a placeholder
    return {
      id: productId,
      name: 'Sample Product',
      sku: 'SAMPLE-001',
      price: 99.99,
      currency: 'USD',
      categoryId: 'cat-1',
      categoryName: 'Electronics',
      status: 'ACTIVE',
      description: 'A sample product',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
  }

  @Get()
  async listProducts(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('category') categoryId?: string,
    @Query('status') status?: string,
  ): Promise<ProductListReadModel> {
    // This would typically use a query handler that reads from projections
    // For now, return a placeholder
    return {
      products: [
        {
          id: '1',
          name: 'Sample Product 1',
          sku: 'SAMPLE-001',
          price: 99.99,
          currency: 'USD',
          status: 'ACTIVE',
        },
      ],
      total: 1,
      page,
      limit,
      totalPages: 1,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(@Param('id') productId: string): Promise<void> {
    // This would use a delete command and use case
    // For now, just a placeholder
    console.log(`Deleting product ${productId}`);
  }
}
