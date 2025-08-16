import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { ILogger } from 'src/shared/logger';
import { IUserToken } from 'src/shared/auth';

@Injectable()
export class RedisUtilityService {
  private readonly redis: Redis;

  constructor(
    private readonly redisService: RedisService,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {
    const client = this.redisService.getOrThrow();
    if (!client) {
      throw new Error('Redis client not available');
    }
    this.redis = client;
  }

  /**
   * Builds a tenant-aware Redis key
   * @private
   */
  private buildKey(user: IUserToken, type: string): string {
    const tenant = user?.tenant || 'core';
    return `${type}:${tenant}`;
  }

  /**
   * Safely parses JSON with error handling
   * @private
   */
  private safeParse<T>(raw: string): T | undefined {
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(
        {
          raw,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to parse Redis value',
      );
      return undefined;
    }
  }

  /**
   * Retrieves a single item from Redis hash by key
   * @param user - User context for tenant isolation
   * @param category - The category/type of data
   * @param key - The specific key to retrieve
   * @returns The parsed item or undefined if not found
   */
  async getOne<T>(
    user: IUserToken,
    category: string,
    key: string,
  ): Promise<T | undefined> {
    try {
      const path = this.buildKey(user, category);
      const raw = await this.redis.hget(path, key);
      return raw ? this.safeParse<T>(raw) : undefined;
    } catch (error) {
      this.logger.error(
        {
          category,
          key,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis getOne operation failed',
      );
      return undefined;
    }
  }

  /**
   * Retrieves all items from Redis hash as a record
   * @param user - User context for tenant isolation
   * @param type - The category/type of data
   * @returns Record of key-value pairs
   */
  async getAll<T>(user: IUserToken, type: string): Promise<Record<string, T>> {
    try {
      const rawMap = await this.redis.hgetall(this.buildKey(user, type));
      return Object.entries(rawMap).reduce(
        (acc, [key, raw]) => {
          const parsed = this.safeParse<T>(raw);
          if (parsed !== undefined) acc[key] = parsed;
          return acc;
        },
        {} as Record<string, T>,
      );
    } catch (error) {
      this.logger.error(
        {
          type,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis getAll operation failed',
      );
      return {};
    }
  }

  /**
   * Checks if a key exists in Redis hash
   * @param user - User context for tenant isolation
   * @param type - The category/type of data
   * @param code - The key to check
   * @returns Boolean indicating existence
   */
  async exists(user: IUserToken, type: string, code: string): Promise<boolean> {
    try {
      return (await this.redis.hexists(this.buildKey(user, type), code)) === 1;
    } catch (error) {
      this.logger.error(
        {
          type,
          code,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis exists operation failed',
      );
      return false;
    }
  }

  /**
   * Retrieves all values from Redis hash as an array
   * @param user - User context for tenant isolation
   * @param type - The category/type of data
   * @returns Array of parsed values
   */
  async getAllValues<T>(user: IUserToken, type: string): Promise<T[]> {
    try {
      const values = await this.redis.hvals(this.buildKey(user, type));
      return values
        .map((raw) => this.safeParse<T>(raw))
        .filter((v): v is T => v !== undefined);
    } catch (error) {
      this.logger.error(
        {
          type,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis getAllValues operation failed',
      );
      return [];
    }
  }

  /**
   * Batch lookup for multiple codes in a given type
   * @param user - User context for tenant isolation
   * @param type - The category/type of data
   * @param codes - Array of keys to retrieve
   * @returns Array of parsed values (excluding null/failed parses)
   */
  async getMany<T>(
    user: IUserToken,
    type: string,
    codes: string[],
  ): Promise<T[]> {
    if (!codes.length) return [];

    try {
      const rawValues = await this.redis.hmget(
        this.buildKey(user, type),
        ...codes,
      );
      const result: Array<T> = [];
      codes.forEach((code, idx) => {
        const raw = rawValues[idx];
        if (raw) {
          const parsed = this.safeParse<T>(raw);
          if (parsed) {
            result.push(parsed);
          }
        }
      });
      return result;
    } catch (error) {
      this.logger.error(
        {
          type,
          codesCount: codes.length,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis getMany operation failed',
      );
      return [];
    }
  }

  /**
   * Writes a value to Redis hash
   * @param user - User context for tenant isolation
   * @param category - The category/type of data
   * @param key - The key to store the value under
   * @param value - The value to store
   * @param ttl - Optional TTL in seconds
   */
  async write<T>(
    user: IUserToken,
    category: string,
    key: string,
    value: T,
    ttl?: number,
  ): Promise<void> {
    try {
      const path = this.buildKey(user, category);
      const rawValue = JSON.stringify(value);
      await this.redis.hset(path, key, rawValue);
      if (ttl) {
        await this.redis.expire(path, ttl);
      }
    } catch (error) {
      this.logger.error(
        {
          category,
          key,
          tenant: user?.tenant,
          ttl,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis write operation failed',
      );
      throw error;
    }
  }

  /**
   * Delete a single field from Redis hash
   * @param user - User context for tenant isolation
   * @param category - The category/type of data
   * @param key - The key to delete
   */
  async delete(user: IUserToken, category: string, key: string): Promise<void> {
    try {
      const path = this.buildKey(user, category);
      await this.redis.hdel(path, key);
    } catch (error) {
      this.logger.error(
        {
          category,
          key,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis delete operation failed',
      );
      throw error;
    }
  }

  /**
   * Delete all values for a category for a tenant
   * @param user - User context for tenant isolation
   * @param category - The category to delete
   */
  async deleteCategory(user: IUserToken, category: string): Promise<void> {
    try {
      const path = this.buildKey(user, category);
      await this.redis.del(path);
    } catch (error) {
      this.logger.error(
        {
          category,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis deleteCategory operation failed',
      );
      throw error;
    }
  }

  /**
   * Delete all Redis keys for a category (stream) and its entities, then delete the main hash
   * Example: for 'core.lookup.countries.v1', deletes 'core.lookup.countries.v1', 'core.lookup.countries.v1:*'
   * @param category - The category to delete
   */
  async deleteCategoryAndEntities(category: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`${category}:*`);
      if (keys.length) {
        await this.redis.del(...keys);
      }
      await this.redis.del(category);
    } catch (error) {
      this.logger.error(
        {
          category,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis deleteCategoryAndEntities operation failed',
      );
      throw error;
    }
  }

  /**
   * Delete a checkpoint for a stream/category from the projector's checkpoint hash
   * @param category - The category checkpoint to delete
   */
  async deleteCheckpoint(category: string): Promise<void> {
    try {
      await this.redis.hdel('projection:checkpoints:projector', category);
    } catch (error) {
      this.logger.error(
        {
          category,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis deleteCheckpoint operation failed',
      );
      throw error;
    }
  }

  /**
   * Batch write multiple items to Redis hash
   * @param user - User context for tenant isolation
   * @param category - The category/type of data
   * @param items - Record of key-value pairs to write
   */
  async writeMany<T>(
    user: IUserToken,
    category: string,
    items: Record<string, T>,
  ): Promise<void> {
    try {
      const path = this.buildKey(user, category);
      const pipeline = this.redis.pipeline();

      Object.entries(items).forEach(([key, value]) => {
        pipeline.hset(path, key, JSON.stringify(value));
      });

      await pipeline.exec();
    } catch (error) {
      this.logger.error(
        {
          category,
          itemCount: Object.keys(items).length,
          tenant: user?.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis writeMany operation failed',
      );
      throw error;
    }
  }

  /**
   * Health check for Redis connection
   * @returns Boolean indicating if Redis is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Redis health check failed',
      );
      return false;
    }
  }
}
