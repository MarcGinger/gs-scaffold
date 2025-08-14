import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Processed Event Entity
 *
 * Tracks processed events for idempotent projection handling.
 * Part of the projection writer pattern in COPILOT_FRAMEWORK_TYPEORM.
 */
@Entity({ name: 'processed_event' })
@Index('idx_processed_event_subscription_event', ['subscriptionId', 'eventId'])
export class ProcessedEventEntity {
  @PrimaryColumn({ name: 'subscription_id', type: 'varchar', length: 120 })
  subscriptionId: string;

  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 120 })
  eventId: string;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  processedAt: Date;

  constructor(subscriptionId: string, eventId: string) {
    this.subscriptionId = subscriptionId;
    this.eventId = eventId;
    this.processedAt = new Date();
  }
}
