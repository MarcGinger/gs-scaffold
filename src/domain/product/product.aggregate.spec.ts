import { ProductAggregate } from './product.aggregate';
import { v4 as uuidv4 } from 'uuid';

describe('ProductAggregate', () => {
  describe('create', () => {
    it('should create a product successfully', () => {
      const id = uuidv4();
      const name = 'Test Product';
      const description = 'A test product';
      const price = 99.99;
      const categoryId = uuidv4();
      const sku = 'TEST-001';

      const result = ProductAggregate.create(
        id,
        name,
        description,
        price,
        categoryId,
        sku,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const aggregate = result.data;
        const state = aggregate.getState();

        expect(state).toEqual({
          id,
          name,
          description,
          price,
          categoryId,
          sku,
          isActive: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          createdAt: expect.any(Date),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          updatedAt: expect.any(Date),
        });

        expect(aggregate.uncommittedEvents).toHaveLength(1);
        expect(aggregate.uncommittedEvents[0].type).toBe(
          'ecommerce.product.created.v1',
        );
      }
    });

    it('should fail to create product with empty name', () => {
      const result = ProductAggregate.create(
        uuidv4(),
        '',
        'description',
        99.99,
        uuidv4(),
        'SKU-001',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Product name cannot be empty');
      }
    });

    it('should fail to create product with negative price', () => {
      const result = ProductAggregate.create(
        uuidv4(),
        'Product',
        'description',
        -10,
        uuidv4(),
        'SKU-001',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Product price cannot be negative');
      }
    });

    it('should fail to create product with empty SKU', () => {
      const result = ProductAggregate.create(
        uuidv4(),
        'Product',
        'description',
        99.99,
        uuidv4(),
        '',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Product SKU cannot be empty');
      }
    });
  });

  describe('updatePrice', () => {
    let aggregate: ProductAggregate;

    beforeEach(() => {
      const result = ProductAggregate.create(
        uuidv4(),
        'Test Product',
        'description',
        100,
        uuidv4(),
        'SKU-001',
      );

      if (result.success) {
        aggregate = result.data;
        aggregate.markEventsAsCommitted(); // Simulate committed state
      }
    });

    it('should update price successfully', () => {
      const result = aggregate.updatePrice(150, 'Price increase');

      expect(result.success).toBe(true);

      const state = aggregate.getState();
      expect(state?.price).toBe(150);

      expect(aggregate.uncommittedEvents).toHaveLength(1);
      expect(aggregate.uncommittedEvents[0].type).toBe(
        'ecommerce.product.price-updated.v1',
      );
    });

    it('should fail to update to negative price', () => {
      const result = aggregate.updatePrice(-50);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Price cannot be negative');
      }
    });

    it('should fail to update to same price', () => {
      const result = aggregate.updatePrice(100);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(
          'New price must be different from current price',
        );
      }
    });
  });

  describe('deactivate', () => {
    let aggregate: ProductAggregate;

    beforeEach(() => {
      const result = ProductAggregate.create(
        uuidv4(),
        'Test Product',
        'description',
        100,
        uuidv4(),
        'SKU-001',
      );

      if (result.success) {
        aggregate = result.data;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        aggregate.markChangesAsCommitted();
      }
    });

    it('should deactivate product successfully', () => {
      const result = aggregate.deactivate('Discontinued');

      expect(result.success).toBe(true);

      const state = aggregate.getState();
      expect(state?.isActive).toBe(false);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const events = aggregate.getUncommittedEvents();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect(events).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(events[0].type).toBe('ecommerce.product.deactivated.v1');
    });

    it('should fail to deactivate without reason', () => {
      const result = aggregate.deactivate('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Deactivation reason is required');
      }
    });

    it('should fail to deactivate already inactive product', () => {
      // First deactivation
      aggregate.deactivate('Test reason');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      aggregate.markChangesAsCommitted();

      // Second deactivation attempt
      const result = aggregate.deactivate('Another reason');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Product is already inactive');
      }
    });
  });

  describe('event replay', () => {
    it('should rebuild aggregate state from events', () => {
      const id = uuidv4();
      const aggregate = new ProductAggregate();

      // Apply events in sequence
      const events = [
        {
          id: uuidv4(),
          type: 'ecommerce.product.created.v1' as const,
          data: {
            productId: id,
            name: 'Test Product',
            description: 'Test Description',
            price: 100,
            categoryId: uuidv4(),
            sku: 'TEST-001',
            occurredAt: new Date().toISOString(),
          },
          metadata: {
            correlationId: uuidv4(),
            causationId: uuidv4(),
            tenant: 'test-tenant',
            version: 1,
          },
          streamName: `tenant-test/agg-product/${id}`,
          streamPosition: 0,
          globalPosition: 100,
          occurredAt: new Date(),
        },
        {
          id: uuidv4(),
          type: 'ecommerce.product.price-updated.v1' as const,
          data: {
            productId: id,
            oldPrice: 100,
            newPrice: 150,
            reason: 'Price increase',
            occurredAt: new Date().toISOString(),
          },
          metadata: {
            correlationId: uuidv4(),
            causationId: uuidv4(),
            tenant: 'test-tenant',
            version: 2,
          },
          streamName: `tenant-test/agg-product/${id}`,
          streamPosition: 1,
          globalPosition: 101,
          occurredAt: new Date(),
        },
      ];

      aggregate.replay(events);

      const state = aggregate.getState();
      expect(state).toEqual({
        id,
        name: 'Test Product',
        description: 'Test Description',
        price: 150, // Updated price
        categoryId: expect.any(String),
        sku: 'TEST-001',
        isActive: true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        createdAt: expect.any(Date),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        updatedAt: expect.any(Date),
      });

      expect(aggregate.version).toBe(2);
    });
  });

  describe('snapshots', () => {
    it('should create and restore from snapshot', () => {
      const result = ProductAggregate.create(
        uuidv4(),
        'Test Product',
        'description',
        100,
        uuidv4(),
        'SKU-001',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const aggregate = result.data;

        // Create snapshot
        const snapshot = aggregate.createSnapshot();
        expect(snapshot).toEqual({
          id: expect.any(String),
          name: 'Test Product',
          description: 'description',
          price: 100,
          categoryId: expect.any(String),
          sku: 'SKU-001',
          isActive: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          createdAt: expect.any(Date),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          updatedAt: expect.any(Date),
        });

        // Create new aggregate and restore from snapshot
        const newAggregate = new ProductAggregate();
        newAggregate.restoreFromSnapshot(snapshot, 1);

        expect(newAggregate.getState()).toEqual(aggregate.getState());
        expect(newAggregate.version).toBe(1);
      }
    });
  });

  describe('business invariants', () => {
    it('should fail price update on inactive product', () => {
      const result = ProductAggregate.create(
        uuidv4(),
        'Test Product',
        'description',
        100,
        uuidv4(),
        'SKU-001',
      );

      if (result.success) {
        const aggregate = result.data;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        aggregate.markChangesAsCommitted();

        // Deactivate first
        aggregate.deactivate('Test deactivation');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        aggregate.markChangesAsCommitted();

        // Try to update price
        const updateResult = aggregate.updatePrice(150);

        expect(updateResult.success).toBe(false);
        if (!updateResult.success) {
          expect(updateResult.error).toBe(
            'Cannot update price of inactive product',
          );
        }
      }
    });
  });
});
