import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial Migration - Projection Infrastructure
 *
 * Creates the core projection tables required by COPILOT_FRAMEWORK_TYPEORM:
 * - projection_checkpoint: Stores EventStore subscription positions
 * - processed_event: Tracks processed events for idempotency
 *
 * Following safe migration practices:
 * - Transactional DDL where supported
 * - IF NOT EXISTS for safety
 * - Explicit table and column names
 */
export class CreateProjectionInfrastructure1703001000000
  implements MigrationInterface
{
  name = 'CreateProjectionInfrastructure1703001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create projection checkpoint table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projection_checkpoint (
        subscription_id varchar(120) PRIMARY KEY,
        position        varchar(120) NOT NULL,
        updated_at      timestamptz  NOT NULL DEFAULT now()
      );
    `);

    // Create processed event table for idempotency
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS processed_event (
        subscription_id varchar(120) NOT NULL,
        event_id        varchar(120) NOT NULL,
        processed_at    timestamptz  NOT NULL DEFAULT now(),
        PRIMARY KEY (subscription_id, event_id)
      );
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_checkpoint_subscription 
      ON projection_checkpoint(subscription_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_processed_event_subscription_event 
      ON processed_event(subscription_id, event_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_processed_event_subscription_event
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_checkpoint_subscription
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS processed_event`);
    await queryRunner.query(`DROP TABLE IF EXISTS projection_checkpoint`);
  }
}
