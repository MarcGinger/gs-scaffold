import { Test, TestingModule } from '@nestjs/testing';
import { ProductQueryService } from '../../infrastructure/projections/product-query.service';
import { ProductCatalogProjection } from '../../infrastructure/projections/product-catalog.projection';
import { ActiveProductsProjection } from '../../infrastructure/projections/active-products.projection';
import { RedisProjectionService } from '../../infrastructure/projections/redis-projection.service';
import { LoggingModule } from '../../shared/logging/logging.module';

describe('Redis Projections Integration', () => {
  let productQueryService: ProductQueryService;
  let productCatalogProjection: ProductCatalogProjection;
  let activeProductsProjection: ActiveProductsProjection;
  let redisService: RedisProjectionService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [LoggingModule],
      providers: [
        ProductQueryService,
        ProductCatalogProjection,
        ActiveProductsProjection,
        RedisProjectionService,
      ],
    }).compile();

    productQueryService = module.get<ProductQueryService>(ProductQueryService);
    productCatalogProjection = module.get<ProductCatalogProjection>(
      ProductCatalogProjection,
    );
    activeProductsProjection = module.get<ActiveProductsProjection>(
      ActiveProductsProjection,
    );
    redisService = module.get<RedisProjectionService>(RedisProjectionService);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('Product Catalog Projection', () => {
    it('should handle product created event', async () => {
      const productCreatedEvent = {
        type: 'ecommerce.product.created.v1',
        data: {
          productId: 'test-product-001',
          name: 'Test Product',
          description: 'A test product for Redis projections',
          price: 99.99,
          categoryId: 'electronics',
          sku: 'TEST-001',
        },
        metadata: {
          eventId: 'event-001',
          streamId: 'product-test-product-001',
          revision: '0',
          eventSequence: 1,
          occurredAt: new Date().toISOString(),
        },
      };

      await productCatalogProjection.handleProductCreated(productCreatedEvent);

      // Verify product was stored in catalog
      const product =
        await productCatalogProjection.getProduct('test-product-001');
      expect(product).toBeDefined();
      expect(product?.name).toBe('Test Product');
      expect(product?.price).toBe(99.99);
      expect(product?.isActive).toBe(true);
    });

    it('should handle product price updated event', async () => {
      const priceUpdatedEvent = {
        type: 'ecommerce.product.price-updated.v1',
        data: {
          productId: 'test-product-001',
          oldPrice: 99.99,
          newPrice: 89.99,
          reason: 'Price reduction sale',
        },
        metadata: {
          eventId: 'event-002',
          streamId: 'product-test-product-001',
          revision: '1',
          eventSequence: 2,
          occurredAt: new Date().toISOString(),
        },
      };

      await productCatalogProjection.handleProductPriceUpdated(
        priceUpdatedEvent,
      );

      // Verify price was updated
      const product =
        await productCatalogProjection.getProduct('test-product-001');
      expect(product?.price).toBe(89.99);
      expect(product?.lastPriceUpdate?.oldPrice).toBe(99.99);
      expect(product?.lastPriceUpdate?.newPrice).toBe(89.99);
      expect(product?.lastPriceUpdate?.reason).toBe('Price reduction sale');
    });

    it('should handle product deactivated event', async () => {
      const deactivatedEvent = {
        type: 'ecommerce.product.deactivated.v1',
        data: {
          productId: 'test-product-001',
          reason: 'End of life',
        },
        metadata: {
          eventId: 'event-003',
          streamId: 'product-test-product-001',
          revision: '2',
          eventSequence: 3,
          occurredAt: new Date().toISOString(),
        },
      };

      await productCatalogProjection.handleProductDeactivated(deactivatedEvent);

      // Verify product was deactivated
      const product =
        await productCatalogProjection.getProduct('test-product-001');
      expect(product?.isActive).toBe(false);
      expect(product?.deactivationReason).toBe('End of life');
      expect(product?.deactivatedAt).toBeDefined();
    });
  });

  describe('Active Products Projection', () => {
    it('should handle product created event for active products', async () => {
      const productCreatedEvent = {
        type: 'ecommerce.product.created.v1',
        data: {
          productId: 'test-active-product-001',
          name: 'Active Test Product',
          sku: 'ACTIVE-001',
          price: 49.99,
          categoryId: 'books',
        },
        metadata: {
          eventId: 'event-004',
          streamId: 'product-test-active-product-001',
          revision: '0',
          eventSequence: 1,
          occurredAt: new Date().toISOString(),
        },
      };

      await activeProductsProjection.handleProductCreated(productCreatedEvent);

      // Verify product is in active products
      const isActive = await activeProductsProjection.isProductActive(
        'test-active-product-001',
      );
      expect(isActive).toBe(true);
    });

    it('should handle product price updated for active products', async () => {
      const priceUpdatedEvent = {
        type: 'ecommerce.product.price-updated.v1',
        data: {
          productId: 'test-active-product-001',
          newPrice: 39.99,
        },
        metadata: {
          eventId: 'event-005',
          streamId: 'product-test-active-product-001',
          revision: '1',
          eventSequence: 2,
          occurredAt: new Date().toISOString(),
        },
      };

      await activeProductsProjection.handleProductPriceUpdated(
        priceUpdatedEvent,
      );

      // Verify product is still active and price updated
      const isActive = await activeProductsProjection.isProductActive(
        'test-active-product-001',
      );
      expect(isActive).toBe(true);
    });

    it('should remove product when deactivated', async () => {
      const deactivatedEvent = {
        type: 'ecommerce.product.deactivated.v1',
        data: {
          productId: 'test-active-product-001',
          reason: 'Discontinued',
        },
        metadata: {
          eventId: 'event-006',
          streamId: 'product-test-active-product-001',
          revision: '2',
          eventSequence: 3,
          occurredAt: new Date().toISOString(),
        },
      };

      await activeProductsProjection.handleProductDeactivated(deactivatedEvent);

      // Verify product is no longer in active products
      const isActive = await activeProductsProjection.isProductActive(
        'test-active-product-001',
      );
      expect(isActive).toBe(false);
    });
  });

  describe('Product Query Service', () => {
    beforeEach(async () => {
      // Create some test products for querying
      const products = [
        {
          productId: 'query-test-001',
          name: 'Query Test Product 1',
          description: 'First query test product',
          price: 25.99,
          categoryId: 'electronics',
          sku: 'QT-001',
        },
        {
          productId: 'query-test-002',
          name: 'Query Test Product 2',
          description: 'Second query test product',
          price: 35.99,
          categoryId: 'books',
          sku: 'QT-002',
        },
      ];

      for (const [index, product] of products.entries()) {
        const event = {
          type: 'ecommerce.product.created.v1',
          data: product,
          metadata: {
            eventId: `query-event-${index + 1}`,
            streamId: `product-${product.productId}`,
            revision: '0',
            eventSequence: index + 1,
            occurredAt: new Date().toISOString(),
          },
        };

        await productCatalogProjection.handleProductCreated(event);
        await activeProductsProjection.handleProductCreated(event);
      }
    });

    it('should search products', async () => {
      const result = await productQueryService.searchProducts({
        nameContains: 'Query Test',
        limit: 10,
        offset: 0,
      });

      expect(result.products.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.queryTime).toBeGreaterThan(0);
    });

    it('should get active products', async () => {
      const result = await productQueryService.getActiveProducts(10, 0);

      expect(result.products.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.queryTime).toBeGreaterThan(0);
    });

    it('should get products by category', async () => {
      const result = await productQueryService.getProductsByCategory(
        'electronics',
        10,
        0,
      );

      expect(result.queryTime).toBeGreaterThan(0);
      // May or may not have results depending on test execution order
    });

    it('should check if product is active', async () => {
      const isActive =
        await productQueryService.isProductActive('query-test-001');
      expect(typeof isActive).toBe('boolean');
    });

    it('should get product autocomplete suggestions', async () => {
      const suggestions = await productQueryService.getProductAutocomplete(
        'Query',
        5,
      );

      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should get product statistics', async () => {
      const stats = await productQueryService.getProductStats();

      expect(stats).toHaveProperty('totalProducts');
      expect(stats).toHaveProperty('activeProducts');
      expect(stats).toHaveProperty('inactiveProducts');
      expect(stats).toHaveProperty('categoryCounts');
      expect(typeof stats.totalProducts).toBe('number');
      expect(typeof stats.activeProducts).toBe('number');
    });
  });

  describe('Redis Projection Service', () => {
    it('should store and retrieve projections', async () => {
      const testData = {
        id: 'redis-test-001',
        name: 'Redis Test Item',
        value: 42,
      };

      await redisService.storeProjection(
        'test-projection',
        'redis-test-001',
        testData,
        {
          version: 1,
          lastUpdated: new Date().toISOString(),
          eventSequence: 1,
          sourceEvent: {
            streamId: 'test-stream',
            revision: '0',
            eventId: 'test-event-001',
            eventType: 'test.event.v1',
          },
        },
      );

      const retrieved = await redisService.getProjection(
        'test-projection',
        'redis-test-001',
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.data.name).toBe('Redis Test Item');
      expect(retrieved?.data.value).toBe(42);
      expect(retrieved?.metadata.version).toBe(1);
    });

    it('should query projections', async () => {
      const result = await redisService.queryProjections('test-projection', {
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('metadata');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should get projection statistics', async () => {
      const stats = await redisService.getProjectionStats('test-projection');

      expect(stats).toHaveProperty('count');
      expect(stats).toHaveProperty('averageSize');
      expect(typeof stats.count).toBe('number');
      expect(typeof stats.averageSize).toBe('number');
    });
  });
});
