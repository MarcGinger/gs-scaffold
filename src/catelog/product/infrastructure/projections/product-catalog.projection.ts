import { Injectable, Inject } from '@nestjs/common';
import type { Logger } from 'pino';
import { ProductRedisProjectionService } from './product-redis-projection.service';
import { APP_LOGGER } from 'src/shared/logging/logging.providers';
import { Log } from 'src/shared/logging/structured-logger';

export interface ProductCatalogItem {
  productId: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  sku: string;
  isActive: boolean;
  createdAt: string;
  lastPriceUpdate?: {
    oldPrice: number;
    newPrice: number;
    updatedAt: string;
    reason?: string;
  };
  deactivatedAt?: string;
  deactivationReason?: string;
}

/**
 * Product Catalog Projection Handler
 *
 * Maintains a denormalized view of all products for:
 * - Product search and listing
 * - Category browsing
 * - Price comparisons
 * - Inventory management
 */
@Injectable()
export class ProductCatalogProjection {
  private readonly projectionType = 'product-catalog';

  constructor(
    private readonly redisService: ProductRedisProjectionService,
    @Inject(APP_LOGGER) private readonly baseLogger: Logger,
  ) {}

  /**
   * Handle ProductCreatedEvent
   */
  async handleProductCreated(event: {
    type: string;
    data: {
      productId: string;
      name: string;
      description: string;
      price: number;
      categoryId: string;
      sku: string;
    };
    metadata: {
      eventId: string;
      streamId: string;
      revision: string;
      eventSequence: number;
      occurredAt: string;
    };
  }): Promise<void> {
    const catalogItem: ProductCatalogItem = {
      productId: event.data.productId,
      name: event.data.name,
      description: event.data.description,
      price: event.data.price,
      categoryId: event.data.categoryId,
      sku: event.data.sku,
      isActive: true,
      createdAt: event.metadata.occurredAt,
    };

    await this.redisService.storeProjection(
      this.projectionType,
      event.data.productId,
      catalogItem,
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

    Log.info(this.baseLogger, 'product.catalog.created', {
      component: 'ProductCatalogProjection',
      method: 'handleProductCreated',
      productId: event.data.productId,
      sku: event.data.sku,
      categoryId: event.data.categoryId,
      correlationId: event.metadata.eventId,
    });
  }

  /**
   * Handle ProductPriceUpdatedEvent
   */
  async handleProductPriceUpdated(event: {
    type: string;
    data: {
      productId: string;
      oldPrice: number;
      newPrice: number;
      reason?: string;
    };
    metadata: {
      eventId: string;
      streamId: string;
      revision: string;
      eventSequence: number;
      occurredAt: string;
    };
  }): Promise<void> {
    // Get current catalog item
    const existingProjection =
      await this.redisService.getProjection<ProductCatalogItem>(
        this.projectionType,
        event.data.productId,
      );

    if (!existingProjection) {
      Log.warn(this.baseLogger, 'product.catalog.not.found.for.price.update', {
        component: 'ProductCatalogProjection',
        method: 'handleProductPriceUpdated',
        productId: event.data.productId,
        correlationId: event.metadata.eventId,
      });
      return;
    }

    // Update the catalog item with new price
    const updatedCatalogItem: ProductCatalogItem = {
      ...existingProjection.data,
      price: event.data.newPrice,
      lastPriceUpdate: {
        oldPrice: event.data.oldPrice,
        newPrice: event.data.newPrice,
        updatedAt: event.metadata.occurredAt,
        reason: event.data.reason,
      },
    };

    await this.redisService.storeProjection(
      this.projectionType,
      event.data.productId,
      updatedCatalogItem,
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

    Log.info(this.baseLogger, 'product.catalog.price.updated', {
      component: 'ProductCatalogProjection',
      method: 'handleProductPriceUpdated',
      productId: event.data.productId,
      oldPrice: event.data.oldPrice,
      newPrice: event.data.newPrice,
      reason: event.data.reason,
      correlationId: event.metadata.eventId,
    });
  }

  /**
   * Handle ProductDeactivatedEvent
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
    // Get current catalog item
    const existingProjection =
      await this.redisService.getProjection<ProductCatalogItem>(
        this.projectionType,
        event.data.productId,
      );

    if (!existingProjection) {
      Log.warn(this.baseLogger, 'product.catalog.not.found.for.deactivation', {
        component: 'ProductCatalogProjection',
        method: 'handleProductDeactivated',
        productId: event.data.productId,
        correlationId: event.metadata.eventId,
      });
      return;
    }

    // Update the catalog item to mark as inactive
    const updatedCatalogItem: ProductCatalogItem = {
      ...existingProjection.data,
      isActive: false,
      deactivatedAt: event.metadata.occurredAt,
      deactivationReason: event.data.reason,
    };

    await this.redisService.storeProjection(
      this.projectionType,
      event.data.productId,
      updatedCatalogItem,
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

    Log.info(this.baseLogger, 'product.catalog.deactivated', {
      component: 'ProductCatalogProjection',
      method: 'handleProductDeactivated',
      productId: event.data.productId,
      reason: event.data.reason,
      correlationId: event.metadata.eventId,
    });
  }

  /**
   * Get product from catalog
   */
  async getProduct(productId: string): Promise<ProductCatalogItem | null> {
    const projection =
      await this.redisService.getProjection<ProductCatalogItem>(
        this.projectionType,
        productId,
      );

    return projection?.data || null;
  }

  /**
   * Search products in catalog
   */
  async searchProducts(criteria: {
    categoryId?: string;
    isActive?: boolean;
    nameContains?: string;
    priceMin?: number;
    priceMax?: number;
    limit?: number;
    offset?: number;
  }) {
    const filters: Record<string, any> = {};

    if (criteria.categoryId) {
      filters.categoryId = criteria.categoryId;
    }

    if (criteria.isActive !== undefined) {
      filters.isActive = criteria.isActive;
    }

    const result = await this.redisService.queryProjections<ProductCatalogItem>(
      this.projectionType,
      {
        filters,
        limit: criteria.limit || 50,
        offset: criteria.offset || 0,
        sortBy: 'name',
        sortOrder: 'asc',
      },
    );

    // Apply additional filtering that's not indexed
    let filteredData = result.data;

    if (criteria.nameContains) {
      const searchTerm = criteria.nameContains.toLowerCase();
      filteredData = filteredData.filter(
        (item) =>
          item.data.name.toLowerCase().includes(searchTerm) ||
          item.data.description.toLowerCase().includes(searchTerm),
      );
    }

    if (criteria.priceMin !== undefined) {
      filteredData = filteredData.filter(
        (item) => item.data.price >= criteria.priceMin!,
      );
    }

    if (criteria.priceMax !== undefined) {
      filteredData = filteredData.filter(
        (item) => item.data.price <= criteria.priceMax!,
      );
    }

    return {
      products: filteredData.map((item) => item.data),
      total: filteredData.length,
      hasMore: result.hasMore,
      metadata: result.metadata,
    };
  }

  /**
   * Get products by category
   */
  async getProductsByCategory(categoryId: string, limit = 20, offset = 0) {
    return this.searchProducts({
      categoryId,
      isActive: true,
      limit,
      offset,
    });
  }

  /**
   * Get active products count by category
   */
  async getProductCountByCategory(): Promise<Record<string, number>> {
    const result = await this.redisService.queryProjections<ProductCatalogItem>(
      this.projectionType,
      {
        filters: { isActive: true },
        limit: 1000, // Get all active products
      },
    );

    const categoryCount: Record<string, number> = {};

    for (const projection of result.data) {
      const categoryId = projection.data.categoryId;
      categoryCount[categoryId] = (categoryCount[categoryId] || 0) + 1;
    }

    return categoryCount;
  }

  /**
   * Get projection statistics
   */
  async getStats() {
    const stats = await this.redisService.getProjectionStats(
      this.projectionType,
    );

    const activeResult =
      await this.redisService.queryProjections<ProductCatalogItem>(
        this.projectionType,
        {
          filters: { isActive: true },
          limit: 1,
        },
      );

    const inactiveResult =
      await this.redisService.queryProjections<ProductCatalogItem>(
        this.projectionType,
        {
          filters: { isActive: false },
          limit: 1,
        },
      );

    return {
      totalProducts: stats.count,
      activeProducts: activeResult.total,
      inactiveProducts: inactiveResult.total,
      averageSize: stats.averageSize,
      lastUpdated: stats.lastUpdated,
    };
  }
}
