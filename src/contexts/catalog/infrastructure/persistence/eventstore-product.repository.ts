import { Injectable } from '@nestjs/common';
import { ProductRepository } from '../../application/ports/product.repository.port';
import { ProductAggregate } from '../../domain/product.aggregate';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Sku } from '../../domain/value-objects/sku.vo';
import {
  Result,
  ok,
  err,
  DomainError,
  fromError,
} from '../../../../shared/errors/error.types';

@Injectable()
export class EventStoreProductRepository extends ProductRepository {
  // This is a simplified implementation
  // In a real implementation, this would integrate with EventStoreDB
  private products = new Map<string, ProductAggregate>();

  async save(
    product: ProductAggregate,
    expectedVersion?: number,
  ): Promise<Result<void, DomainError>> {
    try {
      // In a real implementation, this would:
      // 1. Check expected version against current version
      // 2. Save uncommitted events to EventStoreDB
      // 3. Mark events as committed on the aggregate

      if (
        expectedVersion !== undefined &&
        product.version !== expectedVersion
      ) {
        return err({
          code: 'PRODUCT.VERSION_CONFLICT',
          title: 'Product version conflict',
          detail: 'Product has been modified by another process',
          category: 'domain',
          context: {
            expectedVersion,
            currentVersion: product.version,
            productId: product.id.getValue(),
          },
          retryable: true,
        });
      }

      // Store the product (in-memory for this example)
      this.products.set(product.id.getValue(), product);

      // Mark events as committed
      product.markEventsAsCommitted();

      return ok(undefined);
    } catch (error) {
      return err(
        fromError(
          {
            code: 'PRODUCT.PERSISTENCE_ERROR',
            title: 'Product persistence error',
            detail: 'Failed to save product to event store',
            category: 'infrastructure',
            retryable: true,
          },
          error,
          { productId: product.id.getValue() },
        ),
      );
    }
  }

  async findById(
    productId: ProductId,
  ): Promise<Result<ProductAggregate | null, DomainError>> {
    try {
      // In a real implementation, this would:
      // 1. Load events from EventStoreDB for this aggregate
      // 2. Replay events to reconstruct the aggregate
      // 3. Handle snapshots for performance

      const product = this.products.get(productId.getValue());
      return ok(product || null);
    } catch (error) {
      return err(
        fromError(
          {
            code: 'PRODUCT.PERSISTENCE_ERROR',
            title: 'Product persistence error',
            detail: 'Failed to load product from event store',
            category: 'infrastructure',
            retryable: true,
          },
          error,
          { productId: productId.getValue() },
        ),
      );
    }
  }

  async findBySku(
    sku: Sku,
  ): Promise<Result<ProductAggregate | null, DomainError>> {
    try {
      // In a real implementation, this might use a projection
      // or maintain an index for SKU lookups

      for (const product of this.products.values()) {
        if (product.sku.equals(sku)) {
          return ok(product);
        }
      }

      return ok(null);
    } catch (error) {
      return err(
        fromError(
          {
            code: 'PRODUCT.PERSISTENCE_ERROR',
            title: 'Product persistence error',
            detail: 'Failed to find product by SKU',
            category: 'infrastructure',
            retryable: true,
          },
          error,
          { sku: sku.getValue() },
        ),
      );
    }
  }

  async delete(productId: ProductId): Promise<Result<void, DomainError>> {
    try {
      // In a real implementation, you might mark the stream as deleted
      // rather than actually deleting events

      this.products.delete(productId.getValue());
      return ok(undefined);
    } catch (error) {
      return err(
        fromError(
          {
            code: 'PRODUCT.PERSISTENCE_ERROR',
            title: 'Product persistence error',
            detail: 'Failed to delete product',
            category: 'infrastructure',
            retryable: true,
          },
          error,
          { productId: productId.getValue() },
        ),
      );
    }
  }
}
