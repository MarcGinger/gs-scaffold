import { Injectable } from '@nestjs/common';
import { CreateProductCommand } from '../commands/create-product.command';
import { ProductAggregate } from '../../domain/product.aggregate';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { ProductName } from '../../domain/value-objects/product-name.vo';
import { Price } from '../../domain/value-objects/price.vo';
import { Sku } from '../../domain/value-objects/sku.vo';
import { Category } from '../../domain/value-objects/category.vo';
import { ProductRepository } from '../ports/product.repository.port';
import { EventMetadata } from '../../domain/events/product.events';
import {
  Result,
  ok,
  err,
  DomainError,
  andThen,
} from '../../../../shared/errors/error.types';

@Injectable()
export class CreateProductUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(
    command: CreateProductCommand,
  ): Promise<Result<ProductAggregate, DomainError>> {
    // Create value objects with validation
    const productIdResult = ProductId.create(command.productId);
    if (!productIdResult.ok) return productIdResult;

    const nameResult = ProductName.create(command.name);
    if (!nameResult.ok) return nameResult;

    const skuResult = Sku.create(command.sku);
    if (!skuResult.ok) return skuResult;

    const priceResult = Price.create(command.price, command.currency);
    if (!priceResult.ok) return priceResult;

    const categoryResult = Category.create(
      command.categoryId,
      command.categoryName,
    );
    if (!categoryResult.ok) return categoryResult;

    // Check if SKU already exists
    const existingProductResult = await this.productRepository.findBySku(
      skuResult.value,
    );

    if (existingProductResult.ok && existingProductResult.value) {
      return err({
        code: 'PRODUCT.DUPLICATE_SKU',
        title: 'Product SKU already exists',
        detail: 'Another product with this SKU already exists',
        category: 'domain',
        context: { sku: command.sku },
        retryable: false,
      });
    }

    // Create metadata
    const metadata: EventMetadata = {
      correlationId: command.correlationId || '',
      userId: command.userId || '',
      tenantId: command.tenantId || '',
      timestamp: new Date(),
    };

    // Create the aggregate
    const productResult = ProductAggregate.create(
      productIdResult.value,
      nameResult.value,
      skuResult.value,
      priceResult.value,
      categoryResult.value,
      metadata,
      command.description,
    );

    if (!productResult.ok) return productResult;

    // Save the aggregate
    const saveResult = await this.productRepository.save(productResult.value);
    if (!saveResult.ok) return saveResult;

    return ok(productResult.value);
  }
}
