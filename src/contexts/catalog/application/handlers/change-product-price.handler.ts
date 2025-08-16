import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ChangeProductPriceCommand } from '../commands/change-product-price.command';
import { ProductRepository } from '../ports/product.repository.port';
import { ProductId, Price } from '../../domain';
import {
  Result,
  DomainError,
  isErr,
} from '../../../../shared/errors/error.types';

@CommandHandler(ChangeProductPriceCommand)
export class ChangeProductPriceHandler
  implements ICommandHandler<ChangeProductPriceCommand>
{
  constructor(
    @Inject(ProductRepository)
    private readonly productRepository: ProductRepository,
  ) {}

  async execute(
    command: ChangeProductPriceCommand,
  ): Promise<Result<void, DomainError>> {
    // Create ProductId value object
    const productIdResult = ProductId.create(command.productId);
    if (isErr(productIdResult)) {
      return productIdResult;
    }

    // Create Price value object
    const priceResult = Price.create(command.price, command.currency);
    if (isErr(priceResult)) {
      return priceResult;
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

    // Change the product price
    const metadata = {
      correlationId: command.correlationId || '',
      userId: command.userId || '',
      tenantId: command.tenantId || '',
      timestamp: new Date(),
    };

    const changePriceResult = productResult.value.changePrice(
      priceResult.value,
      metadata,
    );
    if (isErr(changePriceResult)) {
      return changePriceResult;
    }

    // Save the updated product
    const saveResult = await this.productRepository.save(productResult.value);
    if (isErr(saveResult)) {
      return saveResult;
    }

    return { ok: true, value: undefined };
  }
}
