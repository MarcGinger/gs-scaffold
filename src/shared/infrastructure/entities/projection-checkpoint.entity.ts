import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Projection Checkpoint Entity
 *
 * Stores checkpoint positions for EventStore projections.
 * Required for TypeORM projection pattern in COPILOT_FRAMEWORK_TYPEORM.
 */
@Entity({ name: 'projection_checkpoint' })
@Index('idx_checkpoint_subscription', ['subscriptionId'])
export class ProjectionCheckpointEntity {
  @PrimaryColumn({ name: 'subscription_id', type: 'varchar', length: 120 })
  subscriptionId: string;

  @Column({ name: 'position', type: 'varchar', length: 120 })
  position: string;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;

  constructor(subscriptionId: string, position: string) {
    this.subscriptionId = subscriptionId;
    this.position = position;
    this.updatedAt = new Date();
  }
}
