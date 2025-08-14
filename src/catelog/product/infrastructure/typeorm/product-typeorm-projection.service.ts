import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProductEntity } from './entities/product.entity';
import { ProjectionWriter } from '../../../../shared/infrastructure/database/projection-writer.service';

/**
 * Product TypeORM Projection Service
 *
 * Provides TypeORM-based read model operations alongside Redis projections.
 * Following COPILOT_FRAMEWORK_TYPEORM patterns:
 * - Repository pattern for data access
 * - Keyset pagination for performance
 * - Composite indexes matching query patterns
 * - Tenant isolation
 */
@Injectable()
export class ProductTypeOrmProjectionService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepository: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
    private readonly projectionWriter: ProjectionWriter,
  ) {}

  /**
   * Find products with keyset pagination (following framework guidelines)
   */
  async findProducts(
    tenantId: string,
    options: {
      limit?: number;
      cursor?: {
        createdAt: Date;
        id: string;
      };
      isActive?: boolean;
      categoryId?: string;
    } = {},
  ): Promise<{
    products: ProductEntity[];
    hasMore: boolean;
    nextCursor?: { createdAt: Date; id: string };
  }> {
    const limit = Math.min(options.limit || 50, 100); // Cap at 100

    const queryBuilder = this.dataSource
      .createQueryBuilder(ProductEntity, 'p')
      .where('p.tenant_id = :tenantId', { tenantId });

    // Add filters
    if (options.isActive !== undefined) {
      queryBuilder.andWhere('p.is_active = :isActive', {
        isActive: options.isActive,
      });
    }

    if (options.categoryId) {
      queryBuilder.andWhere('p.category_id = :categoryId', {
        categoryId: options.categoryId,
      });
    }

    // Keyset pagination (cursor-based)
    if (options.cursor) {
      queryBuilder.andWhere(
        '(p.created_at, p.id) < (:cursorCreatedAt, :cursorId)',
        {
          cursorCreatedAt: options.cursor.createdAt,
          cursorId: options.cursor.id,
        },
      );
    }

    // Order by created_at DESC, id DESC for consistent pagination
    queryBuilder
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .limit(limit + 1); // Get one extra to check if there's more

    const results = await queryBuilder.getMany();
    const hasMore = results.length > limit;
    const products = hasMore ? results.slice(0, limit) : results;

    const nextCursor = hasMore
      ? {
          createdAt: results[limit - 1].createdAt,
          id: results[limit - 1].id,
        }
      : undefined;

    return {
      products,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Find product by ID and tenant
   */
  async findProductById(
    tenantId: string,
    productId: string,
  ): Promise<ProductEntity | null> {
    return this.productRepository.findOne({
      where: {
        id: productId,
        tenantId,
      },
    });
  }

  /**
   * Search products by name or SKU (simple text search)
   */
  async searchProducts(
    tenantId: string,
    searchTerm: string,
    options: {
      limit?: number;
      isActive?: boolean;
    } = {},
  ): Promise<ProductEntity[]> {
    const limit = Math.min(options.limit || 20, 50);

    const queryBuilder = this.dataSource
      .createQueryBuilder(ProductEntity, 'p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('(p.name ILIKE :searchTerm OR p.sku ILIKE :searchTerm)', {
        searchTerm: `%${searchTerm}%`,
      });

    if (options.isActive !== undefined) {
      queryBuilder.andWhere('p.is_active = :isActive', {
        isActive: options.isActive,
      });
    }

    return queryBuilder.orderBy('p.name', 'ASC').limit(limit).getMany();
  }

  /**
   * Get product count by category
   */
  async getProductCountByCategory(tenantId: string): Promise<
    {
      categoryId: string;
      count: number;
    }[]
  > {
    const result = await this.dataSource
      .createQueryBuilder(ProductEntity, 'p')
      .select('p.category_id', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.is_active = true')
      .groupBy('p.category_id')
      .orderBy('count', 'DESC')
      .getRawMany();

    return result.map((row: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      categoryId: row.categoryId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get current projection checkpoint for product events
   */
  async getProjectionCheckpoint(): Promise<string | null> {
    return this.projectionWriter.getCheckpoint('product-typeorm-projection');
  }

  /**
   * Get projection statistics
   */
  async getProjectionStats(tenantId: string): Promise<{
    totalProducts: number;
    activeProducts: number;
    lastUpdated: Date | null;
  }> {
    const results = await Promise.all([
      this.productRepository.count({
        where: { tenantId },
      }),
      this.productRepository.count({
        where: { tenantId, isActive: true },
      }),
      this.productRepository
        .createQueryBuilder('p')
        .select('MAX(p.updated_at)', 'lastUpdated')
        .where('p.tenant_id = :tenantId', { tenantId })
        .getRawOne(),
    ]);

    const totalProducts = results[0];
    const activeProducts = results[1];
    const lastUpdatedResult = results[2] as { lastUpdated: Date } | null;

    return {
      totalProducts,
      activeProducts,
      lastUpdated: lastUpdatedResult?.lastUpdated || null,
    };
  }
}
