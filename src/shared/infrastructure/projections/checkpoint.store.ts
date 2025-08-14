import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import Redis from 'ioredis';
import { Log } from '../../logging';

const APP_LOGGER = 'APP_LOGGER';

/**
 * Full ESDB position with both commit and prepare bigints
 */
export interface CheckpointPosition {
  commit: string; // bigint serialized as string
  prepare: string; // bigint serialized as string
  updatedAt?: string; // ISO timestamp
}

/**
 * Enhanced checkpoint store interface with production features
 */
export interface CheckpointStore {
  get(key: string): Promise<CheckpointPosition | null>;
  set(key: string, pos: CheckpointPosition, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  // Admin helpers with SCAN-based pagination
  scan(prefix?: string, pageSize?: number): Promise<string[]>;
  getAll(
    prefix?: string,
    pageSize?: number,
  ): Promise<Record<string, CheckpointPosition>>;
  clear(prefix?: string, pageSize?: number): Promise<number>;

  // Optional: Compare-and-set for concurrent writers
  setIfNewer(
    key: string,
    pos: CheckpointPosition,
    ttlSeconds?: number,
  ): Promise<boolean>;
}

/**
 * Production-ready Redis checkpoint store
 * Features:
 * - Full {commit, prepare} position storage (no precision loss)
 * - Hash-based storage for structured data
 * - SCAN instead of KEYS (non-blocking)
 * - UNLINK for efficient bulk deletion
 * - Structured Pino logging
 * - Optional TTL and environment namespacing
 * - Batched/pipelined operations
 * - Optional CAS for concurrent writers
 */
@Injectable()
export class RedisCheckpointStore implements CheckpointStore {
  private readonly prefix: string;
  private readonly casScript: string;

  constructor(
    private readonly redis: Redis,
    @Inject(APP_LOGGER) private readonly logger: Logger,
    // Pass env/service to avoid collisions, e.g. 'prod:', 'dev:', etc.
    envPrefix: string = '',
  ) {
    this.prefix = `${envPrefix}checkpoint:`; // e.g. 'prod:checkpoint:'

    // Lua script for compare-and-set: only update if incoming commit >= stored commit
    this.casScript = `
      local key = KEYS[1]
      local newCommit = ARGV[1]
      local newPrepare = ARGV[2]
      local newUpdatedAt = ARGV[3]
      local ttl = tonumber(ARGV[4]) or 0
      
      local current = redis.call('HGET', key, 'commit')
      if not current or tonumber(newCommit) >= tonumber(current) then
        redis.call('HSET', key, 'commit', newCommit, 'prepare', newPrepare, 'updatedAt', newUpdatedAt)
        if ttl > 0 then
          redis.call('EXPIRE', key, ttl)
        end
        return 1
      else
        return 0
      end
    `;
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Get checkpoint position with full commit/prepare details
   */
  async get(key: string): Promise<CheckpointPosition | null> {
    try {
      const obj = await this.redis.hgetall(this.k(key));

      if (!obj || Object.keys(obj).length === 0) {
        Log.minimal.debug(this.logger, 'Checkpoint not found', {
          component: 'RedisCheckpointStore',
          method: 'get',
          key,
        });
        return null;
      }

      if (!obj.commit || !obj.prepare) {
        Log.minimal.warn(this.logger, 'Checkpoint missing required fields', {
          component: 'RedisCheckpointStore',
          method: 'get',
          key,
          foundFields: Object.keys(obj).join(','),
        });
        return null;
      }

      const position: CheckpointPosition = {
        commit: obj.commit,
        prepare: obj.prepare,
        updatedAt: obj.updatedAt,
      };

      Log.minimal.debug(this.logger, 'Checkpoint retrieved', {
        component: 'RedisCheckpointStore',
        method: 'get',
        key,
        commit: position.commit,
        prepare: position.prepare,
      });

      return position;
    } catch (err) {
      Log.minimal.error(this.logger, err as Error, 'Failed to get checkpoint', {
        component: 'RedisCheckpointStore',
        method: 'get',
        key,
      });
      return null;
    }
  }

  /**
   * Set checkpoint position with optional TTL
   */
  async set(
    key: string,
    pos: CheckpointPosition,
    ttlSeconds?: number,
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, string> = {
        commit: pos.commit,
        prepare: pos.prepare,
        updatedAt: pos.updatedAt ?? now,
      };

      const rkey = this.k(key);
      const multi = this.redis.multi().hset(rkey, payload);

      if (ttlSeconds && ttlSeconds > 0) {
        multi.expire(rkey, ttlSeconds);
      }

      await multi.exec();

      Log.minimal.debug(this.logger, 'Checkpoint set', {
        component: 'RedisCheckpointStore',
        method: 'set',
        key,
        commit: pos.commit,
        prepare: pos.prepare,
        ttlSeconds: ttlSeconds ?? null,
      });
    } catch (err) {
      Log.minimal.error(this.logger, err as Error, 'Failed to set checkpoint', {
        component: 'RedisCheckpointStore',
        method: 'set',
        key,
        position: pos,
      });
      throw err;
    }
  }

  /**
   * Delete checkpoint using UNLINK (non-blocking)
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.unlink(this.k(key)); // Non-blocking delete

      Log.minimal.debug(this.logger, 'Checkpoint deleted', {
        component: 'RedisCheckpointStore',
        method: 'delete',
        key,
      });
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err as Error,
        'Failed to delete checkpoint',
        {
          component: 'RedisCheckpointStore',
          method: 'delete',
          key,
        },
      );
      throw err;
    }
  }

  /**
   * Check if checkpoint exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.k(key));
      return exists === 1;
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err as Error,
        'Failed to check checkpoint existence',
        {
          component: 'RedisCheckpointStore',
          method: 'exists',
          key,
        },
      );
      return false;
    }
  }

  /**
   * SCAN for checkpoint keys (non-blocking, paginated)
   */
  async scan(prefix = '*', pageSize = 500): Promise<string[]> {
    const pattern = `${this.prefix}${prefix}`;
    let cursor = '0';
    const keys: string[] = [];

    try {
      do {
        const [nextCursor, foundKeys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          pageSize,
        );
        cursor = nextCursor;

        if (foundKeys.length > 0) {
          // Remove prefix to get clean keys
          keys.push(...foundKeys.map((k) => k.replace(this.prefix, '')));
        }
      } while (cursor !== '0');

      Log.minimal.debug(this.logger, 'Checkpoint keys scanned', {
        component: 'RedisCheckpointStore',
        method: 'scan',
        prefix,
        count: keys.length,
        pageSize,
      });

      return keys;
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err as Error,
        'Failed to scan checkpoint keys',
        {
          component: 'RedisCheckpointStore',
          method: 'scan',
          prefix,
          pageSize,
        },
      );
      return [];
    }
  }

  /**
   * Get all checkpoints with SCAN + pipelined HGETALL
   */
  async getAll(
    prefix = '*',
    pageSize = 500,
  ): Promise<Record<string, CheckpointPosition>> {
    const result: Record<string, CheckpointPosition> = {};
    const pattern = `${this.prefix}${prefix}`;
    let cursor = '0';

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          pageSize,
        );
        cursor = nextCursor;

        if (keys.length === 0) continue;

        // Pipeline HGETALL for all keys in this batch
        const pipeline = this.redis.pipeline();
        keys.forEach((k) => pipeline.hgetall(k));
        const replies = await pipeline.exec();

        // Process results
        keys.forEach((k, i) => {
          const cleanKey = k.replace(this.prefix, '');
          const obj = replies?.[i]?.[1] as Record<string, string> | null;

          if (obj && obj.commit && obj.prepare) {
            result[cleanKey] = {
              commit: obj.commit,
              prepare: obj.prepare,
              updatedAt: obj.updatedAt,
            };
          }
        });
      } while (cursor !== '0');

      Log.minimal.debug(this.logger, 'All checkpoints retrieved', {
        component: 'RedisCheckpointStore',
        method: 'getAll',
        prefix,
        count: Object.keys(result).length,
        pageSize,
      });

      return result;
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err as Error,
        'Failed to get all checkpoints',
        {
          component: 'RedisCheckpointStore',
          method: 'getAll',
          prefix,
          pageSize,
        },
      );
      return {};
    }
  }

  /**
   * Clear checkpoints with SCAN + chunked UNLINK
   */
  async clear(prefix = '*', pageSize = 500): Promise<number> {
    const pattern = `${this.prefix}${prefix}`;
    let cursor = '0';
    let totalDeleted = 0;

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          pageSize,
        );
        cursor = nextCursor;

        if (keys.length === 0) continue;

        // Chunk UNLINK operations to avoid large commands (Redis max ~256 args)
        const chunks: string[][] = [];
        for (let i = 0; i < keys.length; i += 256) {
          chunks.push(keys.slice(i, i + 256));
        }

        for (const chunk of chunks) {
          const deleted = await this.redis.unlink(...chunk);
          totalDeleted += deleted;
        }
      } while (cursor !== '0');

      Log.minimal.info(this.logger, 'Checkpoints cleared', {
        component: 'RedisCheckpointStore',
        method: 'clear',
        prefix,
        deleted: totalDeleted,
        pageSize,
      });

      return totalDeleted;
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err as Error,
        'Failed to clear checkpoints',
        {
          component: 'RedisCheckpointStore',
          method: 'clear',
          prefix,
          pageSize,
        },
      );
      throw err;
    }
  }

  /**
   * Compare-and-set: only update if incoming commit >= stored commit
   * Prevents regressions from concurrent writers with clock skew
   */
  async setIfNewer(
    key: string,
    pos: CheckpointPosition,
    ttlSeconds?: number,
  ): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const updatedAt = pos.updatedAt ?? now;
      const ttl = ttlSeconds ?? 0;

      const result = (await this.redis.eval(
        this.casScript,
        1, // key count
        this.k(key),
        pos.commit,
        pos.prepare,
        updatedAt,
        ttl.toString(),
      )) as number;

      const updated = result === 1;

      Log.minimal.debug(this.logger, 'Compare-and-set checkpoint', {
        component: 'RedisCheckpointStore',
        method: 'setIfNewer',
        key,
        commit: pos.commit,
        prepare: pos.prepare,
        updated,
        ttlSeconds: ttlSeconds ?? null,
      });

      return updated;
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err as Error,
        'Failed to compare-and-set checkpoint',
        {
          component: 'RedisCheckpointStore',
          method: 'setIfNewer',
          key,
          position: pos,
        },
      );
      return false;
    }
  }
}
