import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeactivateProductCommand } from '../commands/deactivate-product.command';
import { ProductRepository } from '../ports/product.repository.port';
import { ProductId } from '../../domain';
import {
  Result,
  DomainError,
  isErr,
} from '../../../../shared/errors/error.types';

@CommandHandler(DeactivateProductCommand)
export class DeactivateProductHandler
  implements ICommandHandler<DeactivateProductCommand>
{
  constructor(
    @Inject(ProductRepository)
    private readonly productRepository: ProductRepository,
  ) {}

  async execute(
    command: DeactivateProductCommand,
  ): Promise<Result<void, DomainError>> {
    // Create ProductId value object
    const productIdResult = ProductId.create(command.productId);
    if (isErr(productIdResult)) {
      return productIdResult;
    }

    // Find the product
    const productResult = await this.productRepository.findById(
      productIdResult.value,
    );
    if (isErr(productResult)) {
      return productResult;
    }

    if (!productResult.value) {
      return {
        ok: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          title: 'Product not found',
          category: 'domain',
          retryable: false,
          context: { productId: command.productId },
        },
      };
    }

    // Deactivate the product
    const metadata = {
      correlationId: command.correlationId || '',
      userId: command.userId || '',
      tenantId: command.tenantId || '',
      timestamp: new Date(),
    };

    const deactivateResult = productResult.value.deactivate(metadata);
    if (isErr(deactivateResult)) {
      return deactivateResult;
    }

    // Save the updated product
    const saveResult = await this.productRepository.save(productResult.value);
    if (isErr(saveResult)) {
      return saveResult;
    }

    return { ok: true, value: undefined };
  }
}
