import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Interface for checkpoint storage
 */
export interface CheckpointStore {
  get(key: string): Promise<string | null>;
  set(key: string, position: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * Redis-based checkpoint store implementation
 */
@Injectable()
export class RedisCheckpointStore implements CheckpointStore {
  private readonly logger = new Logger(RedisCheckpointStore.name);
  private readonly keyPrefix = 'checkpoint:';

  constructor(private readonly redis: Redis) {}

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get checkpoint position for a given key
   */
  async get(key: string): Promise<string | null> {
    try {
      const position = await this.redis.get(this.getKey(key));

      this.logger.debug(
        { key, position: position || 'null' },
        'checkpoint.get',
      );

      return position;
    } catch (error) {
      this.logger.error(
        {
          key,
          error: error instanceof Error ? error.message : String(error),
        },
        'checkpoint.get.failed',
      );
      return null;
    }
  }

  /**
   * Set checkpoint position for a given key
   */
  async set(key: string, position: string): Promise<void> {
    try {
      await this.redis.set(this.getKey(key), position);

      this.logger.debug({ key, position }, 'checkpoint.set');
    } catch (error) {
      this.logger.error(
        {
          key,
          position,
          error: error instanceof Error ? error.message : String(error),
        },
        'checkpoint.set.failed',
      );
      throw error;
    }
  }

  /**
   * Delete a checkpoint
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.getKey(key));

      this.logger.debug({ key }, 'checkpoint.delete');
    } catch (error) {
      this.logger.error(
        {
          key,
          error: error instanceof Error ? error.message : String(error),
        },
        'checkpoint.delete.failed',
      );
      throw error;
    }
  }

  /**
   * Check if a checkpoint exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.getKey(key));
      return exists === 1;
    } catch (error) {
      this.logger.error(
        {
          key,
          error: error instanceof Error ? error.message : String(error),
        },
        'checkpoint.exists.failed',
      );
      return false;
    }
  }

  /**
   * Get all checkpoints with a pattern
   */
  async getAll(pattern = '*'): Promise<Record<string, string>> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}${pattern}`);
      const checkpoints: Record<string, string> = {};

      if (keys.length === 0) {
        return checkpoints;
      }

      const values = await this.redis.mget(...keys);

      keys.forEach((key, index) => {
        const cleanKey = key.replace(this.keyPrefix, '');
        const value = values[index];
        if (value !== null) {
          checkpoints[cleanKey] = value;
        }
      });

      this.logger.debug(
        { pattern, count: Object.keys(checkpoints).length },
        'checkpoint.getAll',
      );

      return checkpoints;
    } catch (error) {
      this.logger.error(
        {
          pattern,
          error: error instanceof Error ? error.message : String(error),
        },
        'checkpoint.getAll.failed',
      );
      return {};
    }
  }

  /**
   * Set multiple checkpoints atomically
   */
  async setMultiple(checkpoints: Record<string, string>): Promise<void> {
    if (Object.keys(checkpoints).length === 0) {
      return;
    }

    try {
      const multi = this.redis.multi();

      Object.entries(checkpoints).forEach(([key, position]) => {
        multi.set(this.getKey(key), position);
      });

      await multi.exec();

      this.logger.debug(
        { count: Object.keys(checkpoints).length },
        'checkpoint.setMultiple',
      );
    } catch (error) {
      this.logger.error(
        {
          checkpoints,
          error: error instanceof Error ? error.message : String(error),
        },
        'checkpoint.setMultiple.failed',
      );
      throw error;
    }
  }

  /**
   * Clear all checkpoints matching a pattern
   */
  async clear(pattern = '*'): Promise<number> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}${pattern}`);

      if (keys.length === 0) {
        return 0;
      }

      const deletedCount = await this.redis.del(...keys);

      this.logger.debug({ pattern, deletedCount }, 'checkpoint.clear');

      return deletedCount;
    } catch (error) {
      this.logger.error(
        {
          pattern,
          error: error instanceof Error ? error.message : String(error),
        },
        'checkpoint.clear.failed',
      );
      throw error;
    }
  }
}
