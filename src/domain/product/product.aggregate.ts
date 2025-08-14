import { AggregateRootBase } from '../aggregates/aggregate-root.base';
import { DomainEvent } from '../events/events';
import { Result, failure } from '../events/events';
import {
  ProductCreatedEvent,
  ProductPriceUpdatedEvent,
  ProductDeactivatedEvent,
} from './product.events';

/**
 * Product aggregate state interface
 */
export interface ProductState {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  sku: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Product aggregate implementing DDD patterns with EventStore
 */
export class ProductAggregate extends AggregateRootBase {
  private state: ProductState | null = null;

  /**
   * Create a new product
   */
  static create(
    id: string,
    name: string,
    description: string,
    price: number,
    categoryId: string,
    sku: string,
  ): Result<ProductAggregate, string> {
    // Validate business rules
    if (!name || name.trim().length === 0) {
      return failure('Product name cannot be empty');
    }

    if (price < 0) {
      return failure('Product price cannot be negative');
    }

    if (!sku || sku.trim().length === 0) {
      return failure('Product SKU cannot be empty');
    }

    const aggregate = new ProductAggregate();
    const event = new ProductCreatedEvent(
      id,
      name.trim(),
      description.trim(),
      price,
      categoryId,
      sku.trim(),
    );

    aggregate.apply(event);
    return { success: true, data: aggregate };
  }

  /**
   * Update product price
   */
  updatePrice(newPrice: number, reason?: string): Result<void, string> {
    if (!this.state) {
      return failure('Product not initialized');
    }

    if (!this.state.isActive) {
      return failure('Cannot update price of inactive product');
    }

    if (newPrice < 0) {
      return failure('Price cannot be negative');
    }

    if (newPrice === this.state.price) {
      return failure('New price must be different from current price');
    }

    const event = new ProductPriceUpdatedEvent(
      this.state.id,
      this.state.price,
      newPrice,
      reason,
    );

    this.apply(event);
    return { success: true, data: undefined };
  }

  /**
   * Deactivate product
   */
  deactivate(reason: string): Result<void, string> {
    if (!this.state) {
      return failure('Product not initialized');
    }

    if (!this.state.isActive) {
      return failure('Product is already inactive');
    }

    if (!reason || reason.trim().length === 0) {
      return failure('Deactivation reason is required');
    }

    const event = new ProductDeactivatedEvent(this.state.id, reason.trim());
    this.apply(event);
    return { success: true, data: undefined };
  }

  /**
   * Get current product state (read-only)
   */
  getState(): Readonly<ProductState> | null {
    return this.state ? { ...this.state } : null;
  }

  /**
   * Restore aggregate from snapshot
   */
  restoreFromSnapshot(snapshot: ProductState, version: number): void {
    this.state = snapshot;
    this._version = version;
  }

  /**
   * Get snapshot of current state
   */
  getSnapshot(): ProductState | null {
    return this.state;
  }

  /**
   * Apply domain events to update aggregate state
   */
  protected when(event: DomainEvent): void {
    switch (event.type) {
      case 'ecommerce.product.created.v1':
        this.applyProductCreated(event as ProductCreatedEvent);
        break;
      case 'ecommerce.product.price-updated.v1':
        this.applyPriceUpdated(event as ProductPriceUpdatedEvent);
        break;
      case 'ecommerce.product.deactivated.v1':
        this.applyProductDeactivated(event as ProductDeactivatedEvent);
        break;
      default:
        // Unknown event type - log but don't fail
        console.warn(`Unknown event type: ${event.type}`);
    }
  }

  /**
   * Apply snapshot to restore aggregate state
   */
  protected applySnapshot(snapshot: any): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.state = snapshot;
  }

  /**
   * Create snapshot of current aggregate state
   */
  public createSnapshot(): ProductState | null {
    return this.state ? { ...this.state } : null;
  }

  /**
   * Validate business invariants
   */
  protected validateInvariants(): Result<void, string> {
    if (!this.state) {
      return failure('Product state not initialized');
    }

    if (this.state.price < 0) {
      return failure('Product price cannot be negative');
    }

    if (!this.state.name || this.state.name.trim().length === 0) {
      return failure('Product name cannot be empty');
    }

    if (!this.state.sku || this.state.sku.trim().length === 0) {
      return failure('Product SKU cannot be empty');
    }

    return { success: true, data: undefined };
  }

  // Private event handlers

  private applyProductCreated(event: ProductCreatedEvent): void {
    this.state = {
      id: event.productId,
      name: event.name,
      description: event.description,
      price: event.price,
      categoryId: event.categoryId,
      sku: event.sku,
      isActive: true,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
    };
  }

  private applyPriceUpdated(event: ProductPriceUpdatedEvent): void {
    if (this.state) {
      this.state.price = event.newPrice;
      this.state.updatedAt = event.occurredAt;
    }
  }

  private applyProductDeactivated(event: ProductDeactivatedEvent): void {
    if (this.state) {
      this.state.isActive = false;
      this.state.updatedAt = event.occurredAt;
    }
  }
}

/**
 * Reducer for rebuilding ProductAggregate from events
 */
export const ProductReducer = {
  initial: (): ProductState | null => null,

  apply: (
    state: ProductState | null,
    event: { type: string; data: any; metadata: any },
  ): ProductState | null => {
    switch (event.type) {
      case 'ecommerce.product.created.v1':
        return {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          id: event.data.productId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          name: event.data.name,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          description: event.data.description,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          price: event.data.price,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          categoryId: event.data.categoryId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          sku: event.data.sku,
          isActive: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          createdAt: new Date(event.data.occurredAt),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          updatedAt: new Date(event.data.occurredAt),
        };

      case 'ecommerce.product.price-updated.v1':
        return state
          ? {
              ...state,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              price: event.data.newPrice,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
              updatedAt: new Date(event.data.occurredAt),
            }
          : null;

      case 'ecommerce.product.deactivated.v1':
        return state
          ? {
              ...state,
              isActive: false,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
              updatedAt: new Date(event.data.occurredAt),
            }
          : null;

      default:
        return state;
    }
  },
};
