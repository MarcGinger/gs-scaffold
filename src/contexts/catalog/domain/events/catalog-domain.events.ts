import { DomainEvent } from '../../../../shared/domain/events/events';
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
  public readonly type = 'ProductCreated';

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
  ) {
    super(aggregateId, version, metadata);
  }
}

export class ProductUpdatedDomainEvent extends CatalogDomainEvent {
  public readonly type = 'ProductUpdated';

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
  ) {
    super(aggregateId, version, metadata);
  }
}

export class ProductPriceChangedDomainEvent extends CatalogDomainEvent {
  public readonly type = 'ProductPriceChanged';

  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    public readonly payload: {
      oldPrice: number;
      newPrice: number;
      currency: string;
    },
  ) {
    super(aggregateId, version, metadata);
  }
}

export class ProductCategorizedDomainEvent extends CatalogDomainEvent {
  public readonly type = 'ProductCategorized';

  constructor(
    aggregateId: string,
    version: number,
    metadata: EventMetadata,
    public readonly payload: {
      oldCategoryId: string;
      newCategoryId: string;
      newCategoryName: string;
    },
  ) {
    super(aggregateId, version, metadata);
  }
}

export class ProductActivatedDomainEvent extends CatalogDomainEvent {
  public readonly type = 'ProductActivated';

  constructor(aggregateId: string, version: number, metadata: EventMetadata) {
    super(aggregateId, version, metadata);
  }
}

export class ProductDeactivatedDomainEvent extends CatalogDomainEvent {
  public readonly type = 'ProductDeactivated';

  constructor(aggregateId: string, version: number, metadata: EventMetadata) {
    super(aggregateId, version, metadata);
  }
}

export class ProductDeletedDomainEvent extends CatalogDomainEvent {
  public readonly type = 'ProductDeleted';

  constructor(aggregateId: string, version: number, metadata: EventMetadata) {
    super(aggregateId, version, metadata);
  }
}
