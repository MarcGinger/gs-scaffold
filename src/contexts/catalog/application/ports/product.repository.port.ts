import { ProductAggregate } from '../../domain/product.aggregate';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Sku } from '../../domain/value-objects/sku.vo';
import { Result, DomainError } from '../../../../shared/errors/error.types';

export abstract class ProductRepository {
  abstract save(
    product: ProductAggregate,
    expectedVersion?: number,
  ): Promise<Result<void, DomainError>>;

  abstract findById(
    productId: ProductId,
  ): Promise<Result<ProductAggregate | null, DomainError>>;

  abstract findBySku(
    sku: Sku,
  ): Promise<Result<ProductAggregate | null, DomainError>>;

  abstract delete(productId: ProductId): Promise<Result<void, DomainError>>;
}
