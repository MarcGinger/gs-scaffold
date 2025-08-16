import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetProductQuery } from '../queries/get-product.query';
import { ProductRepository } from '../ports/product.repository.port';
import { ProductId, ProductAggregate } from '../../domain';
import {
  Result,
  DomainError,
  isErr,
} from '../../../../shared/errors/error.types';

@QueryHandler(GetProductQuery)
export class GetProductHandler implements IQueryHandler<GetProductQuery> {
  constructor(
    @Inject(ProductRepository)
    private readonly productRepository: ProductRepository,
  ) {}

  async execute(
    query: GetProductQuery,
  ): Promise<Result<ProductAggregate | null, DomainError>> {
    // Create ProductId value object
    const productIdResult = ProductId.create(query.productId);
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

    return { ok: true, value: productResult.value };
  }
}
