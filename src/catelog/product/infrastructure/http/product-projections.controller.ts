import { Controller, Get, Query, Param } from '@nestjs/common';
import { ProductQueryService } from '../projections/product-query.service';
import { ProductEventSubscriptionService } from '../projections/product-event-subscription.service';

/**
 * Product Controller using Redis Projections
 *
 * Demonstrates fast read operations using Redis-based projections
 * instead of querying the EventStore directly.
 *
 * Located in catalog/product bounded context following modular monolith patterns.
 */
@Controller('api/catalog/products')
export class ProductProjectionsController {
  constructor(
    private readonly productQueryService: ProductQueryService,
    private readonly eventSubscriptionService: ProductEventSubscriptionService,
  ) {}

  /**
   * Get all active products (fast Redis lookup)
   */
  @Get()
  async getProducts(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('category') categoryId?: string,
  ) {
    if (categoryId) {
      return this.productQueryService.getProductsByCategory(
        categoryId,
        limit || 20,
        offset || 0,
      );
    }

    return this.productQueryService.getActiveProducts(limit || 20, offset || 0);
  }

  /**
   * Search products with filters
   */
  @Get('search')
  async searchProducts(
    @Query('q') query?: string,
    @Query('category') categoryId?: string,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.productQueryService.searchProducts({
      nameContains: query,
      categoryId,
      priceMin: priceMin ? parseFloat(priceMin.toString()) : undefined,
      priceMax: priceMax ? parseFloat(priceMax.toString()) : undefined,
      isActive: true,
      limit: limit || 20,
      offset: offset || 0,
    });
  }

  /**
   * Get single product by ID
   */
  @Get(':id')
  async getProduct(@Param('id') productId: string) {
    const product = await this.productQueryService.getProductById(productId);

    if (!product) {
      return { error: 'Product not found', productId };
    }

    return { product };
  }

  /**
   * Check if product is active (ultra-fast Redis lookup)
   */
  @Get(':id/active')
  async isProductActive(@Param('id') productId: string) {
    const isActive = await this.productQueryService.isProductActive(productId);
    return { productId, isActive };
  }

  /**
   * Get product autocomplete suggestions
   */
  @Get('autocomplete')
  async getProductAutocomplete(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    if (!query || query.length < 2) {
      return { suggestions: [] };
    }

    const suggestions = await this.productQueryService.getProductAutocomplete(
      query,
      limit || 10,
    );

    return { suggestions };
  }

  /**
   * Get products by category
   */
  @Get('category/:categoryId')
  async getProductsByCategory(
    @Param('categoryId') categoryId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.productQueryService.getProductsByCategory(
      categoryId,
      limit || 20,
      offset || 0,
    );
  }

  /**
   * Get featured products
   */
  @Get('featured')
  async getFeaturedProducts(@Query('limit') limit?: number) {
    return this.productQueryService.getFeaturedProducts(limit || 10);
  }

  /**
   * Get recently updated products
   */
  @Get('recent')
  async getRecentlyUpdatedProducts(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.productQueryService.getRecentlyUpdatedProducts(
      limit || 10,
      offset || 0,
    );
  }

  /**
   * Get product statistics from projections
   */
  @Get('stats')
  async getProductStats() {
    return this.productQueryService.getProductStats();
  }

  /**
   * Advanced product search with multiple filters
   */
  @Get('advanced-search')
  async advancedSearch(
    @Query('q') query?: string,
    @Query('categories') categories?: string, // Comma-separated category IDs
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('sortBy') sortBy?: 'name' | 'price' | 'created',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const categoryIds = categories ? categories.split(',') : undefined;
    const priceRange =
      priceMin !== undefined || priceMax !== undefined
        ? {
            min: priceMin ? parseFloat(priceMin.toString()) : 0,
            max: priceMax ? parseFloat(priceMax.toString()) : Number.MAX_VALUE,
          }
        : undefined;

    return this.productQueryService.advancedProductSearch({
      query,
      categoryIds,
      priceRange,
      isActive: true,
      sortBy,
      sortOrder,
      limit: limit || 20,
      offset: offset || 0,
    });
  }

  /**
   * Get projection subscription status (for monitoring)
   */
  @Get('admin/subscriptions')
  getSubscriptionStatus() {
    return this.eventSubscriptionService.getSubscriptionStatus();
  }

  /**
   * Restart a projection subscription (for admin operations)
   */
  @Get('admin/subscriptions/:name/restart')
  async restartSubscription(@Param('name') subscriptionName: string) {
    try {
      await this.eventSubscriptionService.restartSubscription(subscriptionName);
      return {
        success: true,
        message: `Subscription ${subscriptionName} restarted`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to restart subscription: ${(error as Error).message}`,
      };
    }
  }
}
