import { Injectable, Inject } from '@nestjs/common';
import crypto from 'crypto';
import type { Logger } from 'pino';
import { NO_STREAM } from '@eventstore/db-client';
import { EventStoreService } from '../../../../infrastructure/eventstore/eventstore.service';
import { ProductAggregate } from '../../domain/product.aggregate';
import { Result, success, failure } from '../../../../domain/events/events';
import { Log } from '../../../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../../../shared/logging/logging.providers';
import {
  CreateProductCommand,
  UpdateProductPriceCommand,
  DeactivateProductCommand,
} from './product.commands';

/**
 * Product Command Handler - Write-side of CQRS for Product domain
 * Handles commands that modify product state and persist events
 */
@Injectable()
export class ProductCommandHandler {
  constructor(
    @Inject(APP_LOGGER) private readonly logger: Logger,
    private readonly eventStore: EventStoreService,
  ) {}

  /**
   * Handle CreateProductCommand - Create new product aggregate and persist events
   */
  async handle(command: CreateProductCommand): Promise<Result<string, Error>> {
    const { payload, metadata } = command;

    try {
      Log.info(this.logger, 'Handling CreateProductCommand', {
        component: 'ProductCommandHandler',
        method: 'handle.CreateProduct',
        correlationId: metadata.correlationId,
        tenantId: metadata.tenantId,
        productId: payload.id,
      });

      // Create product aggregate
      const createResult = ProductAggregate.create(
        payload.id,
        payload.name,
        payload.description,
        payload.price,
        payload.categoryId,
        payload.sku,
      );

      if (!createResult.success) {
        Log.error(
          this.logger,
          new Error(createResult.error),
          'Failed to create ProductAggregate',
          {
            component: 'ProductCommandHandler',
            method: 'handle.CreateProduct',
            correlationId: metadata.correlationId,
          },
        );
        return failure(new Error(createResult.error));
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
  ): Result<void, Error> {
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
