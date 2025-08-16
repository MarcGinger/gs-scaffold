import { EventMetadata } from './event-types';

/**
 * Product Price Changed Event Payload
 * Contains old and new price information with currency details
 */
export interface ProductPriceChangedEventPayload {
  productId: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
  version: number;
  changedAt: Date;
  metadata: EventMetadata;
}

/**
 * Product Price Changed Domain Event
 *
 * Emitted when a product's price is modified.
 * Contains price change tracking and currency information.
 */
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
