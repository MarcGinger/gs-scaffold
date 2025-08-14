import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Logger } from 'pino';
import { ProductCatalogProjection } from './product-catalog.projection';
import { ActiveProductsProjection } from './active-products.projection';
import { APP_LOGGER } from 'src/shared/logging/logging.providers';
import { Log } from 'src/shared/logging/structured-logger';
import { EventStoreService } from 'src/shared/infrastructure/eventstore';
import { PersistentRunner } from 'src/shared/infrastructure/projections';

export interface EventEnvelope<T = unknown> {
  type: string;
  data: T;
  metadata: {
    eventId: string;
    streamId: string;
    revision: string;
    eventSequence: number;
    occurredAt: string;
    correlationId?: string;
    causationId?: string;
  };
}

interface SubscriptionInfo {
  stream: string;
  group: string;
  stop: () => void;
}

interface RawEvent {
  type: string;
  data: unknown;
  metadata?: EventMetadata;
  streamId: string;
  revision?: bigint;
}

interface EventMetadata {
  eventId?: string;
  id?: string;
  occurredAt?: string;
  correlationId?: string;
  causationId?: string;
  [key: string]: unknown;
}

/**
 * Product Event Subscription Service for Redis Projections
 *
 * Subscribes to EventStore product streams and routes events to appropriate projections.
 * Uses persistent subscriptions for guaranteed delivery and replay capability.
 *
 * This service is owned by the Product module in the modular monolith.
 */
@Injectable()
export class ProductEventSubscriptionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly subscriptions: Map<string, SubscriptionInfo> = new Map();
  private isRunning = false;

  constructor(
    private readonly eventStoreService: EventStoreService,
    private readonly persistentRunner: PersistentRunner,
    private readonly productCatalogProjection: ProductCatalogProjection,
    private readonly activeProductsProjection: ActiveProductsProjection,
    @Inject(APP_LOGGER) private readonly baseLogger: Logger,
  ) {}

  async onModuleInit() {
    await this.startProjectionSubscriptions();
  }

  onModuleDestroy() {
    this.stopProjectionSubscriptions();
  }

  /**
   * Start all product projection subscriptions
   */
  async startProjectionSubscriptions(): Promise<void> {
    if (this.isRunning) {
      Log.warn(
        this.baseLogger,
        'Product projection subscriptions already running',
        {
          component: 'ProductEventSubscriptionService',
          method: 'startProjectionSubscriptions',
        },
      );
      return;
    }

    try {
      // Start Product Catalog projection subscription
      await this.startProductCatalogSubscription();

      // Start Active Products projection subscription
      await this.startActiveProductsSubscription();

      this.isRunning = true;

      Log.info(
        this.baseLogger,
        'All product projection subscriptions started successfully',
        {
          component: 'ProductEventSubscriptionService',
          method: 'startProjectionSubscriptions',
          subscriptionCount: this.subscriptions.size,
        },
      );
    } catch (error) {
      Log.error(
        this.baseLogger,
        error as Error,
        'Failed to start product projection subscriptions',
        {
          component: 'ProductEventSubscriptionService',
          method: 'startProjectionSubscriptions',
        },
      );
      throw error;
    }
  }

  /**
   * Stop all projection subscriptions
   */
  stopProjectionSubscriptions(): void {
    if (!this.isRunning) {
      return;
    }

    for (const [name, subscription] of this.subscriptions) {
      try {
        subscription.stop();
        Log.info(
          this.baseLogger,
          `Stopped product projection subscription: ${name}`,
          {
            component: 'ProductEventSubscriptionService',
            method: 'stopProjectionSubscriptions',
            subscriptionName: name,
          },
        );
      } catch (error) {
        Log.error(
          this.baseLogger,
          error as Error,
          `Failed to stop product subscription: ${name}`,
          {
            component: 'ProductEventSubscriptionService',
            method: 'stopProjectionSubscriptions',
            subscriptionName: name,
          },
        );
      }
    }

    this.subscriptions.clear();
    this.isRunning = false;

    Log.info(this.baseLogger, 'All product projection subscriptions stopped', {
      component: 'ProductEventSubscriptionService',
      method: 'stopProjectionSubscriptions',
    });
  }

  /**
   * Start Product Catalog projection subscription
   */
  private async startProductCatalogSubscription(): Promise<void> {
    const subscriptionName = 'product-catalog-projection';
    const streamPattern = 'product-*'; // Subscribe to all product streams

    const projectFn = async (event: RawEvent) => {
      const envelope = this.mapToEventEnvelope(event);

      try {
        switch (envelope.type) {
          case 'ecommerce.product.created.v1':
            await this.productCatalogProjection.handleProductCreated(
              envelope as EventEnvelope<{
                productId: string;
                name: string;
                description: string;
                price: number;
                categoryId: string;
                sku: string;
              }>,
            );
            break;

          case 'ecommerce.product.price-updated.v1':
            await this.productCatalogProjection.handleProductPriceUpdated(
              envelope as EventEnvelope<{
                productId: string;
                oldPrice: number;
                newPrice: number;
                reason?: string;
              }>,
            );
            break;

          case 'ecommerce.product.deactivated.v1':
            await this.productCatalogProjection.handleProductDeactivated(
              envelope as EventEnvelope<{
                productId: string;
                reason: string;
              }>,
            );
            break;

          default:
            Log.debug(
              this.baseLogger,
              'Unhandled event type for product catalog',
              {
                component: 'ProductEventSubscriptionService',
                method: 'startProductCatalogSubscription',
                eventType: envelope.type,
                streamId: envelope.metadata.streamId,
              },
            );
        }

        Log.debug(this.baseLogger, 'Product catalog projection updated', {
          component: 'ProductEventSubscriptionService',
          method: 'startProductCatalogSubscription',
          eventType: envelope.type,
          streamId: envelope.metadata.streamId,
          eventId: envelope.metadata.eventId,
        });
      } catch (error) {
        Log.error(
          this.baseLogger,
          error as Error,
          'Product catalog projection failed',
          {
            component: 'ProductEventSubscriptionService',
            method: 'startProductCatalogSubscription',
            eventType: envelope.type,
            streamId: envelope.metadata.streamId,
            eventId: envelope.metadata.eventId,
          },
        );
        throw error; // Let persistent runner handle retry logic
      }
    };

    // Note: This uses the global persistent runner infrastructure
    // In a full modular approach, each module might have its own runner
    await this.persistentRunner.ensureAndRun(
      streamPattern,
      subscriptionName,
      projectFn,
      {
        progressEvery: 100,
        maxRetryCount: 5,
        messageTimeout: 30000,
      },
    );

    this.subscriptions.set(subscriptionName, {
      stream: streamPattern,
      group: subscriptionName,
      stop: () => this.persistentRunner.stop(streamPattern, subscriptionName),
    });

    Log.info(this.baseLogger, 'Product catalog subscription started', {
      component: 'ProductEventSubscriptionService',
      method: 'startProductCatalogSubscription',
      subscriptionName,
      streamPattern,
    });
  }

  /**
   * Start Active Products projection subscription
   */
  private async startActiveProductsSubscription(): Promise<void> {
    const subscriptionName = 'active-products-projection';
    const streamPattern = 'product-*'; // Subscribe to all product streams

    const projectFn = async (event: RawEvent) => {
      const envelope = this.mapToEventEnvelope(event);

      try {
        switch (envelope.type) {
          case 'ecommerce.product.created.v1':
            await this.activeProductsProjection.handleProductCreated(
              envelope as EventEnvelope<{
                productId: string;
                name: string;
                sku: string;
                price: number;
                categoryId: string;
              }>,
            );
            break;

          case 'ecommerce.product.price-updated.v1':
            await this.activeProductsProjection.handleProductPriceUpdated(
              envelope as EventEnvelope<{
                productId: string;
                newPrice: number;
              }>,
            );
            break;

          case 'ecommerce.product.deactivated.v1':
            await this.activeProductsProjection.handleProductDeactivated(
              envelope as EventEnvelope<{
                productId: string;
                reason: string;
              }>,
            );
            break;

          default:
            Log.debug(
              this.baseLogger,
              'Unhandled event type for active products',
              {
                component: 'ProductEventSubscriptionService',
                method: 'startActiveProductsSubscription',
                eventType: envelope.type,
                streamId: envelope.metadata.streamId,
              },
            );
        }

        Log.debug(this.baseLogger, 'Active products projection updated', {
          component: 'ProductEventSubscriptionService',
          method: 'startActiveProductsSubscription',
          eventType: envelope.type,
          streamId: envelope.metadata.streamId,
          eventId: envelope.metadata.eventId,
        });
      } catch (error) {
        Log.error(
          this.baseLogger,
          error as Error,
          'Active products projection failed',
          {
            component: 'ProductEventSubscriptionService',
            method: 'startActiveProductsSubscription',
            eventType: envelope.type,
            streamId: envelope.metadata.streamId,
            eventId: envelope.metadata.eventId,
          },
        );
        throw error; // Let persistent runner handle retry logic
      }
    };

    await this.persistentRunner.ensureAndRun(
      streamPattern,
      subscriptionName,
      projectFn,
      {
        progressEvery: 100,
        maxRetryCount: 5,
        messageTimeout: 30000,
      },
    );

    this.subscriptions.set(subscriptionName, {
      stream: streamPattern,
      group: subscriptionName,
      stop: () => this.persistentRunner.stop(streamPattern, subscriptionName),
    });

    Log.info(this.baseLogger, 'Active products subscription started', {
      component: 'ProductEventSubscriptionService',
      method: 'startActiveProductsSubscription',
      subscriptionName,
      streamPattern,
    });
  }

  /**
   * Map EventStore event to standardized envelope
   */
  private mapToEventEnvelope(event: RawEvent): EventEnvelope {
    const metadata = event.metadata ?? {};
    return {
      type: event.type,
      data: event.data,
      metadata: {
        eventId: String(metadata.eventId ?? metadata.id ?? 'unknown'),
        streamId: event.streamId,
        revision: event.revision?.toString() ?? '0',
        eventSequence: parseInt(event.revision?.toString() ?? '0', 10),
        occurredAt: String(metadata.occurredAt ?? new Date().toISOString()),
        correlationId: metadata.correlationId
          ? String(metadata.correlationId)
          : undefined,
        causationId: metadata.causationId
          ? String(metadata.causationId)
          : undefined,
      },
    };
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus(): {
    isRunning: boolean;
    subscriptions: Array<{
      name: string;
      status: string;
    }>;
  } {
    return {
      isRunning: this.isRunning,
      subscriptions: Array.from(this.subscriptions.keys()).map((name) => ({
        name,
        status: 'running', // In a real implementation, you'd check actual status
      })),
    };
  }

  /**
   * Restart a specific subscription
   */
  async restartSubscription(subscriptionName: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionName);
    if (subscription) {
      subscription.stop();
      this.subscriptions.delete(subscriptionName);
    }

    // Restart based on subscription name
    switch (subscriptionName) {
      case 'product-catalog-projection':
        await this.startProductCatalogSubscription();
        break;
      case 'active-products-projection':
        await this.startActiveProductsSubscription();
        break;
      default:
        throw new Error(`Unknown product subscription: ${subscriptionName}`);
    }

    Log.info(
      this.baseLogger,
      `Restarted product subscription: ${subscriptionName}`,
      {
        component: 'ProductEventSubscriptionService',
        method: 'restartSubscription',
        subscriptionName,
      },
    );
  }
}
