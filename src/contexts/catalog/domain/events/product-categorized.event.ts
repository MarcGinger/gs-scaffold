import { EventMetadata } from './event-types';

/**
 * Product Categorized Event Payload
 * Contains category change information
 */
export interface ProductCategorizedEventPayload {
  productId: string;
  oldCategoryId: string;
  newCategoryId: string;
  newCategoryName: string;
  version: number;
  categorizedAt: Date;
  metadata: EventMetadata;
}

/**
 * Product Categorized Domain Event
 *
 * Emitted when a product is moved to a different category.
 * Contains category change tracking information.
 */
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
