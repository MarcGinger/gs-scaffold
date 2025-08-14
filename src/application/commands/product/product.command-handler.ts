import { Injectable, Inject } from '@nestjs/common';
import type { Logger } from 'pino';
import { ProductAggregate } from '../../../domain/product/product.aggregate';
import { EventStoreService } from '../../../infrastructure/eventstore/eventstore.service';
import { Log } from '../../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../../shared/logging/logging.providers';
import { Result, success, failure } from '../../../domain/common/events';
import {
  CreateProductCommand,
  UpdateProductPriceCommand,
  DeactivateProductCommand,
} from './product.commands';
import { NO_STREAM } from '@eventstore/db-client';

/**
 * Product command handlers implementing CQRS pattern
 * Simplified version for basic functionality
 */
@Injectable()
export class ProductCommandHandler {
  constructor(
    private readonly eventStore: EventStoreService,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Handle CreateProductCommand
   */
  async handle(command: CreateProductCommand): Promise<Result<string, string>> {
    try {
      const { payload, metadata } = command;

      // Create new product aggregate
      const createResult = ProductAggregate.create(
        payload.id,
        payload.name,
        payload.description,
        payload.price,
        payload.categoryId,
        payload.sku,
      );

      if (!createResult.success) {
        Log.warn(this.logger, 'Product creation failed validation', {
          component: 'ProductCommandHandler',
          method: 'handle.CreateProduct',
          correlationId: metadata.correlationId,
          tenantId: metadata.tenantId,
          error: createResult.error,
        });
        return failure(createResult.error);
      }

      const aggregate = createResult.data;
      const events = aggregate.uncommittedEvents;

      if (events.length > 0) {
        // Convert to EventStore format
        const streamId = `product-${metadata.tenantId}-${payload.id}`;
        const eventEnvelopes = events.map((event) => ({
          type: event.type,
          data: event,
          metadata: {
            eventId: crypto.randomUUID(),
            correlationId: metadata.correlationId,
            causationId: metadata.causationId,
            commandId: metadata.correlationId,
            tenant: metadata.tenantId,
            user: metadata.userId ? { id: metadata.userId } : undefined,
            source: 'product-command-handler',
            occurredAt: new Date().toISOString(),
            schemaVersion: 1,
          },
        }));

        await this.eventStore.append(streamId, eventEnvelopes, NO_STREAM);
        aggregate.markEventsAsCommitted();
      }

      Log.info(this.logger, 'Product created successfully', {
        component: 'ProductCommandHandler',
        method: 'handle.CreateProduct',
        correlationId: metadata.correlationId,
        tenantId: metadata.tenantId,
        productId: payload.id,
      });

      return success(payload.id);
    } catch (error) {
      Log.error(
        this.logger,
        error as Error,
        'Failed to handle CreateProductCommand',
        {
          component: 'ProductCommandHandler',
          method: 'handle.CreateProduct',
          correlationId: command.metadata.correlationId,
        },
      );
      throw error;
    }
  }

  /**
   * Basic command dispatcher
   */
  executeCommand(
    command: UpdateProductPriceCommand | DeactivateProductCommand,
  ): Result<void, string> {
    // Simplified implementation - load from events would go here
    Log.info(this.logger, 'Command received (simplified handler)', {
      component: 'ProductCommandHandler',
      method: 'executeCommand',
      commandType: command.type,
      correlationId: command.metadata.correlationId,
    });

    // For now, just return success to demonstrate the pattern
    return success(undefined as void);
  }
}
