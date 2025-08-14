import { ProductAggregate } from './src/domain/product/product.aggregate';
import { v4 as uuidv4 } from 'uuid';

/**
 * Demonstration of how to use the Product aggregate with EventStore infrastructure
 */
function demoProductAggregate() {
  console.log('🚀 Product Aggregate Demo\n');

  // 1. Create a new product
  console.log('1. Creating a new product...');
  const productId = uuidv4();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const createResult = ProductAggregate.create(
    productId,
    'Premium Wireless Headphones',
    'High-quality wireless headphones with noise cancellation',
    299.99,
    uuidv4(), // categoryId
    'WH-PREM-001',
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!createResult.success) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.error('Failed to create product:', createResult.error);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const product = createResult.data;
  console.log('✅ Product created successfully');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  console.log('   State:', JSON.stringify(product.getState(), null, 2));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.log('   Uncommitted events:', product.uncommittedEvents.length);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.log('   Version:', product.version);

  // Simulate committing events (in real scenario, this would be done by the repository)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  product.markEventsAsCommitted();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.log('   Events committed, version:', product.version);

  // 2. Update product price
  console.log('\n2. Updating product price...');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const priceUpdateResult = product.updatePrice(249.99, 'Holiday discount');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!priceUpdateResult.success) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.error('Failed to update price:', priceUpdateResult.error);
    return;
  }

  console.log('✅ Price updated successfully');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  console.log('   New price:', product.getState()?.price);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.log('   Uncommitted events:', product.uncommittedEvents.length);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.log('   Latest event:', product.uncommittedEvents[0]?.type);

  // Commit price update
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  product.markEventsAsCommitted();

  // 3. Try invalid operations to show business rule enforcement
  console.log('\n3. Testing business rules...');

  // Try negative price
  const invalidPriceResult = product.updatePrice(-50);
  if (!invalidPriceResult.success) {
    console.log(
      '❌ Negative price update (expected failure):',
      invalidPriceResult.error,
    );
  }

  // Try same price
  const samePriceResult = product.updatePrice(249.99);
  if (!samePriceResult.success) {
    console.log(
      '❌ Same price update (expected failure):',
      samePriceResult.error,
    );
  }

  // 4. Deactivate product
  console.log('\n4. Deactivating product...');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const deactivateResult = product.deactivate('Product discontinued');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!deactivateResult.success) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.error('Failed to deactivate:', deactivateResult.error);
    return;
  }

  console.log('✅ Product deactivated successfully');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  console.log('   Is active:', product.getState()?.isActive);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.log('   Uncommitted events:', product.uncommittedEvents.length);

  // Commit deactivation
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  product.markEventsAsCommitted();

  // 5. Try to update price on inactive product (should fail)
  console.log('\n5. Testing inactive product constraint...');
  const inactivePriceResult = product.updatePrice(199.99);
  if (!inactivePriceResult.success) {
    console.log(
      '❌ Price update on inactive product (expected failure):',
      inactivePriceResult.error,
    );
  }

  // 6. Create snapshot
  console.log('\n6. Creating snapshot...');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const snapshot = product.createSnapshot();
  console.log('✅ Snapshot created:', {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    id: snapshot?.id,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    name: snapshot?.name,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    price: snapshot?.price,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    isActive: snapshot?.isActive,
  });

  // 7. Show domain events that would be persisted
  console.log('\n7. Domain Events Summary:');
  console.log('   In a real application, these events would be:');
  console.log('   • Appended to EventStore streams');
  console.log('   • Published to projections via subscriptions');
  console.log('   • Used for rebuilding aggregate state');
  console.log('   • Tracked in outbox for reliable messaging');

  console.log('\n🎉 Demo completed successfully!');
}

// Run the demo
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
demoProductAggregate();
