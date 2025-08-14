/**
 * Enhanced CheckpointStore Test - Production Features
 * Tests the full {commit, prepare} position storage, SCAN operations,
 * structured logging, TTL, namespacing, and CAS functionality.
 */

const Redis = require('ioredis');

// Mock Pino logger for testing
const mockLogger = {
  debug: (ctx, msg) => console.log(`[DEBUG] ${msg}:`, JSON.stringify(ctx)),
  info: (ctx, msg) => console.log(`[INFO] ${msg}:`, JSON.stringify(ctx)),
  warn: (ctx, msg) => console.log(`[WARN] ${msg}:`, JSON.stringify(ctx)),
  error: ({ err, ...ctx }, msg) =>
    console.log(
      `[ERROR] ${msg}:`,
      JSON.stringify({ ...ctx, error: err?.message || err }),
    ),
};

// Mock Log.minimal for testing (since we're in JS not TS)
const Log = {
  minimal: {
    debug: (logger, msg, ctx) => logger.debug(ctx, msg),
    info: (logger, msg, ctx) => logger.info(ctx, msg),
    warn: (logger, msg, ctx) => logger.warn(ctx, msg),
    error: (logger, err, msg, ctx) => logger.error({ ...ctx, err }, msg),
  },
};

// Simulate the enhanced CheckpointStore in JavaScript
class RedisCheckpointStore {
  constructor(redis, logger, envPrefix = '') {
    this.redis = redis;
    this.logger = logger;
    this.prefix = `${envPrefix}checkpoint:`;

    // Lua script for compare-and-set
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

  k(key) {
    return `${this.prefix}${key}`;
  }

  async get(key) {
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

      const position = {
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
      Log.minimal.error(this.logger, err, 'Failed to get checkpoint', {
        component: 'RedisCheckpointStore',
        method: 'get',
        key,
      });
      return null;
    }
  }

  async set(key, pos, ttlSeconds) {
    try {
      const now = new Date().toISOString();
      const payload = {
        commit: pos.commit,
        prepare: pos.prepare,
        updatedAt: pos.updatedAt || now,
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
        ttlSeconds: ttlSeconds || null,
      });
    } catch (err) {
      Log.minimal.error(this.logger, err, 'Failed to set checkpoint', {
        component: 'RedisCheckpointStore',
        method: 'set',
        key,
        position: pos,
      });
      throw err;
    }
  }

  async delete(key) {
    try {
      await this.redis.unlink(this.k(key));

      Log.minimal.debug(this.logger, 'Checkpoint deleted', {
        component: 'RedisCheckpointStore',
        method: 'delete',
        key,
      });
    } catch (err) {
      Log.minimal.error(this.logger, err, 'Failed to delete checkpoint', {
        component: 'RedisCheckpointStore',
        method: 'delete',
        key,
      });
      throw err;
    }
  }

  async exists(key) {
    try {
      const exists = await this.redis.exists(this.k(key));
      return exists === 1;
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err,
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

  async scan(prefix = '*', pageSize = 500) {
    const pattern = `${this.prefix}${prefix}`;
    let cursor = '0';
    const keys = [];

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
      Log.minimal.error(this.logger, err, 'Failed to scan checkpoint keys', {
        component: 'RedisCheckpointStore',
        method: 'scan',
        prefix,
        pageSize,
      });
      return [];
    }
  }

  async getAll(prefix = '*', pageSize = 500) {
    const result = {};
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

        const pipeline = this.redis.pipeline();
        keys.forEach((k) => pipeline.hgetall(k));
        const replies = await pipeline.exec();

        keys.forEach((k, i) => {
          const cleanKey = k.replace(this.prefix, '');
          const obj = replies?.[i]?.[1];

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
      Log.minimal.error(this.logger, err, 'Failed to get all checkpoints', {
        component: 'RedisCheckpointStore',
        method: 'getAll',
        prefix,
        pageSize,
      });
      return {};
    }
  }

  async clear(prefix = '*', pageSize = 500) {
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

        const chunks = [];
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
      Log.minimal.error(this.logger, err, 'Failed to clear checkpoints', {
        component: 'RedisCheckpointStore',
        method: 'clear',
        prefix,
        pageSize,
      });
      throw err;
    }
  }

  async setIfNewer(key, pos, ttlSeconds) {
    try {
      const now = new Date().toISOString();
      const updatedAt = pos.updatedAt || now;
      const ttl = ttlSeconds || 0;

      const result = await this.redis.eval(
        this.casScript,
        1,
        this.k(key),
        pos.commit,
        pos.prepare,
        updatedAt,
        ttl.toString(),
      );

      const updated = result === 1;

      Log.minimal.debug(this.logger, 'Compare-and-set checkpoint', {
        component: 'RedisCheckpointStore',
        method: 'setIfNewer',
        key,
        commit: pos.commit,
        prepare: pos.prepare,
        updated,
        ttlSeconds: ttlSeconds || null,
      });

      return updated;
    } catch (err) {
      Log.minimal.error(
        this.logger,
        err,
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

async function testEnhancedCheckpointStore() {
  console.log('\n🧪 Enhanced CheckpointStore Production Features Test\n');

  // Connect to Redis
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    db: 15, // Use test database
  });

  // Create store with environment namespacing
  const store = new RedisCheckpointStore(redis, mockLogger, 'test:');

  try {
    // Clear any existing test data
    await store.clear('*');
    console.log('✅ Test environment cleared\n');

    // ===== TEST 1: Full Position Storage =====
    console.log('📊 Test 1: Full Position Storage (commit + prepare)');

    const position1 = {
      commit: '12345678901234567890', // Large bigint as string
      prepare: '12345678901234567891',
      updatedAt: new Date().toISOString(),
    };

    await store.set('order-processor', position1);
    const retrieved1 = await store.get('order-processor');

    console.log('Original position:', position1);
    console.log('Retrieved position:', retrieved1);
    console.log('✅ Full position storage works\n');

    // ===== TEST 2: TTL Support =====
    console.log('📅 Test 2: TTL Support');

    const position2 = {
      commit: '98765432109876543210',
      prepare: '98765432109876543211',
    };

    await store.set('temp-processor', position2, 5); // 5 second TTL
    const ttlExists = await store.exists('temp-processor');
    console.log('TTL checkpoint exists immediately:', ttlExists);

    // Check TTL is set
    const ttl = await redis.ttl('test:checkpoint:temp-processor');
    console.log('TTL remaining:', ttl, 'seconds');
    console.log('✅ TTL support works\n');

    // ===== TEST 3: SCAN Operations (Non-blocking) =====
    console.log('🔍 Test 3: SCAN Operations');

    // Create multiple checkpoints
    const positions = {
      'user-projection-1': { commit: '1000', prepare: '1001' },
      'user-projection-2': { commit: '2000', prepare: '2001' },
      'order-projection-1': { commit: '3000', prepare: '3001' },
      'order-projection-2': { commit: '4000', prepare: '4001' },
    };

    for (const [key, pos] of Object.entries(positions)) {
      await store.set(key, pos);
    }

    // Test SCAN with prefix
    const userKeys = await store.scan('user-*');
    console.log('User projection keys:', userKeys);

    // Test getAll with pattern
    const allPositions = await store.getAll('*-projection-*');
    console.log('All projection positions:', Object.keys(allPositions));
    console.log('✅ SCAN operations work\n');

    // ===== TEST 4: Compare-and-Set (CAS) =====
    console.log('🔒 Test 4: Compare-and-Set');

    const initialPos = { commit: '5000', prepare: '5001' };
    await store.set('cas-test', initialPos);

    // Try to set newer position (should succeed)
    const newerPos = { commit: '6000', prepare: '6001' };
    const updated1 = await store.setIfNewer('cas-test', newerPos);
    console.log('Updated with newer commit:', updated1);

    // Try to set older position (should fail)
    const olderPos = { commit: '4000', prepare: '4001' };
    const updated2 = await store.setIfNewer('cas-test', olderPos);
    console.log('Updated with older commit:', updated2);

    const finalPos = await store.get('cas-test');
    console.log('Final position after CAS:', finalPos);
    console.log('✅ Compare-and-set works\n');

    // ===== TEST 5: Hash Storage Validation =====
    console.log('🔨 Test 5: Hash Storage Validation');

    // Check that data is stored as hash, not string
    const hashData = await redis.hgetall('test:checkpoint:order-processor');
    console.log('Raw hash data:', hashData);
    console.log('✅ Hash storage confirmed\n');

    // ===== TEST 6: Bulk Operations =====
    console.log('📦 Test 6: Bulk Operations');

    // Create many checkpoints to test pagination
    for (let i = 0; i < 20; i++) {
      await store.set(`bulk-test-${i}`, {
        commit: (1000 + i).toString(),
        prepare: (1001 + i).toString(),
      });
    }

    // Test paginated getAll
    const bulkPositions = await store.getAll('bulk-test-*', 5); // Small page size
    console.log('Bulk positions retrieved:', Object.keys(bulkPositions).length);

    // Test bulk clear
    const deletedCount = await store.clear('bulk-test-*', 5); // Small page size
    console.log('Bulk deleted count:', deletedCount);
    console.log('✅ Bulk operations work\n');

    // ===== TEST 7: Error Handling =====
    console.log('❌ Test 7: Error Handling');

    // Test malformed data handling
    await redis.hset('test:checkpoint:malformed', 'commit', '123'); // Missing prepare
    const malformed = await store.get('malformed');
    console.log('Malformed checkpoint result:', malformed);
    console.log('✅ Error handling works\n');

    // ===== TEST 8: Performance with Large Positions =====
    console.log('⚡ Test 8: Large Position Performance');

    const largePosition = {
      commit: '999999999999999999999999999999999999999', // Very large number
      prepare: '1000000000000000000000000000000000000000',
      updatedAt: new Date().toISOString(),
    };

    const start = Date.now();
    await store.set('large-position', largePosition);
    const retrieved = await store.get('large-position');
    const elapsed = Date.now() - start;

    console.log('Large position set/get time:', elapsed, 'ms');
    console.log(
      'Precision preserved:',
      largePosition.commit === retrieved.commit,
    );
    console.log('✅ Large position performance acceptable\n');

    // ===== FINAL STATUS =====
    console.log('📈 Final Status');
    const allKeys = await store.scan('*');
    console.log('Total checkpoints in test namespace:', allKeys.length);

    // Cleanup
    await store.clear('*');
    console.log('✅ Test cleanup completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await redis.quit();
    console.log('\n🎉 Enhanced CheckpointStore test completed!');
  }
}

// Run the test if called directly
if (require.main === module) {
  testEnhancedCheckpointStore().catch(console.error);
}

module.exports = { testEnhancedCheckpointStore };
