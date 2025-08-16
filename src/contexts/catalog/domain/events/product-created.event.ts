import { EventMetadata } from './event-types';

/**
 * Product Created Event Payload
 * Contains all data related to product creation
 */
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

/**
 * Product Created Domain Event
 *
 * Emitted when a new product is successfully created in the catalog.
 * Contains complete product information and creation metadata.
 */
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
