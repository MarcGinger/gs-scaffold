import { Module } from '@nestjs/common';
import { RedisProjectionService } from './redis-projection.service';
import { ProductCatalogProjection } from './product-catalog.projection';
import { ActiveProductsProjection } from './active-products.projection';
import { EventSubscriptionService } from './event-subscription.service';
import { ProductQueryService } from './product-query.service';
import { PersistentRunner } from './persistent.runner';
import { EventStoreModule } from '../eventstore/eventstore.module';
import { LoggingModule } from '../../shared/logging/logging.module';

/**
 * Redis Projections Module
 *
 * Provides Redis-based read models and projections for the application.
 * Includes event subscriptions, projection handlers, and query services.
 */
@Module({
  imports: [EventStoreModule, LoggingModule],
  providers: [
    // Core Redis services
    RedisProjectionService,

    // Projection handlers
    ProductCatalogProjection,
    ActiveProductsProjection,

    // Event subscription service
    EventSubscriptionService,
    PersistentRunner,

    // Query services
    ProductQueryService,
  ],
  exports: [
    // Export query services for use in controllers
    ProductQueryService,

    // Export projection services for manual operations
    ProductCatalogProjection,
    ActiveProductsProjection,

    // Export subscription service for health checks
    EventSubscriptionService,

    // Export Redis service for direct access if needed
    RedisProjectionService,
  ],
})
export class RedisProjectionsModule {}
