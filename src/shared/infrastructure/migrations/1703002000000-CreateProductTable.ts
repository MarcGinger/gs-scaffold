import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Product Read Model Table
 *
 * Creates the product table for read model projections from ProductAggregate.
 * Following COPILOT_FRAMEWORK_TYPEORM conventions:
 * - Explicit column names and types
 * - Proper indexing for query patterns
 * - Tenant isolation with unique constraints
 * - Audit columns (created_at, updated_at)
 */
export class CreateProductTable1703002000000 implements MigrationInterface {
  name = 'CreateProductTable1703002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create product read model table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product (
        id                  uuid             PRIMARY KEY,
        tenant_id           varchar(60)      NOT NULL,
        name                varchar(255)     NOT NULL,
        description         text,
        price_minor         bigint           NOT NULL DEFAULT 0,
        currency            char(3)          NOT NULL DEFAULT 'USD',
        category_id         uuid             NOT NULL,
        sku                 varchar(100)     NOT NULL,
        is_active           boolean          NOT NULL DEFAULT true,
        deactivation_reason varchar(500),
        aggregate_version   bigint           NOT NULL DEFAULT 0,
        created_at          timestamptz      NOT NULL DEFAULT now(),
        updated_at          timestamptz
      );
    `);

    // Create indexes for query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_product_tenant_active 
      ON product(tenant_id, is_active);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_product_category 
      ON product(category_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_product_sku 
      ON product(sku);
    `);

    // Unique constraint for tenant + SKU (business rule enforcement)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_tenant_sku 
      ON product(tenant_id, sku);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_product_tenant_sku
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_product_sku
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_product_category
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_product_tenant_active
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS product`);
  }
}
