import { EventMetadata } from './event-types';

/**
 * Product Deactivated Event Payload
 * Contains deactivation timestamp and version information
 */
export interface ProductDeactivatedEventPayload {
  productId: string;
  deactivatedAt: Date;
  version: number;
  metadata: EventMetadata;
}

/**
 * Product Deactivated Domain Event
 *
 * Emitted when a product status changes to INACTIVE.
 * Indicates the product is temporarily unavailable for purchase.
 */
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
