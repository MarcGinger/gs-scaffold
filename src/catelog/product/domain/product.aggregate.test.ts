import { ProductAggregate } from './product.aggregate';
import { v4 as uuidv4 } from 'uuid';

describe('ProductAggregate', () => {
  describe('create', () => {
    it('should create a product successfully', () => {
      const id = uuidv4();
      const result = ProductAggregate.create(
        id,
        'Test Product',
        'Test description',
        99.99,
        uuidv4(),
        'TEST-001',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const state = result.data.getState();
        expect(state?.name).toBe('Test Product');
        expect(state?.price).toBe(99.99);
        expect(state?.isActive).toBe(true);
        expect(result.data.uncommittedEvents).toHaveLength(1);
      }
    });

    it('should fail with empty name', () => {
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

    it('should fail with negative price', () => {
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
  });

  describe('updatePrice', () => {
    it('should update price successfully', () => {
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

        const updateResult = aggregate.updatePrice(150, 'Price increase');
        expect(updateResult.success).toBe(true);

        const state = aggregate.getState();
        expect(state?.price).toBe(150);
        expect(aggregate.uncommittedEvents).toHaveLength(1);
      }
    });

    it('should fail with negative price', () => {
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

        const updateResult = aggregate.updatePrice(-50);
        expect(updateResult.success).toBe(false);
        if (!updateResult.success) {
          expect(updateResult.error).toBe('Price cannot be negative');
        }
      }
    });

    it('should fail with same price', () => {
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

        const updateResult = aggregate.updatePrice(100);
        expect(updateResult.success).toBe(false);
        if (!updateResult.success) {
          expect(updateResult.error).toBe(
            'New price must be different from current price',
          );
        }
      }
    });
  });

  describe('deactivate', () => {
    it('should deactivate successfully', () => {
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

        const deactivateResult = aggregate.deactivate('Discontinued');
        expect(deactivateResult.success).toBe(true);

        const state = aggregate.getState();
        expect(state?.isActive).toBe(false);
        expect(aggregate.uncommittedEvents).toHaveLength(1);
      }
    });

    it('should fail without reason', () => {
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

        const deactivateResult = aggregate.deactivate('');
        expect(deactivateResult.success).toBe(false);
        if (!deactivateResult.success) {
          expect(deactivateResult.error).toBe(
            'Deactivation reason is required',
          );
        }
      }
    });
  });

  describe('business invariants', () => {
    it('should prevent price update on inactive product', () => {
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

        // Try to update price on inactive product
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

  describe('snapshots', () => {
    it('should create snapshot', () => {
      const result = ProductAggregate.create(
        uuidv4(),
        'Test Product',
        'description',
        100,
        uuidv4(),
        'SKU-001',
      );

      if (result.success) {
        const snapshot = result.data.createSnapshot();
        expect(snapshot).toBeDefined();
        expect(snapshot?.name).toBe('Test Product');
        expect(snapshot?.price).toBe(100);
        expect(snapshot?.isActive).toBe(true);
      }
    });
  });
});
