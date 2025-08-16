import { EventMetadata } from './event-types';

/**
 * Product Deleted Event Payload
 * Contains deletion timestamp and version information
 */
export interface ProductDeletedEventPayload {
  productId: string;
  deletedAt: Date;
  version: number;
  metadata: EventMetadata;
}

/**
 * Product Deleted Domain Event
 *
 * Emitted when a product is marked as deleted.
 * This is typically a soft delete operation in the domain.
 */
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
