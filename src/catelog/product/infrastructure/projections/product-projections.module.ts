import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Product-specific projection services
import { ProductRedisProjectionService } from './product-redis-projection.service';
import { ProductCatalogProjection } from './product-catalog.projection';
import { ActiveProductsProjection } from './active-products.projection';
import { ProductQueryService } from './product-query.service';
import { ProductEventSubscriptionService } from './product-event-subscription.service';
import { EventStoreModule } from 'src/infrastructure/eventstore/eventstore.module';
import { PersistentRunner } from 'src/infrastructure/projections/persistent.runner';
import { LoggingModule } from 'src/shared/logging/logging.module';

/**
 * Product Projections Module
 *
 * Contains all Redis projection infrastructure owned by the Product module.
 * This follows modular monolith principles where each module owns its infrastructure.
 */
@Module({
  imports: [
    ConfigModule, // For Redis configuration
    LoggingModule, // For structured logging
    EventStoreModule, // For event subscriptions
  ],
  providers: [
    // Core Redis service for product projections
    ProductRedisProjectionService,

    // Projection handlers
    ProductCatalogProjection,
    ActiveProductsProjection,

    // High-level query service
    ProductQueryService,

    // Event subscription management
    ProductEventSubscriptionService,

    // Reuse global persistent runner infrastructure
    // In a fully modular approach, this might be product-specific too
    PersistentRunner,
  ],
  exports: [
    // Export query services for controllers
    ProductQueryService,
    ProductEventSubscriptionService,

    // Export projections for direct use if needed
    ProductCatalogProjection,
    ActiveProductsProjection,
  ],
})
export class ProductProjectionsModule {}
