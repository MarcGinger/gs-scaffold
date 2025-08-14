import { DomainEvent } from '../../../domain/common/events';

/**
 * Product domain events for the Product bounded context
 */

export class ProductCreatedEvent implements DomainEvent {
  readonly type = 'ecommerce.product.created.v1';
  readonly version = 1;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType = 'product';

  constructor(
    public readonly productId: string,
    public readonly name: string,
    public readonly description: string,
    public readonly price: number,
    public readonly categoryId: string,
    public readonly sku: string,
  ) {
    this.aggregateId = productId;
    this.occurredAt = new Date();
  }
}

export class ProductPriceUpdatedEvent implements DomainEvent {
  readonly type = 'ecommerce.product.price-updated.v1';
  readonly version = 1;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType = 'product';

  constructor(
    public readonly productId: string,
    public readonly oldPrice: number,
    public readonly newPrice: number,
    public readonly reason?: string,
  ) {
    this.aggregateId = productId;
    this.occurredAt = new Date();
  }
}

export class ProductDeactivatedEvent implements DomainEvent {
  readonly type = 'ecommerce.product.deactivated.v1';
  readonly version = 1;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType = 'product';

  constructor(
    public readonly productId: string,
    public readonly reason: string,
  ) {
    this.aggregateId = productId;
    this.occurredAt = new Date();
  }
}
