import { EventMetadata } from './event-types';

/**
 * Product Activated Event Payload
 * Contains activation timestamp and version information
 */
export interface ProductActivatedEventPayload {
  productId: string;
  activatedAt: Date;
  version: number;
  metadata: EventMetadata;
}

/**
 * Product Activated Domain Event
 *
 * Emitted when a product status changes to ACTIVE.
 * Indicates the product is now available for purchase.
 */
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
