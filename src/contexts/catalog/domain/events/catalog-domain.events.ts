import { DomainEvent } from '../../../../shared/domain/events/events';
// EventMetadata intentionally not referenced here; event constructors accept `any` for metadata
import { EventMetadata } from './product.events';

export abstract class CatalogDomainEvent implements DomainEvent {
  public readonly aggregateType = 'Product';

  constructor(
    public readonly aggregateId: string,
    public readonly version: number,
    public readonly metadata: EventMetadata,
    public readonly occurredAt: Date = new Date(),
  ) {}

  abstract get type(): string;
}

export class ProductCreatedDomainEvent extends CatalogDomainEvent {
  public static readonly TYPE = 'ProductCreated';
  public readonly type = ProductCreatedDomainEvent.TYPE;

  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    public readonly payload: {
      name: string;
      sku: string;
      price: number;
      currency: string;
      categoryId: string;
      categoryName: string;
      status: string;
      description?: string;
    },
    occurredAt?: Date,
  ) {
    super(aggregateId, version, metadata, occurredAt);
  }
}

export class ProductUpdatedDomainEvent extends CatalogDomainEvent {
  public static readonly TYPE = 'ProductUpdated';
  public readonly type = ProductUpdatedDomainEvent.TYPE;

  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    public readonly payload: {
      changes: {
        name?: { old: string; new: string };
        description?: { old?: string; new?: string };
      };
    },
    occurredAt?: Date,
  ) {
    super(aggregateId, version, metadata, occurredAt);
  }
}

export class ProductPriceChangedDomainEvent extends CatalogDomainEvent {
  public static readonly TYPE = 'ProductPriceChanged';
  public readonly type = ProductPriceChangedDomainEvent.TYPE;

  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    public readonly payload: {
      oldPrice: number;
      newPrice: number;
      currency: string;
    },
    occurredAt?: Date,
  ) {
    super(aggregateId, version, metadata, occurredAt);
  }
}

export class ProductCategorizedDomainEvent extends CatalogDomainEvent {
  public static readonly TYPE = 'ProductCategorized';
  public readonly type = ProductCategorizedDomainEvent.TYPE;

  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    public readonly payload: {
      oldCategoryId: string;
      newCategoryId: string;
      newCategoryName: string;
    },
    occurredAt?: Date,
  ) {
    super(aggregateId, version, metadata, occurredAt);
  }
}

export class ProductActivatedDomainEvent extends CatalogDomainEvent {
  public static readonly TYPE = 'ProductActivated';
  public readonly type = ProductActivatedDomainEvent.TYPE;
  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    occurredAt?: Date,
  ) {
    super(aggregateId, version, metadata, occurredAt);
  }
}

export class ProductDeactivatedDomainEvent extends CatalogDomainEvent {
  public static readonly TYPE = 'ProductDeactivated';
  public readonly type = ProductDeactivatedDomainEvent.TYPE;
  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    occurredAt?: Date,
  ) {
    super(aggregateId, version, metadata, occurredAt);
  }
}

export class ProductDeletedDomainEvent extends CatalogDomainEvent {
  public static readonly TYPE = 'ProductDeleted';
  public readonly type = ProductDeletedDomainEvent.TYPE;
  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    occurredAt?: Date,
  ) {
    super(aggregateId, version, metadata, occurredAt);
  }
}
