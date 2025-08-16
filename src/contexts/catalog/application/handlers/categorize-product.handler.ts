import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CategorizeProductCommand } from '../commands/categorize-product.command';
import { ProductRepository } from '../ports/product.repository.port';
import { ProductId, Category } from '../../domain';
import {
  Result,
  DomainError,
  isErr,
} from '../../../../shared/errors/error.types';

@CommandHandler(CategorizeProductCommand)
export class CategorizeProductHandler
  implements ICommandHandler<CategorizeProductCommand>
{
  constructor(
    @Inject(ProductRepository)
    private readonly productRepository: ProductRepository,
  ) {}

  async execute(
    command: CategorizeProductCommand,
  ): Promise<Result<void, DomainError>> {
    // Create ProductId value object
    const productIdResult = ProductId.create(command.productId);
    if (isErr(productIdResult)) {
      return productIdResult;
    }

    // Create Category value object
    const categoryResult = Category.create(
      command.categoryId,
      command.categoryName,
    );
    if (isErr(categoryResult)) {
      return categoryResult;
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

    // Categorize the product
    const metadata = {
      correlationId: command.correlationId || '',
      userId: command.userId || '',
      tenantId: command.tenantId || '',
      timestamp: new Date(),
    };

    const categorizeResult = productResult.value.categorize(
      categoryResult.value,
      metadata,
    );
    if (isErr(categorizeResult)) {
      return categorizeResult;
    }

    // Save the updated product
    const saveResult = await this.productRepository.save(productResult.value);
    if (isErr(saveResult)) {
      return saveResult;
    }

    return { ok: true, value: undefined };
  }
}
