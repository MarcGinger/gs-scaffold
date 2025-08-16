// Base event metadata interface
export interface EventMetadata {
  correlationId: string;
  userId: string;
  tenantId: string;
  timestamp?: Date;
}

// Product Created Event
export interface ProductCreatedEventPayload {
  productId: string;
  name: string;
  sku: string;
  price: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  status: string;
  description?: string;
  createdAt: Date;
  version: number;
  metadata: EventMetadata;
}

export class ProductCreatedEvent {
  public readonly eventType = 'ProductCreated';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: ProductCreatedEventPayload) {}

  get productId(): string {
    return this.payload.productId;
  }

  get name(): string {
    return this.payload.name;
  }

  get sku(): string {
    return this.payload.sku;
  }

  get price(): number {
    return this.payload.price;
  }

  get currency(): string {
    return this.payload.currency;
  }

  get categoryId(): string {
    return this.payload.categoryId;
  }

  get categoryName(): string {
    return this.payload.categoryName;
  }

  get status(): string {
    return this.payload.status;
  }

  get description(): string | undefined {
    return this.payload.description;
  }

  get createdAt(): Date {
    return this.payload.createdAt;
  }

  get version(): number {
    return this.payload.version;
  }

  get metadata(): EventMetadata {
    return this.payload.metadata;
  }
}

// Product Updated Event
export interface ProductChangeSet {
  name?: { old: string; new: string };
  description?: { old?: string; new?: string };
}

export interface ProductUpdatedEventPayload {
  productId: string;
  changes: ProductChangeSet;
  version: number;
  updatedAt: Date;
  metadata: EventMetadata;
}

export class ProductUpdatedEvent {
  public readonly eventType = 'ProductUpdated';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: ProductUpdatedEventPayload) {}

  get productId(): string {
    return this.payload.productId;
  }

  get changes(): ProductChangeSet {
    return this.payload.changes;
  }

  get version(): number {
    return this.payload.version;
  }

  get updatedAt(): Date {
    return this.payload.updatedAt;
  }

  get metadata(): EventMetadata {
    return this.payload.metadata;
  }
}

// Product Price Changed Event
export interface ProductPriceChangedEventPayload {
  productId: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
  version: number;
  changedAt: Date;
  metadata: EventMetadata;
}

export class ProductPriceChangedEvent {
  public readonly eventType = 'ProductPriceChanged';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: ProductPriceChangedEventPayload) {}

  get productId(): string {
    return this.payload.productId;
  }

  get oldPrice(): number {
    return this.payload.oldPrice;
  }

  get newPrice(): number {
    return this.payload.newPrice;
  }

  get currency(): string {
    return this.payload.currency;
  }

  get version(): number {
    return this.payload.version;
  }

  get changedAt(): Date {
    return this.payload.changedAt;
  }

  get metadata(): EventMetadata {
    return this.payload.metadata;
  }
}

// Product Categorized Event
export interface ProductCategorizedEventPayload {
  productId: string;
  oldCategoryId: string;
  newCategoryId: string;
  newCategoryName: string;
  version: number;
  categorizedAt: Date;
  metadata: EventMetadata;
}

export class ProductCategorizedEvent {
  public readonly eventType = 'ProductCategorized';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: ProductCategorizedEventPayload) {}

  get productId(): string {
    return this.payload.productId;
  }

  get oldCategoryId(): string {
    return this.payload.oldCategoryId;
  }

  get newCategoryId(): string {
    return this.payload.newCategoryId;
  }

  get newCategoryName(): string {
    return this.payload.newCategoryName;
  }

  get version(): number {
    return this.payload.version;
  }

  get categorizedAt(): Date {
    return this.payload.categorizedAt;
  }

  get metadata(): EventMetadata {
    return this.payload.metadata;
  }
}

// Product Activated Event
export interface ProductActivatedEventPayload {
  productId: string;
  activatedAt: Date;
  version: number;
  metadata: EventMetadata;
}

export class ProductActivatedEvent {
  public readonly eventType = 'ProductActivated';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: ProductActivatedEventPayload) {}

  get productId(): string {
    return this.payload.productId;
  }

  get activatedAt(): Date {
    return this.payload.activatedAt;
  }

  get version(): number {
    return this.payload.version;
  }

  get metadata(): EventMetadata {
    return this.payload.metadata;
  }
}

// Product Deactivated Event
export interface ProductDeactivatedEventPayload {
  productId: string;
  deactivatedAt: Date;
  version: number;
  metadata: EventMetadata;
}

export class ProductDeactivatedEvent {
  public readonly eventType = 'ProductDeactivated';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: ProductDeactivatedEventPayload) {}

  get productId(): string {
    return this.payload.productId;
  }

  get deactivatedAt(): Date {
    return this.payload.deactivatedAt;
  }

  get version(): number {
    return this.payload.version;
  }

  get metadata(): EventMetadata {
    return this.payload.metadata;
  }
}

// Product Deleted Event
export interface ProductDeletedEventPayload {
  productId: string;
  deletedAt: Date;
  version: number;
  metadata: EventMetadata;
}

export class ProductDeletedEvent {
  public readonly eventType = 'ProductDeleted';
  public readonly eventVersion = '1.0';

  constructor(public readonly payload: ProductDeletedEventPayload) {}

  get productId(): string {
    return this.payload.productId;
  }

  get deletedAt(): Date {
    return this.payload.deletedAt;
  }

  get version(): number {
    return this.payload.version;
  }

  get metadata(): EventMetadata {
    return this.payload.metadata;
  }
}

// Export all events for easier imports
export const ProductEvents = {
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductPriceChangedEvent,
  ProductCategorizedEvent,
  ProductActivatedEvent,
  ProductDeactivatedEvent,
  ProductDeletedEvent,
} as const;
