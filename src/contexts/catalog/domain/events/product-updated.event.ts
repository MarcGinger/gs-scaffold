import { EventMetadata, ProductChangeSet } from './event-types';

/**
 * Product Updated Event Payload
 * Contains information about what fields were changed in the product
 */
export interface ProductUpdatedEventPayload {
  productId: string;
  changes: ProductChangeSet;
  version: number;
  updatedAt: Date;
  metadata: EventMetadata;
}

/**
 * Product Updated Domain Event
 *
 * Emitted when product information is modified.
 * Contains change tracking information and update metadata.
 */
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
