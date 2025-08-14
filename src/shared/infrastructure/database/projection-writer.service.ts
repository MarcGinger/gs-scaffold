import { Injectable, Inject } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import type { Logger } from 'pino';
import { APP_LOGGER, Log } from '../../logging';

/**
 * Domain Event interface for TypeORM projection
 */
export interface DomainEvent {
  type: string;
  id: string;
  data: any;
  metadata?: any;
}

/**
 * TypeORM Projection Writer
 *
 * Implements the checkpointed, idempotent projection pattern from COPILOT_FRAMEWORK_TYPEORM.
 * Handles batched event application with checkpoint advancement in a single transaction.
 *
 * Key features:
 * - Idempotent event processing using processed_event table
 * - Atomic checkpoint updates in same transaction
 * - UPSERT patterns for projections
 * - Proper error handling and rollback
 */
@Injectable()
export class ProjectionWriter {
  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Apply a batch of events and advance checkpoint atomically
   */
  async applyBatch(
    events: DomainEvent[],
    subscriptionId: string,
    commitPosition: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const event of events) {
        // Optional coarse de-dupe using processed_event table
        await queryRunner.query(
          `
          INSERT INTO processed_event(subscription_id, event_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
          [subscriptionId, event.id],
        );

        // Apply the domain event to read model
        await this.applyOne(queryRunner, event);
      }

      // Update checkpoint position atomically
      await queryRunner.query(
        `
        INSERT INTO projection_checkpoint(subscription_id, position)
        VALUES ($1, $2)
        ON CONFLICT (subscription_id)
        DO UPDATE SET position = EXCLUDED.position, updated_at = now()
      `,
        [subscriptionId, commitPosition],
      );

      await queryRunner.commitTransaction();

      Log.debug(this.logger, 'Projection batch applied successfully', {
        component: 'ProjectionWriter',
        method: 'applyBatch',
        subscriptionId,
        eventCount: events.length,
        commitPosition,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      Log.error(this.logger, error as Error, 'Projection batch failed', {
        component: 'ProjectionWriter',
        method: 'applyBatch',
        subscriptionId,
        eventCount: events.length,
        commitPosition,
      });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Apply a single domain event to read models
   */
  private async applyOne(
    queryRunner: QueryRunner,
    event: DomainEvent,
  ): Promise<void> {
    switch (event.type) {
      case 'ecommerce.product.created.v1':
        return this.applyProductCreated(queryRunner, event);

      case 'ecommerce.product.price-updated.v1':
        return this.applyProductPriceUpdated(queryRunner, event);

      case 'ecommerce.product.deactivated.v1':
        return this.applyProductDeactivated(queryRunner, event);

      default:
        Log.warn(this.logger, 'Unknown event type in projection', {
          component: 'ProjectionWriter',
          method: 'applyOne',
          eventType: event.type,
          eventId: event.id,
        });
        // Don't fail on unknown events - allows for forward compatibility
        return;
    }
  }

  /**
   * Apply ProductCreated event to product table
   */
  private async applyProductCreated(
    queryRunner: QueryRunner,
    event: DomainEvent,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { productId, name, description, price, categoryId, sku } = event.data;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { tenantId } = event.metadata || {};

    await queryRunner.query(
      `
      INSERT INTO product(
        id, tenant_id, name, description, price_minor, currency, 
        category_id, sku, is_active, aggregate_version, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
      ON CONFLICT (id) DO NOTHING
    `,
      [
        productId,
        tenantId,
        name,
        description,
        String(price * 100), // Convert to minor units
        'USD',
        categoryId,
        sku,
        true,
        '1',
      ],
    );
  }

  /**
   * Apply ProductPriceUpdated event to product table
   */
  private async applyProductPriceUpdated(
    queryRunner: QueryRunner,
    event: DomainEvent,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { productId, newPrice } = event.data;

    await queryRunner.query(
      `
      UPDATE product 
      SET price_minor = $1, updated_at = now()
      WHERE id = $2
    `,
      [String(newPrice * 100), productId], // Convert to minor units
    );
  }

  /**
   * Apply ProductDeactivated event to product table
   */
  private async applyProductDeactivated(
    queryRunner: QueryRunner,
    event: DomainEvent,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { productId, reason } = event.data;

    await queryRunner.query(
      `
      UPDATE product 
      SET is_active = false, deactivation_reason = $1, updated_at = now()
      WHERE id = $2
    `,
      [reason, productId],
    );
  }

  /**
   * Get current checkpoint position for a subscription
   */
  async getCheckpoint(subscriptionId: string): Promise<string | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.dataSource.query(
        `SELECT position FROM projection_checkpoint WHERE subscription_id = $1`,
        [subscriptionId],
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return result?.[0]?.position || null;
    } catch (error) {
      Log.error(this.logger, error as Error, 'Failed to get checkpoint', {
        component: 'ProjectionWriter',
        method: 'getCheckpoint',
        subscriptionId,
      });
      return null;
    }
  }
}
