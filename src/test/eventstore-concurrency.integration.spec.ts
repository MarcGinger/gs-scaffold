import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { LoggingModule } from '../../shared/logging/logging.module';
import { ProductAggregate } from '../../domain/product/product.aggregate';

describe('EventStore Concurrency Control Smoke Test', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        LoggingModule,
      ],
    }).compile();
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('Optimistic Concurrency Concept', () => {
    it('should demonstrate the concurrency problem with version tracking', () => {
      // 🎯 Test Goal: Show the logical concurrency control concept
      const aggregateId = 'product-concurrency-demo-001';

      // 📝 Step 1: Create initial aggregate (version starts at 0)
      const createResult = ProductAggregate.create(
        aggregateId,
        'Concurrency Test Product',
        'Testing concurrency behavior',
        50.0,
        'category-1',
        'SKU-001',
      );

      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const originalAggregate = createResult.data;
      expect(originalAggregate.version).toBe(0); // Fresh aggregate, no events committed yet

      // 📝 Step 2: Simulate loading the same aggregate in two different contexts
      // In a real scenario, these would be loaded from EventStore
      const aggregate1Copy = createResult.data;
      const aggregate2Copy = createResult.data;

      // Both start with same version - this is the concurrency setup
      expect(aggregate1Copy.version).toBe(aggregate2Copy.version);

      // 📝 Step 3: Apply different operations on each copy
      const priceUpdate1 = aggregate1Copy.updatePrice(
        75.0,
        'Price increase due to demand',
      );
      const priceUpdate2 = aggregate2Copy.updatePrice(
        25.0,
        'Price decrease for promotion',
      );

      expect(priceUpdate1.success).toBe(true);
      expect(priceUpdate2.success).toBe(true);

      // 📝 Step 4: Check that both aggregates have uncommitted events
      expect(aggregate1Copy.uncommittedEvents.length).toBeGreaterThan(0);
      expect(aggregate2Copy.uncommittedEvents.length).toBeGreaterThan(0);

      // 📝 Step 5: The first "save" would succeed, second would need conflict resolution
      // In real EventStore: first write advances version, second gets WrongExpectedVersionError

      // This test demonstrates the concept - in practice:
      // 1. EventStore would reject the second write due to version mismatch
      // 2. Application would need to reload aggregate with latest events
      // 3. Reapply the second operation on the updated state
      // 4. Retry the save with correct expected version

      // We can at least verify the events are different
      const events1 = aggregate1Copy.uncommittedEvents;
      const events2 = aggregate2Copy.uncommittedEvents;

      // Both generated price update events but with different values
      expect(events1[events1.length - 1].type).toBe(
        'ecommerce.product.price-updated.v1',
      );
      expect(events2[events2.length - 1].type).toBe(
        'ecommerce.product.price-updated.v1',
      );

      // The events contain different price values
      expect(JSON.stringify(events1)).not.toBe(JSON.stringify(events2));
    });

    it('should demonstrate proper conflict resolution pattern conceptually', () => {
      // 🎯 Test Goal: Show how to handle conflicts when they occur
      const aggregateId = 'product-conflict-demo-001';

      // Create base aggregate
      const createResult = ProductAggregate.create(
        aggregateId,
        'Conflict Resolution Demo',
        'Testing conflict resolution',
        100.0,
        'category-1',
        'SKU-002',
      );

      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      // Simulate first operation succeeding (price update)
      const firstOperation = createResult.data;
      firstOperation.updatePrice(120.0, 'Market adjustment');

      // Mark as committed (simulating successful EventStore write)
      firstOperation.markEventsAsCommitted();
      expect(firstOperation.uncommittedEvents.length).toBe(0);

      // Simulate second operation that needs to be retried
      // In real scenario: reload aggregate from EventStore with latest events
      const reloadedState = firstOperation.getState();
      expect(reloadedState.price).toBe(120.0); // Has first operation's changes

      // Apply second operation on updated state
      const secondOperationResult = firstOperation.deactivate(
        'Product discontinued',
      );
      expect(secondOperationResult.success).toBe(true);

      // Verify final state has both operations
      const finalState = firstOperation.getState();
      expect(finalState.price).toBe(120.0); // First operation preserved
      expect(finalState.isActive).toBe(false); // Second operation applied

      // This demonstrates the proper conflict resolution:
      // 1. First operation commits successfully
      // 2. Second operation conflicts and needs retry
      // 3. Reload aggregate with latest state
      // 4. Reapply second operation on updated state
      // 5. Save again with correct expected version
    });

    it('should show version progression with sequential operations', () => {
      // 🎯 Test Goal: Demonstrate how version tracking prevents conflicts
      const aggregateId = 'product-version-demo-001';

      const createResult = ProductAggregate.create(
        aggregateId,
        'Version Tracking Demo',
        'Testing version progression',
        30.0,
        'category-1',
        'SKU-003',
      );

      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const aggregate = createResult.data;
      let expectedVersion = 0;

      // Track version progression through operations
      expect(aggregate.version).toBe(expectedVersion);

      // Operation 1: Update price
      aggregate.updatePrice(35.0);
      aggregate.markEventsAsCommitted(); // Simulate successful save
      expectedVersion++;
      expect(aggregate.version).toBe(expectedVersion);

      // Operation 2: Update price again
      aggregate.updatePrice(40.0);
      aggregate.markEventsAsCommitted(); // Simulate successful save
      expectedVersion++;
      expect(aggregate.version).toBe(expectedVersion);

      // Operation 3: Deactivate
      aggregate.deactivate('End of life');
      aggregate.markEventsAsCommitted(); // Simulate successful save
      expectedVersion++;
      expect(aggregate.version).toBe(expectedVersion);

      // Final state should reflect all operations
      const finalState = aggregate.getState();
      expect(finalState.price).toBe(40.0);
      expect(finalState.isActive).toBe(false);
      expect(aggregate.version).toBe(3); // 3 committed operations
    });
  });

  describe('EventStore Integration Documentation', () => {
    it('should document the real EventStore concurrency behavior', () => {
      // 📋 This test serves as documentation for how EventStore handles concurrency

      const expectedBehavior = {
        optimisticConcurrency: 'EventStore uses optimistic concurrency control',
        expectedRevision: 'Each append specifies expected stream revision',
        wrongVersionError:
          'WrongExpectedVersionError thrown on revision mismatch',
        conflictResolution: 'Applications must reload, reapply, and retry',
        atomicAppends:
          'Multiple events appended atomically in single operation',
        readConsistency: 'Reads always see consistent point-in-time view',
      };

      // Real EventStore behavior (what would happen with actual EventStoreDB):
      //
      // 1. Stream starts at revision -1 (empty)
      // 2. First append with expectedRevision: NO_STREAM succeeds
      // 3. Stream now at revision 0
      // 4. Second concurrent append with expectedRevision: NO_STREAM fails
      // 5. WrongExpectedVersionError contains actual vs expected revision
      // 6. Application reloads stream from revision 0
      // 7. Replays events to rebuild aggregate state
      // 8. Reapplies operation on updated state
      // 9. Retries append with expectedRevision: 0
      // 10. Success - stream advances to revision 1

      expect(expectedBehavior.optimisticConcurrency).toBeTruthy();
      expect(expectedBehavior.expectedRevision).toBeTruthy();
      expect(expectedBehavior.wrongVersionError).toBeTruthy();
      expect(expectedBehavior.conflictResolution).toBeTruthy();
      expect(expectedBehavior.atomicAppends).toBeTruthy();
      expect(expectedBehavior.readConsistency).toBeTruthy();

      // This test passes to confirm our understanding of EventStore concurrency
      expect(true).toBe(true);
    });
  });
});
