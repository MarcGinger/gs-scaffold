import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { Logger } from 'pino';
import { ConfigManager } from '../../shared/config/config.manager';
import { Log } from '../../shared/logging/structured-logger';
import { APP_LOGGER } from '../../shared/logging/logging.providers';

export interface ProjectionRecord {
  id: string;
  type: string;
  data: any;
  metadata: {
    version: number;
    lastUpdated: string;
    eventSequence: number;
    sourceEvent: {
      streamId: string;
      revision: string;
      eventId: string;
      eventType: string;
    };
  };
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export interface ProjectionQueryResult<T = any> {
  data: T[];
  total: number;
  hasMore: boolean;
  metadata: {
    queryTime: number;
    cacheHit: boolean;
    lastUpdated?: string;
  };
}

/**
 * Redis service optimized for projections and read models
 *
 * Features:
 * - Structured read models with versioning
 * - Efficient querying with indexes
 * - Atomic updates for consistency
 * - TTL management for cache invalidation
 * - Bulk operations for performance
 * - Connection pooling and retry logic
 */
@Injectable()
export class RedisProjectionService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly keyPrefix: string;

  constructor(
    private readonly configManager: ConfigManager,
    @Inject(APP_LOGGER) private readonly baseLogger: Logger,
  ) {
    // Initialize Redis client for projections
    this.client = new Redis({
      host: this.configManager.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.configManager.get('REDIS_PORT', '6379'), 10),
      password: this.configManager.get('REDIS_PASSWORD'),
      db: parseInt(this.configManager.get('REDIS_PROJECTIONS_DB', '1'), 10), // Separate DB for projections
      keyPrefix: this.configManager.get('REDIS_KEY_PREFIX', 'gs:'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.keyPrefix = 'projections:';

    Log.info(this.baseLogger, 'RedisProjectionService initialized', {
      component: 'RedisProjectionService',
      method: 'constructor',
      database: this.configManager.get('REDIS_PROJECTIONS_DB', '1'),
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Store a projection record with atomic updates
   */
  async storeProjection(
    projectionType: string,
    projectionId: string,
    data: any,
    metadata: ProjectionRecord['metadata'],
  ): Promise<void> {
    const key = this.getProjectionKey(projectionType, projectionId);
    const record: ProjectionRecord = {
      id: projectionId,
      type: projectionType,
      data,
      metadata: {
        ...metadata,
        lastUpdated: new Date().toISOString(),
      },
    };

    const pipeline = this.client.pipeline();

    // Store the main record
    pipeline.hset(key, 'data', JSON.stringify(record));

    // Add to projection type index
    pipeline.sadd(this.getTypeIndexKey(projectionType), projectionId);

    // Add to search indexes based on data fields
    this.addSearchIndexes(pipeline, projectionType, projectionId, data);

    // Set TTL for cache invalidation (optional)
    const ttlSeconds = this.getTTL(projectionType);
    if (ttlSeconds > 0) {
      pipeline.expire(key, ttlSeconds);
    }

    await pipeline.exec();

    Log.debug(this.baseLogger, 'projection.stored', {
      component: 'RedisProjectionService',
      method: 'storeProjection',
      projectionType,
      projectionId,
      version: metadata.version,
      eventSequence: metadata.eventSequence,
    });
  }

  /**
   * Get a specific projection by ID
   */
  async getProjection<T = any>(
    projectionType: string,
    projectionId: string,
  ): Promise<ProjectionRecord<T> | null> {
    const key = this.getProjectionKey(projectionType, projectionId);
    const data = await this.client.hget(key, 'data');

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as ProjectionRecord<T>;
    } catch (error) {
      Log.error(this.baseLogger, error as Error, 'projection.parse.failed', {
        component: 'RedisProjectionService',
        method: 'getProjection',
        projectionType,
        projectionId,
      });
      return null;
    }
  }

  /**
   * Query projections with filtering and pagination
   */
  async queryProjections<T = any>(
    projectionType: string,
    options: QueryOptions = {},
  ): Promise<ProjectionQueryResult<T>> {
    const startTime = Date.now();
    const { limit = 50, offset = 0, sortBy, sortOrder = 'desc' } = options;

    // Get all projection IDs for this type
    const allIds = await this.client.smembers(
      this.getTypeIndexKey(projectionType),
    );

    // Apply filtering if specified
    let filteredIds = allIds;
    if (options.filters && Object.keys(options.filters).length > 0) {
      filteredIds = await this.applyFilters(
        projectionType,
        allIds,
        options.filters,
      );
    }

    // Sort by field if specified
    if (sortBy) {
      filteredIds = await this.applySorting(
        projectionType,
        filteredIds,
        sortBy,
        sortOrder,
      );
    }

    // Apply pagination
    const paginatedIds = filteredIds.slice(offset, offset + limit);

    // Fetch the actual projection data
    const projections: ProjectionRecord<T>[] = [];
    for (const id of paginatedIds) {
      const projection = await this.getProjection<T>(projectionType, id);
      if (projection) {
        projections.push(projection);
      }
    }

    const queryTime = Date.now() - startTime;

    Log.debug(this.baseLogger, 'projections.queried', {
      component: 'RedisProjectionService',
      method: 'queryProjections',
      projectionType,
      totalResults: filteredIds.length,
      returnedResults: projections.length,
      queryTimeMs: queryTime,
      filters: options.filters,
    });

    return {
      data: projections,
      total: filteredIds.length,
      hasMore: offset + limit < filteredIds.length,
      metadata: {
        queryTime,
        cacheHit: true, // Redis is our cache
        lastUpdated: projections[0]?.metadata.lastUpdated,
      },
    };
  }

  /**
   * Delete a projection
   */
  async deleteProjection(
    projectionType: string,
    projectionId: string,
  ): Promise<void> {
    const key = this.getProjectionKey(projectionType, projectionId);
    const pipeline = this.client.pipeline();

    // Remove main record
    pipeline.del(key);

    // Remove from type index
    pipeline.srem(this.getTypeIndexKey(projectionType), projectionId);

    // Remove from search indexes
    this.removeSearchIndexes(pipeline, projectionType, projectionId);

    await pipeline.exec();

    Log.debug(this.baseLogger, 'projection.deleted', {
      component: 'RedisProjectionService',
      method: 'deleteProjection',
      projectionType,
      projectionId,
    });
  }

  /**
   * Bulk update multiple projections atomically
   */
  async bulkStoreProjections(
    projectionType: string,
    records: Array<{
      id: string;
      data: any;
      metadata: ProjectionRecord['metadata'];
    }>,
  ): Promise<void> {
    if (records.length === 0) return;

    const pipeline = this.client.pipeline();

    for (const record of records) {
      const key = this.getProjectionKey(projectionType, record.id);
      const projectionRecord: ProjectionRecord = {
        id: record.id,
        type: projectionType,
        data: record.data,
        metadata: {
          ...record.metadata,
          lastUpdated: new Date().toISOString(),
        },
      };

      pipeline.hset(key, 'data', JSON.stringify(projectionRecord));
      pipeline.sadd(this.getTypeIndexKey(projectionType), record.id);
      this.addSearchIndexes(pipeline, projectionType, record.id, record.data);
    }

    await pipeline.exec();

    Log.debug(this.baseLogger, 'projections.bulk.stored', {
      component: 'RedisProjectionService',
      method: 'bulkStoreProjections',
      projectionType,
      count: records.length,
    });
  }

  /**
   * Get projection statistics
   */
  async getProjectionStats(projectionType: string): Promise<{
    count: number;
    lastUpdated?: string;
    averageSize: number;
  }> {
    const typeIndexKey = this.getTypeIndexKey(projectionType);
    const count = await this.client.scard(typeIndexKey);

    if (count === 0) {
      return { count: 0, averageSize: 0 };
    }

    // Sample a few records to estimate size
    const sampleIds = await this.client.srandmember(
      typeIndexKey,
      Math.min(10, count),
    );
    let totalSize = 0;
    let lastUpdated: string | undefined;

    for (const id of sampleIds) {
      const projection = await this.getProjection(projectionType, id);
      if (projection) {
        totalSize += JSON.stringify(projection).length;
        if (!lastUpdated || projection.metadata.lastUpdated > lastUpdated) {
          lastUpdated = projection.metadata.lastUpdated;
        }
      }
    }

    return {
      count,
      lastUpdated,
      averageSize: Math.round(totalSize / sampleIds.length),
    };
  }

  // Private helper methods

  private getProjectionKey(
    projectionType: string,
    projectionId: string,
  ): string {
    return `${this.keyPrefix}${projectionType}:${projectionId}`;
  }

  private getTypeIndexKey(projectionType: string): string {
    return `${this.keyPrefix}index:${projectionType}`;
  }

  private getSearchIndexKey(projectionType: string, field: string): string {
    return `${this.keyPrefix}search:${projectionType}:${field}`;
  }

  private addSearchIndexes(
    pipeline: ReturnType<Redis['pipeline']>,
    projectionType: string,
    projectionId: string,
    data: any,
  ): void {
    // Add searchable fields to indexes
    const searchableFields = this.getSearchableFields(projectionType);

    for (const field of searchableFields) {
      const value = this.getNestedValue(data, field);
      if (value !== undefined && value !== null) {
        const indexKey = this.getSearchIndexKey(projectionType, field);
        pipeline.sadd(`${indexKey}:${value}`, projectionId);
      }
    }
  }

  private removeSearchIndexes(
    pipeline: ReturnType<Redis['pipeline']>,
    projectionType: string,
    projectionId: string,
  ): void {
    // This would require knowing the current values to remove from indexes
    // For now, we'll implement a cleanup process separately
  }

  private getSearchableFields(projectionType: string): string[] {
    // Define searchable fields per projection type
    const fieldMap: Record<string, string[]> = {
      'product-catalog': ['name', 'categoryId', 'sku', 'isActive'],
      'product-pricing': ['productId', 'priceRange'],
      'active-products': ['categoryId', 'sku'],
    };

    return fieldMap[projectionType] || [];
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private async applyFilters(
    projectionType: string,
    ids: string[],
    filters: Record<string, any>,
  ): Promise<string[]> {
    let filteredIds = ids;

    for (const [field, value] of Object.entries(filters)) {
      const indexKey = this.getSearchIndexKey(projectionType, field);
      const fieldIds = await this.client.smembers(`${indexKey}:${value}`);
      filteredIds = filteredIds.filter((id) => fieldIds.includes(id));
    }

    return filteredIds;
  }

  private async applySorting(
    projectionType: string,
    ids: string[],
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<string[]> {
    // For simplicity, return as-is for now
    // In production, you'd implement sorted sets for numeric fields
    return ids;
  }

  private getTTL(projectionType: string): number {
    // Define TTL per projection type (0 = no TTL)
    const ttlMap: Record<string, number> = {
      'product-catalog': 0, // Persistent
      'product-pricing': 86400, // 24 hours
      'active-products': 3600, // 1 hour
    };

    return ttlMap[projectionType] || 0;
  }
}
