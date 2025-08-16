import { Injectable } from '@nestjs/common';
import { UpdateProductCommand } from '../commands/update-product.command';
import { ProductAggregate } from '../../domain/product.aggregate';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { ProductName } from '../../domain/value-objects/product-name.vo';
import { ProductRepository } from '../ports/product.repository.port';
import { EventMetadata } from '../../domain/events/product.events';
import {
  Result,
  ok,
  err,
  DomainError,
  isOk,
} from '../../../../shared/errors/error.types';
import { ProductErrors } from '../../domain/errors/product.errors';

@Injectable()
export class UpdateProductUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(
    command: UpdateProductCommand,
  ): Promise<Result<ProductAggregate, DomainError>> {
    // Create value objects with validation
    const productIdResult = ProductId.create(command.productId);
    if (!isOk(productIdResult)) return productIdResult;

    // Load the aggregate
    const productResult = await this.productRepository.findById(
      productIdResult.value,
    );
    if (!isOk(productResult)) return productResult;

    if (!productResult.value) {
      return err(ProductErrors.PRODUCT_NOT_FOUND);
    }

    const product = productResult.value;

    // Create metadata
    const metadata: EventMetadata = {
      correlationId: command.correlationId || '',
      userId: command.userId || '',
      tenantId: command.tenantId || '',
      timestamp: new Date(),
    };

    // Update name if provided
    if (command.name !== undefined) {
      const nameResult = ProductName.create(command.name);
      if (!isOk(nameResult)) return nameResult;

      const updateResult = product.updateDetails(
        nameResult.value,
        command.description,
        metadata,
      );
      if (!isOk(updateResult)) return updateResult;
    } else if (command.description !== undefined) {
      // Update only description
      const updateResult = product.updateDetails(
        product.name,
        command.description,
        metadata,
      );
      if (!isOk(updateResult)) return updateResult;
    }

    // Save the aggregate
    const saveResult = await this.productRepository.save(product);
    if (!isOk(saveResult)) return saveResult;

    return ok(product);
  }
}
