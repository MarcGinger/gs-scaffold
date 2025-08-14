import { Injectable } from '@nestjs/common';
import { ProductCatalogProjection } from './product-catalog.projection';
import { ActiveProductsProjection } from './active-products.projection';

export interface ProductSearchCriteria {
  categoryId?: string;
  isActive?: boolean;
  nameContains?: string;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
  offset?: number;
}

export interface ProductSearchResult {
  products: any[];
  total: number;
  hasMore: boolean;
  queryTime: number;
}

/**
 * Product Query Service for Redis Projections
 *
 * Provides high-level query interface for product data from Redis projections.
 * Abstracts the complexity of multiple projections and provides optimized queries.
 */
@Injectable()
export class ProductQueryService {
  constructor(
    private readonly productCatalogProjection: ProductCatalogProjection,
    private readonly activeProductsProjection: ActiveProductsProjection,
  ) {}

  /**
   * Search products with full catalog data
   */
  async searchProducts(
    criteria: ProductSearchCriteria,
  ): Promise<ProductSearchResult> {
    const startTime = Date.now();

    const result = await this.productCatalogProjection.searchProducts(criteria);

    return {
      products: result.products,
      total: result.total,
      hasMore: result.hasMore,
      queryTime: Date.now() - startTime,
    };
  }

  /**
   * Get active products (optimized for speed)
   */
  async getActiveProducts(
    limit = 20,
    offset = 0,
  ): Promise<ProductSearchResult> {
    const startTime = Date.now();

    const result = await this.activeProductsProjection.getActiveProducts(
      limit,
      offset,
    );

    return {
      products: result.products,
      total: result.total,
      hasMore: result.hasMore,
      queryTime: Date.now() - startTime,
    };
  }

  /**
   * Get products by category (uses active products for speed)
   */
  async getProductsByCategory(
    categoryId: string,
    limit = 20,
    offset = 0,
  ): Promise<ProductSearchResult> {
    const startTime = Date.now();

    const result =
      await this.activeProductsProjection.getActiveProductsByCategory(
        categoryId,
        limit,
        offset,
      );

    return {
      products: result.products,
      total: result.total,
      hasMore: result.hasMore,
      queryTime: Date.now() - startTime,
    };
  }

  /**
   * Get single product with full details
   */
  async getProductById(productId: string) {
    const product = await this.productCatalogProjection.getProduct(productId);
    return product;
  }

  /**
   * Check if product is active (fast lookup)
   */
  async isProductActive(productId: string): Promise<boolean> {
    return this.activeProductsProjection.isProductActive(productId);
  }

  /**
   * Get product names for autocomplete
   */
  async getProductAutocomplete(
    namePrefix: string,
    limit = 10,
  ): Promise<string[]> {
    return this.activeProductsProjection.getProductNamesForAutocomplete(
      namePrefix,
      limit,
    );
  }

  /**
   * Get product statistics
   */
  async getProductStats() {
    const [catalogStats, activeCount] = await Promise.all([
      this.productCatalogProjection.getStats(),
      this.activeProductsProjection.getActiveProductCount(),
    ]);

    return {
      totalProducts: catalogStats.totalProducts,
      activeProducts: activeCount,
      inactiveProducts: catalogStats.totalProducts - activeCount,
      categoryCounts:
        await this.productCatalogProjection.getProductCountByCategory(),
      lastUpdated: catalogStats.lastUpdated,
    };
  }

  /**
   * Get featured products (active products sorted by recent updates)
   */
  async getFeaturedProducts(limit = 10): Promise<ProductSearchResult> {
    const startTime = Date.now();

    // For simplicity, return recent active products
    const result = await this.activeProductsProjection.getActiveProducts(
      limit,
      0,
    );

    return {
      products: result.products,
      total: result.total,
      hasMore: result.hasMore,
      queryTime: Date.now() - startTime,
    };
  }

  /**
   * Search products with advanced filtering
   */
  async advancedProductSearch(criteria: {
    query?: string;
    categoryIds?: string[];
    priceRange?: { min: number; max: number };
    isActive?: boolean;
    sortBy?: 'name' | 'price' | 'created';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<ProductSearchResult> {
    const startTime = Date.now();

    // Convert to basic search criteria
    const searchCriteria: ProductSearchCriteria = {
      nameContains: criteria.query,
      priceMin: criteria.priceRange?.min,
      priceMax: criteria.priceRange?.max,
      isActive: criteria.isActive ?? true,
      limit: criteria.limit || 20,
      offset: criteria.offset || 0,
    };

    // If multiple categories, search each and combine
    if (criteria.categoryIds && criteria.categoryIds.length > 0) {
      const categoryResults = await Promise.all(
        criteria.categoryIds.map((categoryId) =>
          this.productCatalogProjection.searchProducts({
            ...searchCriteria,
            categoryId,
          }),
        ),
      );

      // Combine results (simplified - in production, you'd handle pagination properly)
      const allProducts = categoryResults.flatMap((result) => result.products);
      const totalCount = categoryResults.reduce(
        (sum, result) => sum + result.total,
        0,
      );

      return {
        products: allProducts.slice(0, criteria.limit || 20),
        total: totalCount,
        hasMore: totalCount > (criteria.limit || 20),
        queryTime: Date.now() - startTime,
      };
    }

    // Single category or no category filter
    const result =
      await this.productCatalogProjection.searchProducts(searchCriteria);

    return {
      products: result.products,
      total: result.total,
      hasMore: result.hasMore,
      queryTime: Date.now() - startTime,
    };
  }

  /**
   * Get products by price range
   */
  async getProductsByPriceRange(
    minPrice: number,
    maxPrice: number,
    limit = 20,
    offset = 0,
  ): Promise<ProductSearchResult> {
    return this.searchProducts({
      priceMin: minPrice,
      priceMax: maxPrice,
      isActive: true,
      limit,
      offset,
    });
  }

  /**
   * Get recently updated products
   */
  async getRecentlyUpdatedProducts(
    limit = 10,
    offset = 0,
  ): Promise<ProductSearchResult> {
    const startTime = Date.now();

    // Get from catalog projection which has update timestamps
    const result = await this.productCatalogProjection.searchProducts({
      isActive: true,
      limit,
      offset,
    });

    // Sort by last update (in production, this would be indexed)
    const sortedProducts = result.products.sort((a, b) => {
      const aTime = a.lastPriceUpdate?.updatedAt || a.createdAt;
      const bTime = b.lastPriceUpdate?.updatedAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return {
      products: sortedProducts,
      total: result.total,
      hasMore: result.hasMore,
      queryTime: Date.now() - startTime,
    };
  }
}
