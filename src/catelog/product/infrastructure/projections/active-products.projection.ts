import { Injectable, Inject } from '@nestjs/common';
import type { Logger } from 'pino';
import { ProductRedisProjectionService } from './product-redis-projection.service';
import { Log } from '../../../../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../../../../shared/logging/logging.providers';

export interface ActiveProductSummary {
  productId: string;
  name: string;
  sku: string;
  price: number;
  categoryId: string;
  activatedAt: string;
}

/**
 * Active Products Projection Handler
 *
 * Maintains a fast lookup of all active products for:
 * - Homepage product listings
 * - Quick availability checks
 * - Category filtering
 * - Search auto-complete
 */
@Injectable()
export class ActiveProductsProjection {
  private readonly projectionType = 'active-products';

  constructor(
    private readonly redisService: ProductRedisProjectionService,
    @Inject(APP_LOGGER) private readonly baseLogger: Logger,
  ) {}

  /**
   * Handle ProductCreatedEvent - Add to active products
   */
  async handleProductCreated(event: {
    type: string;
    data: {
      productId: string;
      name: string;
      sku: string;
      price: number;
      categoryId: string;
    };
    metadata: {
      eventId: string;
      streamId: string;
      revision: string;
      eventSequence: number;
      occurredAt: string;
    };
  }): Promise<void> {
    const activeProduct: ActiveProductSummary = {
      productId: event.data.productId,
      name: event.data.name,
      sku: event.data.sku,
      price: event.data.price,
      categoryId: event.data.categoryId,
      activatedAt: event.metadata.occurredAt,
    };

    await this.redisService.storeProjection(
      this.projectionType,
      event.data.productId,
      activeProduct,
      {
        version: 1,
        lastUpdated: new Date().toISOString(),
        eventSequence: event.metadata.eventSequence,
        sourceEvent: {
          streamId: event.metadata.streamId,
          revision: event.metadata.revision,
          eventId: event.metadata.eventId,
          eventType: event.type,
        },
      },
    );

    Log.info(this.baseLogger, 'active.product.added', {
      component: 'ActiveProductsProjection',
      method: 'handleProductCreated',
      productId: event.data.productId,
      sku: event.data.sku,
      categoryId: event.data.categoryId,
    });
  }

  /**
   * Handle ProductPriceUpdatedEvent - Update price in active products
   */
  async handleProductPriceUpdated(event: {
    type: string;
    data: {
      productId: string;
      newPrice: number;
    };
    metadata: {
      eventId: string;
      streamId: string;
      revision: string;
      eventSequence: number;
      occurredAt: string;
    };
  }): Promise<void> {
    const existingProjection =
      await this.redisService.getProjection<ActiveProductSummary>(
        this.projectionType,
        event.data.productId,
      );

    if (!existingProjection) {
      Log.debug(this.baseLogger, 'active.product.not.found.for.price.update', {
        component: 'ActiveProductsProjection',
        method: 'handleProductPriceUpdated',
        productId: event.data.productId,
      });
      return; // Product might be inactive, skip update
    }

    const updatedProduct: ActiveProductSummary = {
      ...existingProjection.data,
      price: event.data.newPrice,
    };

    await this.redisService.storeProjection(
      this.projectionType,
      event.data.productId,
      updatedProduct,
      {
        version: existingProjection.metadata.version + 1,
        lastUpdated: new Date().toISOString(),
        eventSequence: event.metadata.eventSequence,
        sourceEvent: {
          streamId: event.metadata.streamId,
          revision: event.metadata.revision,
          eventId: event.metadata.eventId,
          eventType: event.type,
        },
      },
    );

    Log.info(this.baseLogger, 'active.product.price.updated', {
      component: 'ActiveProductsProjection',
      method: 'handleProductPriceUpdated',
      productId: event.data.productId,
      newPrice: event.data.newPrice,
    });
  }

  /**
   * Handle ProductDeactivatedEvent - Remove from active products
   */
  async handleProductDeactivated(event: {
    type: string;
    data: {
      productId: string;
      reason: string;
    };
    metadata: {
      eventId: string;
      streamId: string;
      revision: string;
      eventSequence: number;
      occurredAt: string;
    };
  }): Promise<void> {
    await this.redisService.deleteProjection(
      this.projectionType,
      event.data.productId,
    );

    Log.info(this.baseLogger, 'active.product.removed', {
      component: 'ActiveProductsProjection',
      method: 'handleProductDeactivated',
      productId: event.data.productId,
      reason: event.data.reason,
    });
  }

  /**
   * Get all active products
   */
  async getActiveProducts(limit = 50, offset = 0) {
    const result =
      await this.redisService.queryProjections<ActiveProductSummary>(
        this.projectionType,
        {
          limit,
          offset,
          sortBy: 'name',
          sortOrder: 'asc',
        },
      );

    return {
      products: result.data.map((item) => item.data),
      total: result.total,
      hasMore: result.hasMore,
      metadata: result.metadata,
    };
  }

  /**
   * Get active products by category
   */
  async getActiveProductsByCategory(
    categoryId: string,
    limit = 20,
    offset = 0,
  ) {
    const result =
      await this.redisService.queryProjections<ActiveProductSummary>(
        this.projectionType,
        {
          filters: { categoryId },
          limit,
          offset,
          sortBy: 'name',
          sortOrder: 'asc',
        },
      );

    return {
      products: result.data.map((item) => item.data),
      total: result.total,
      hasMore: result.hasMore,
      metadata: result.metadata,
    };
  }

  /**
   * Check if product is active
   */
  async isProductActive(productId: string): Promise<boolean> {
    const projection =
      await this.redisService.getProjection<ActiveProductSummary>(
        this.projectionType,
        productId,
      );

    return !!projection;
  }

  /**
   * Get active product count
   */
  async getActiveProductCount(): Promise<number> {
    const stats = await this.redisService.getProjectionStats(
      this.projectionType,
    );
    return stats.count;
  }

  /**
   * Get product names for autocomplete
   */
  async getProductNamesForAutocomplete(
    namePrefix: string,
    limit = 10,
  ): Promise<string[]> {
    const result =
      await this.redisService.queryProjections<ActiveProductSummary>(
        this.projectionType,
        {
          limit: 100, // Get more to filter locally
        },
      );

    const prefix = namePrefix.toLowerCase();
    return result.data
      .map((item) => item.data.name)
      .filter((name) => name.toLowerCase().startsWith(prefix))
      .slice(0, limit);
  }
}
