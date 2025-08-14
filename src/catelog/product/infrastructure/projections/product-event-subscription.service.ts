import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Logger } from 'pino';
import { EventStoreService } from '../../../../../infrastructure/eventstore/eventstore.service';
import { PersistentRunner } from '../../../../../infrastructure/projections/persistent.runner';
import { ProductCatalogProjection } from './product-catalog.projection';
import { ActiveProductsProjection } from './active-products.projection';
import { Log } from '../../../../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../../../../shared/logging/logging.providers';

export interface EventEnvelope {
  type: string;
  data: any;
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
  private readonly subscriptions: Map<string, any> = new Map();
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

  async onModuleDestroy() {
    await this.stopProjectionSubscriptions();
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
  async stopProjectionSubscriptions(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    for (const [name, subscription] of this.subscriptions) {
      try {
        await subscription.stop();
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

    const projectFn = async (event: {
      type: string;
      data: any;
      metadata: any;
      streamId: string;
      revision?: bigint;
    }) => {
      const envelope = this.mapToEventEnvelope(event);

      try {
        switch (envelope.type) {
          case 'ecommerce.product.created.v1':
            await this.productCatalogProjection.handleProductCreated(envelope);
            break;

          case 'ecommerce.product.price-updated.v1':
            await this.productCatalogProjection.handleProductPriceUpdated(
              envelope,
            );
            break;

          case 'ecommerce.product.deactivated.v1':
            await this.productCatalogProjection.handleProductDeactivated(
              envelope,
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
    const subscription = await this.persistentRunner.startStream(
      streamPattern,
      subscriptionName,
      projectFn,
      {
        progressEvery: 100,
        maxRetryCount: 5,
        checkpointAfter: 1000, // Checkpoint every 1000 events
        messageTimeout: 30000, // 30 second timeout
        onFailure: async (ctx) => {
          Log.error(
            this.baseLogger,
            ctx.error,
            'Product catalog projection persistent failure',
            {
              component: 'ProductEventSubscriptionService',
              method: 'startProductCatalogSubscription',
              stream: ctx.stream,
              group: ctx.group,
              eventId: ctx.event.id,
              eventType: ctx.event.type,
            },
          );
          return 'retry'; // Retry failed events
        },
      },
    );

    this.subscriptions.set(subscriptionName, subscription);

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

    const projectFn = async (event: {
      type: string;
      data: any;
      metadata: any;
      streamId: string;
      revision?: bigint;
    }) => {
      const envelope = this.mapToEventEnvelope(event);

      try {
        switch (envelope.type) {
          case 'ecommerce.product.created.v1':
            await this.activeProductsProjection.handleProductCreated(envelope);
            break;

          case 'ecommerce.product.price-updated.v1':
            await this.activeProductsProjection.handleProductPriceUpdated(
              envelope,
            );
            break;

          case 'ecommerce.product.deactivated.v1':
            await this.activeProductsProjection.handleProductDeactivated(
              envelope,
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

    const subscription = await this.persistentRunner.startStream(
      streamPattern,
      subscriptionName,
      projectFn,
      {
        progressEvery: 100,
        maxRetryCount: 5,
        checkpointAfter: 1000,
        messageTimeout: 30000,
        onFailure: async (ctx) => {
          Log.error(
            this.baseLogger,
            ctx.error,
            'Active products projection persistent failure',
            {
              component: 'ProductEventSubscriptionService',
              method: 'startActiveProductsSubscription',
              stream: ctx.stream,
              group: ctx.group,
              eventId: ctx.event.id,
              eventType: ctx.event.type,
            },
          );
          return 'retry';
        },
      },
    );

    this.subscriptions.set(subscriptionName, subscription);

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
  private mapToEventEnvelope(event: {
    type: string;
    data: any;
    metadata: any;
    streamId: string;
    revision?: bigint;
  }): EventEnvelope {
    return {
      type: event.type,
      data: event.data,
      metadata: {
        eventId: event.metadata?.eventId || event.metadata?.id || 'unknown',
        streamId: event.streamId,
        revision: event.revision?.toString() || '0',
        eventSequence: parseInt(event.revision?.toString() || '0', 10),
        occurredAt: event.metadata?.occurredAt || new Date().toISOString(),
        correlationId: event.metadata?.correlationId,
        causationId: event.metadata?.causationId,
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
      await subscription.stop();
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
