import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Product Read Model Entity
 *
 * Denormalized product view for fast queries.
 * Built from ProductAggregate events via projection.
 * Following COPILOT_FRAMEWORK_TYPEORM entity conventions.
 */
@Entity({ name: 'product' })
@Index('idx_product_tenant_active', ['tenantId', 'isActive'])
@Index('idx_product_category', ['categoryId'])
@Index('idx_product_sku', ['sku'])
@Index('idx_product_tenant_sku', ['tenantId', 'sku'], { unique: true })
export class ProductEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 60 })
  tenantId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'price_minor', type: 'bigint' })
  priceMinor: string; // Using string to avoid precision issues

  @Column({ name: 'currency', type: 'char', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'sku', type: 'varchar', length: 100 })
  sku: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'deactivation_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  deactivationReason?: string;

  @Column({ name: 'aggregate_version', type: 'bigint', default: 0 })
  aggregateVersion: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt?: Date;

  constructor(
    id: string,
    tenantId: string,
    name: string,
    description: string,
    priceMinor: string,
    categoryId: string,
    sku: string,
  ) {
    this.id = id;
    this.tenantId = tenantId;
    this.name = name;
    this.description = description;
    this.priceMinor = priceMinor;
    this.currency = 'USD';
    this.categoryId = categoryId;
    this.sku = sku;
    this.isActive = true;
    this.aggregateVersion = '0';
    this.createdAt = new Date();
  }
}
