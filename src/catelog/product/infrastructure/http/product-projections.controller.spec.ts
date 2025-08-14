import { Test, TestingModule } from '@nestjs/testing';
import { ProductProjectionsController } from './product-projections.controller';
import { ProductQueryService } from '../../../../infrastructure/projections/product-query.service';
import { EventSubscriptionService } from '../../../../infrastructure/projections/event-subscription.service';

describe('ProductProjectionsController', () => {
  let controller: ProductProjectionsController;
  let productQueryService: jest.Mocked<ProductQueryService>;
  let eventSubscriptionService: jest.Mocked<EventSubscriptionService>;

  beforeEach(async () => {
    const mockProductQueryService = {
      getActiveProducts: jest.fn(),
      getProductsByCategory: jest.fn(),
      searchProducts: jest.fn(),
      getProductById: jest.fn(),
      isProductActive: jest.fn(),
      getProductAutocomplete: jest.fn(),
      getFeaturedProducts: jest.fn(),
      getRecentlyUpdatedProducts: jest.fn(),
      getProductStats: jest.fn(),
      advancedProductSearch: jest.fn(),
    };

    const mockEventSubscriptionService = {
      getSubscriptionStatus: jest.fn(),
      restartSubscription: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductProjectionsController],
      providers: [
        {
          provide: ProductQueryService,
          useValue: mockProductQueryService,
        },
        {
          provide: EventSubscriptionService,
          useValue: mockEventSubscriptionService,
        },
      ],
    }).compile();

    controller = module.get<ProductProjectionsController>(
      ProductProjectionsController,
    );
    productQueryService = module.get(ProductQueryService);
    eventSubscriptionService = module.get(EventSubscriptionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProducts', () => {
    it('should return active products by default', async () => {
      const mockProducts = [{ id: '1', name: 'Test Product' }];
      productQueryService.getActiveProducts.mockResolvedValue(mockProducts);

      const result = await controller.getProducts();

      expect(productQueryService.getActiveProducts).toHaveBeenCalledWith(20, 0);
      expect(result).toBe(mockProducts);
    });

    it('should return products by category when categoryId provided', async () => {
      const mockProducts = [
        { id: '1', name: 'Test Product', categoryId: 'cat1' },
      ];
      productQueryService.getProductsByCategory.mockResolvedValue(mockProducts);

      const result = await controller.getProducts(10, 5, 'cat1');

      expect(productQueryService.getProductsByCategory).toHaveBeenCalledWith(
        'cat1',
        10,
        5,
      );
      expect(result).toBe(mockProducts);
    });
  });

  describe('searchProducts', () => {
    it('should search products with filters', async () => {
      const mockProducts = [{ id: '1', name: 'Search Result' }];
      productQueryService.searchProducts.mockResolvedValue(mockProducts);

      const result = await controller.searchProducts(
        'test',
        'cat1',
        10,
        100,
        20,
        0,
      );

      expect(productQueryService.searchProducts).toHaveBeenCalledWith({
        nameContains: 'test',
        categoryId: 'cat1',
        priceMin: 10,
        priceMax: 100,
        isActive: true,
        limit: 20,
        offset: 0,
      });
      expect(result).toBe(mockProducts);
    });
  });

  describe('getProduct', () => {
    it('should return product when found', async () => {
      const mockProduct = { id: '1', name: 'Test Product' };
      productQueryService.getProductById.mockResolvedValue(mockProduct);

      const result = await controller.getProduct('1');

      expect(productQueryService.getProductById).toHaveBeenCalledWith('1');
      expect(result).toEqual({ product: mockProduct });
    });

    it('should return error when product not found', async () => {
      productQueryService.getProductById.mockResolvedValue(null);

      const result = await controller.getProduct('nonexistent');

      expect(result).toEqual({
        error: 'Product not found',
        productId: 'nonexistent',
      });
    });
  });

  describe('isProductActive', () => {
    it('should check if product is active', async () => {
      productQueryService.isProductActive.mockResolvedValue(true);

      const result = await controller.isProductActive('1');

      expect(productQueryService.isProductActive).toHaveBeenCalledWith('1');
      expect(result).toEqual({ productId: '1', isActive: true });
    });
  });

  describe('getProductAutocomplete', () => {
    it('should return suggestions for valid query', async () => {
      const mockSuggestions = ['Product A', 'Product B'];
      productQueryService.getProductAutocomplete.mockResolvedValue(
        mockSuggestions,
      );

      const result = await controller.getProductAutocomplete('test', 5);

      expect(productQueryService.getProductAutocomplete).toHaveBeenCalledWith(
        'test',
        5,
      );
      expect(result).toEqual({ suggestions: mockSuggestions });
    });

    it('should return empty suggestions for short query', async () => {
      const result = await controller.getProductAutocomplete('t');

      expect(result).toEqual({ suggestions: [] });
      expect(productQueryService.getProductAutocomplete).not.toHaveBeenCalled();
    });
  });

  describe('getSubscriptionStatus', () => {
    it('should return subscription status', () => {
      const mockStatus = {
        subscriptions: ['product-catalog', 'active-products'],
      };
      eventSubscriptionService.getSubscriptionStatus.mockReturnValue(
        mockStatus,
      );

      const result = controller.getSubscriptionStatus();

      expect(eventSubscriptionService.getSubscriptionStatus).toHaveBeenCalled();
      expect(result).toBe(mockStatus);
    });
  });

  describe('restartSubscription', () => {
    it('should restart subscription successfully', async () => {
      eventSubscriptionService.restartSubscription.mockResolvedValue(undefined);

      const result = await controller.restartSubscription('product-catalog');

      expect(eventSubscriptionService.restartSubscription).toHaveBeenCalledWith(
        'product-catalog',
      );
      expect(result).toEqual({
        success: true,
        message: 'Subscription product-catalog restarted',
      });
    });

    it('should handle restart failure', async () => {
      const error = new Error('Restart failed');
      eventSubscriptionService.restartSubscription.mockRejectedValue(error);

      const result = await controller.restartSubscription('product-catalog');

      expect(result).toEqual({
        success: false,
        message: 'Failed to restart subscription: Restart failed',
      });
    });
  });
});
