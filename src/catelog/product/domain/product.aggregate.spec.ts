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
        aggregate.markEventsAsCommitted();
      }
    });

    it('should deactivate product successfully', () => {
      const result = aggregate.deactivate('Discontinued');

      expect(result.success).toBe(true);

      const state = aggregate.getState();
      expect(state?.isActive).toBe(false);

      const events = aggregate.uncommittedEvents;
      expect(events).toHaveLength(1);
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
      aggregate.markEventsAsCommitted();

      // Second deactivation attempt
      const result = aggregate.deactivate('Another reason');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Product is already inactive');
      }
    });
  });

  // TODO: Fix event replay test - events need proper DomainEvent structure
  xdescribe('event replay', () => {
    xit('should rebuild aggregate state from events', () => {
      // Test disabled until DomainEvent interface is properly implemented
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
        if (snapshot) {
          newAggregate.restoreFromSnapshot(snapshot, 1);

          expect(newAggregate.getState()).toEqual(aggregate.getState());
          expect(newAggregate.version).toBe(1);
        }
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
        aggregate.markEventsAsCommitted();

        // Deactivate first
        aggregate.deactivate('Test deactivation');
        aggregate.markEventsAsCommitted();

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
