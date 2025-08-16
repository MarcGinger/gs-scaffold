import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 🔴 Redis Multi-Tenancy Strategies Documentation
 *
 * This module provides comprehensive documentation for Redis-specific
 * multi-tenancy patterns and caching strategies.
 */
export class OverviewRedisDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🔴 Redis Multi-Tenancy Strategies')
      .setDescription(
        `
# 🔴 Redis Multi-Tenancy Strategies

Comprehensive guide to implementing multi-tenancy patterns in Redis for caching, session storage, and real-time data management.

---

## 🎯 Strategy Overview

Redis offers several approaches to tenant isolation, each optimized for different use cases and scale requirements.

| Strategy | Isolation Level | Performance | Operational Complexity | Best For |
|----------|----------------|-------------|------------------------|----------|
| **Key Prefixing** | Medium | ⭐⭐⭐⭐⭐ | Low | Most applications, flexible scaling |
| **Database Selection** | High | ⭐⭐⭐⭐ | Low | Small tenant count, simple isolation |
| **Namespace Isolation** | Medium | ⭐⭐⭐⭐⭐ | Medium | Redis Cluster, guaranteed locality |
| **Instance-per-Tenant** | Maximum | ⭐⭐⭐ | High | Enterprise, strict isolation |

---

## 🔑 Key Prefixing Strategy

### **Hierarchical Key Structure**
\`\`\`redis
# Standard tenant prefixing pattern
tenant:{tenantId}:{domain}:{identifier}:{attribute}

# Examples
tenant:123:user:456:session
tenant:123:user:456:preferences
tenant:123:product:789:cache
tenant:123:product:789:views_count
tenant:456:rate_limit:api_calls
tenant:456:analytics:daily_stats
\`\`\`

### **TypeScript Implementation**
\`\`\`typescript
// Redis key management service
@Injectable()
export class TenantRedisService {
  constructor(
    @Inject('REDIS_CLIENT') private redis: Redis,
    private configService: ConfigService
  ) {}

  // Key generation utilities
  private buildKey(tenantId: string, domain: string, ...parts: string[]): string {
    return \`tenant:\${tenantId}:\${domain}:\${parts.join(':')}\`;
  }

  // Session management
  async setUserSession(
    tenantId: string, 
    userId: string, 
    sessionData: any, 
    ttl: number = 3600
  ): Promise<void> {
    const key = this.buildKey(tenantId, 'user', userId, 'session');
    await this.redis.setex(key, ttl, JSON.stringify(sessionData));
  }

  async getUserSession(tenantId: string, userId: string): Promise<any> {
    const key = this.buildKey(tenantId, 'user', userId, 'session');
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Product caching
  async cacheProduct(
    tenantId: string, 
    productId: string, 
    productData: any,
    ttl: number = 1800
  ): Promise<void> {
    const key = this.buildKey(tenantId, 'product', productId, 'cache');
    await this.redis.setex(key, ttl, JSON.stringify(productData));
  }

  async getCachedProduct(tenantId: string, productId: string): Promise<any> {
    const key = this.buildKey(tenantId, 'product', productId, 'cache');
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Rate limiting
  async checkRateLimit(
    tenantId: string, 
    resource: string, 
    limit: number, 
    window: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = this.buildKey(tenantId, 'rate_limit', resource);
    
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, window);
    }
    
    const allowed = current <= limit;
    const remaining = Math.max(0, limit - current);
    
    return { allowed, remaining };
  }
}
\`\`\`

### **Pattern-Based Operations**
\`\`\`typescript
// Bulk operations for tenant data
@Injectable()
export class TenantBulkOperations {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  // Get all tenant keys by pattern
  async getTenantKeys(tenantId: string, domain?: string): Promise<string[]> {
    const pattern = domain 
      ? \`tenant:\${tenantId}:\${domain}:*\`
      : \`tenant:\${tenantId}:*\`;
    
    return await this.redis.keys(pattern);
  }

  // Bulk delete tenant data
  async deleteTenantData(tenantId: string, domain?: string): Promise<number> {
    const keys = await this.getTenantKeys(tenantId, domain);
    
    if (keys.length === 0) return 0;
    
    return await this.redis.del(...keys);
  }

  // Tenant data migration
  async migrateTenantData(
    fromTenantId: string, 
    toTenantId: string, 
    domain: string
  ): Promise<void> {
    const pattern = \`tenant:\${fromTenantId}:\${domain}:*\`;
    const keys = await this.redis.keys(pattern);
    
    const pipeline = this.redis.pipeline();
    
    for (const oldKey of keys) {
      const value = await this.redis.get(oldKey);
      const ttl = await this.redis.ttl(oldKey);
      
      const newKey = oldKey.replace(
        \`tenant:\${fromTenantId}:\`, 
        \`tenant:\${toTenantId}:\`
      );
      
      if (ttl > 0) {
        pipeline.setex(newKey, ttl, value);
      } else {
        pipeline.set(newKey, value);
      }
      
      pipeline.del(oldKey);
    }
    
    await pipeline.exec();
  }

  // Tenant analytics
  async getTenantStats(tenantId: string): Promise<TenantRedisStats> {
    const keys = await this.getTenantKeys(tenantId);
    const memory = await this.calculateMemoryUsage(keys);
    const domains = await this.analyzeDomains(tenantId);
    
    return {
      totalKeys: keys.length,
      memoryUsage: memory,
      domains: domains,
      lastActivity: await this.getLastActivity(tenantId)
    };
  }
}

interface TenantRedisStats {
  totalKeys: number;
  memoryUsage: number;
  domains: { [domain: string]: number };
  lastActivity: Date | null;
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Flexible Scaling**: No hard limits on tenant count
- **✅ High Performance**: Single Redis instance, optimal latency
- **✅ Pattern Operations**: Efficient bulk operations per tenant
- **✅ Easy Debugging**: Human-readable key structure
- **✅ Cross-Tenant Analytics**: Aggregated queries possible

**Ideal For:**
- SaaS applications with dynamic tenant growth
- Applications requiring cross-tenant analytics
- High-performance caching requirements
- Development and debugging scenarios

---

## 🗂️ Database Selection Strategy

### **Multi-Database Implementation**
\`\`\`redis
# Redis supports 16 databases (0-15)
SELECT 0  # Default/shared database
SELECT 1  # Tenant 123 database  
SELECT 2  # Tenant 456 database
SELECT 3  # Tenant 789 database
\`\`\`

### **Database Management Service**
\`\`\`typescript
// Tenant database allocation service
@Injectable()
export class TenantDatabaseManager {
  private tenantDatabaseMap = new Map<string, number>();
  private databaseTenantMap = new Map<number, string>();
  private nextDatabase = 1; // Reserve 0 for shared data

  constructor(
    @Inject('REDIS_CLIENT') private redis: Redis,
    private configService: ConfigService
  ) {
    this.loadTenantMappings();
  }

  async allocateDatabase(tenantId: string): Promise<number> {
    if (this.tenantDatabaseMap.has(tenantId)) {
      return this.tenantDatabaseMap.get(tenantId)!;
    }

    if (this.nextDatabase > 15) {
      throw new Error('Maximum Redis databases exceeded (16 limit)');
    }

    const dbNumber = this.nextDatabase++;
    this.tenantDatabaseMap.set(tenantId, dbNumber);
    this.databaseTenantMap.set(dbNumber, tenantId);
    
    await this.persistTenantMapping(tenantId, dbNumber);
    
    return dbNumber;
  }

  async getTenantDatabase(tenantId: string): Promise<number> {
    const dbNumber = this.tenantDatabaseMap.get(tenantId);
    if (!dbNumber) {
      return await this.allocateDatabase(tenantId);
    }
    return dbNumber;
  }

  async withTenantDatabase<T>(
    tenantId: string, 
    operation: (redis: Redis) => Promise<T>
  ): Promise<T> {
    const dbNumber = await this.getTenantDatabase(tenantId);
    
    // Create isolated connection for this tenant
    const tenantRedis = this.redis.duplicate();
    await tenantRedis.select(dbNumber);
    
    try {
      return await operation(tenantRedis);
    } finally {
      tenantRedis.disconnect();
    }
  }

  private async loadTenantMappings(): Promise<void> {
    // Load from persistent storage (database/config)
    const mappings = await this.configService.getTenantDatabaseMappings();
    
    for (const { tenantId, databaseNumber } of mappings) {
      this.tenantDatabaseMap.set(tenantId, databaseNumber);
      this.databaseTenantMap.set(databaseNumber, tenantId);
      this.nextDatabase = Math.max(this.nextDatabase, databaseNumber + 1);
    }
  }
}

// Tenant-specific Redis operations
@Injectable()
export class TenantIsolatedRedisService {
  constructor(private tenantDbManager: TenantDatabaseManager) {}

  async setUserSession(
    tenantId: string, 
    userId: string, 
    sessionData: any, 
    ttl: number = 3600
  ): Promise<void> {
    await this.tenantDbManager.withTenantDatabase(tenantId, async (redis) => {
      const key = \`user:\${userId}:session\`;
      await redis.setex(key, ttl, JSON.stringify(sessionData));
    });
  }

  async getUserSession(tenantId: string, userId: string): Promise<any> {
    return await this.tenantDbManager.withTenantDatabase(tenantId, async (redis) => {
      const key = \`user:\${userId}:session\`;
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    });
  }

  async flushTenantData(tenantId: string): Promise<void> {
    await this.tenantDbManager.withTenantDatabase(tenantId, async (redis) => {
      await redis.flushdb();
    });
  }
}
\`\`\`

### **Benefits & Limitations**
**✅ Benefits:**
- Complete logical separation between tenants
- Simple tenant switching with SELECT command
- Built-in Redis feature, no custom logic
- Easy tenant data isolation and cleanup

**❌ Limitations:**
- Maximum 16 tenants per Redis instance
- Not suitable for large-scale multi-tenancy
- Database switching overhead
- Limited cross-tenant operations

**Ideal For:**
- Small tenant count (< 16)
- Development and testing environments
- Applications requiring strict tenant isolation
- Legacy systems with simple tenant models

---

## 🏷️ Namespace Isolation Strategy

### **Hash Tag Implementation**
\`\`\`redis
# Hash tags ensure same-slot storage in Redis Cluster
{tenant_123}:product_cache
{tenant_123}:user_sessions  
{tenant_123}:rate_limits
{tenant_456}:product_cache
{tenant_456}:user_sessions
\`\`\`

### **Cluster-Aware Service**
\`\`\`typescript
// Redis Cluster tenant service
@Injectable()
export class ClusterTenantRedisService {
  constructor(
    @Inject('REDIS_CLUSTER') private cluster: Cluster,
    private logger: Logger
  ) {}

  private buildHashTagKey(tenantId: string, ...parts: string[]): string {
    return \`{tenant_\${tenantId}}:\${parts.join(':')}\`;
  }

  // Multi-key operations guaranteed same slot
  async setUserSessionWithPreferences(
    tenantId: string,
    userId: string,
    sessionData: any,
    preferences: any,
    ttl: number = 3600
  ): Promise<void> {
    const sessionKey = this.buildHashTagKey(tenantId, 'user', userId, 'session');
    const prefsKey = this.buildHashTagKey(tenantId, 'user', userId, 'preferences');
    
    // Both keys guaranteed to be on same slot - can use pipeline
    const pipeline = this.cluster.pipeline();
    pipeline.setex(sessionKey, ttl, JSON.stringify(sessionData));
    pipeline.setex(prefsKey, ttl * 24, JSON.stringify(preferences)); // Longer TTL for prefs
    
    await pipeline.exec();
  }

  // Atomic tenant operations
  async atomicTenantOperation(
    tenantId: string,
    operations: Array<{ key: string; operation: string; value?: any }>
  ): Promise<any[]> {
    const pipeline = this.cluster.pipeline();
    
    operations.forEach(({ key, operation, value }) => {
      const hashTagKey = this.buildHashTagKey(tenantId, key);
      
      switch (operation) {
        case 'SET':
          pipeline.set(hashTagKey, JSON.stringify(value));
          break;
        case 'GET':
          pipeline.get(hashTagKey);
          break;
        case 'DEL':
          pipeline.del(hashTagKey);
          break;
        case 'INCR':
          pipeline.incr(hashTagKey);
          break;
      }
    });
    
    const results = await pipeline.exec();
    return results?.map(([err, result]) => result) || [];
  }

  // Tenant-specific Lua scripts
  async executeTenantScript(
    tenantId: string,
    script: string,
    keys: string[],
    args: string[]
  ): Promise<any> {
    // Add hash tag to all keys
    const hashTagKeys = keys.map(key => this.buildHashTagKey(tenantId, key));
    
    return await this.cluster.eval(script, hashTagKeys.length, ...hashTagKeys, ...args);
  }
}
\`\`\`

### **Slot-Aware Operations**
\`\`\`typescript
// Advanced cluster operations
@Injectable()
export class AdvancedClusterOperations {
  constructor(
    @Inject('REDIS_CLUSTER') private cluster: Cluster,
    private logger: Logger
  ) {}

  // Distributed rate limiting per tenant
  async distributedRateLimit(
    tenantId: string,
    resource: string,
    limit: number,
    window: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const script = \`
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      
      local current = redis.call('GET', key)
      if current == false then
        current = 0
      else
        current = tonumber(current)
      end
      
      if current < limit then
        local newValue = redis.call('INCR', key)
        if newValue == 1 then
          redis.call('EXPIRE', key, window)
        end
        local ttl = redis.call('TTL', key)
        return {1, limit - newValue, now + ttl}
      else
        local ttl = redis.call('TTL', key)
        return {0, 0, now + ttl}
      end
    \`;

    const key = \`{tenant_\${tenantId}}:rate_limit:\${resource}\`;
    const result = await this.cluster.eval(
      script, 
      1, 
      key, 
      limit.toString(), 
      window.toString(), 
      Date.now().toString()
    ) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2]
    };
  }

  // Tenant analytics aggregation
  async getTenantMetrics(tenantId: string): Promise<TenantMetrics> {
    const baseKey = \`{tenant_\${tenantId}}\`;
    
    const pipeline = this.cluster.pipeline();
    pipeline.get(\`\${baseKey}:stats:sessions_active\`);
    pipeline.get(\`\${baseKey}:stats:api_calls_today\`);
    pipeline.get(\`\${baseKey}:stats:cache_hits\`);
    pipeline.get(\`\${baseKey}:stats:cache_misses\`);
    
    const results = await pipeline.exec();
    const [sessions, apiCalls, cacheHits, cacheMisses] = 
      results?.map(([err, result]) => parseInt(result as string) || 0) || [0, 0, 0, 0];

    return {
      activeSessions: sessions,
      apiCallsToday: apiCalls,
      cacheHitRate: cacheHits / (cacheHits + cacheMisses) || 0,
      totalCacheOperations: cacheHits + cacheMisses
    };
  }
}

interface TenantMetrics {
  activeSessions: number;
  apiCallsToday: number;
  cacheHitRate: number;
  totalCacheOperations: number;
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Cluster Compatibility**: Works seamlessly with Redis Cluster
- **✅ Atomic Operations**: Multi-key operations guaranteed same slot
- **✅ High Performance**: No cross-slot operation penalties
- **✅ Scalable**: Cluster can scale horizontally

**Ideal For:**
- Redis Cluster deployments
- Applications requiring atomic multi-key operations
- High-scale applications with clustering needs
- Distributed systems with locality requirements

---

## 🏢 Instance-per-Tenant Strategy

### **Dedicated Redis Instances**
\`\`\`typescript
// Multi-instance Redis manager
@Injectable()
export class TenantInstanceManager {
  private tenantConnections = new Map<string, Redis>();

  constructor(private configService: ConfigService) {}

  async getTenantRedis(tenantId: string): Promise<Redis> {
    if (this.tenantConnections.has(tenantId)) {
      return this.tenantConnections.get(tenantId)!;
    }

    const config = await this.getTenantRedisConfig(tenantId);
    const redis = new Redis(config);
    
    this.tenantConnections.set(tenantId, redis);
    return redis;
  }

  private async getTenantRedisConfig(tenantId: string): Promise<RedisOptions> {
    // Get tenant-specific Redis configuration
    const baseConfig = this.configService.getRedisConfig();
    const tenantConfig = await this.configService.getTenantRedisConfig(tenantId);

    return {
      ...baseConfig,
      host: tenantConfig.host || \`tenant-\${tenantId}-redis.internal\`,
      port: tenantConfig.port || 6379,
      password: tenantConfig.password,
      db: 0, // Always use database 0 for dedicated instances
      keyPrefix: '', // No prefix needed - dedicated instance
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    };
  }

  async executeTenantOperation<T>(
    tenantId: string,
    operation: (redis: Redis) => Promise<T>
  ): Promise<T> {
    const redis = await this.getTenantRedis(tenantId);
    return await operation(redis);
  }

  // Health check across all tenant instances
  async healthCheck(): Promise<Map<string, boolean>> {
    const healthStatus = new Map<string, boolean>();
    
    for (const [tenantId, redis] of this.tenantConnections) {
      try {
        await redis.ping();
        healthStatus.set(tenantId, true);
      } catch (error) {
        healthStatus.set(tenantId, false);
        this.logger.error(\`Redis health check failed for tenant \${tenantId}\`, error);
      }
    }
    
    return healthStatus;
  }
}

// Simplified tenant operations (no prefixing needed)
@Injectable()
export class DedicatedInstanceRedisService {
  constructor(private instanceManager: TenantInstanceManager) {}

  async setUserSession(
    tenantId: string,
    userId: string,
    sessionData: any,
    ttl: number = 3600
  ): Promise<void> {
    await this.instanceManager.executeTenantOperation(tenantId, async (redis) => {
      // Simple keys - no tenant prefixing needed
      const key = \`user:\${userId}:session\`;
      await redis.setex(key, ttl, JSON.stringify(sessionData));
    });
  }

  async cacheProduct(
    tenantId: string,
    productId: string,
    productData: any,
    ttl: number = 1800
  ): Promise<void> {
    await this.instanceManager.executeTenantOperation(tenantId, async (redis) => {
      const key = \`product:\${productId}\`;
      await redis.setex(key, ttl, JSON.stringify(productData));
    });
  }

  // Instance-level operations
  async flushTenantCache(tenantId: string): Promise<void> {
    await this.instanceManager.executeTenantOperation(tenantId, async (redis) => {
      await redis.flushdb();
    });
  }

  async getTenantInfo(tenantId: string): Promise<any> {
    return await this.instanceManager.executeTenantOperation(tenantId, async (redis) => {
      const info = await redis.info();
      const dbSize = await redis.dbsize();
      
      return {
        connected: true,
        keyCount: dbSize,
        memory: this.parseMemoryUsage(info),
        uptime: this.parseUptime(info)
      };
    });
  }
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Maximum Isolation**: Complete instance separation
- **✅ Independent Scaling**: Per-tenant performance tuning
- **✅ Custom Configuration**: Tenant-specific Redis settings
- **✅ Security**: Network-level isolation possible
- **✅ Compliance**: Meets strictest data isolation requirements

**Ideal For:**
- Enterprise clients requiring dedicated infrastructure
- Highly regulated industries
- Tenants with specific performance requirements
- Geographic data residency compliance

---

## 🛠️ Implementation Guidelines

### **Strategy Selection Matrix**
\`\`\`typescript
interface TenantRequirements {
  tenantCount: number;
  isolationLevel: 'basic' | 'medium' | 'high' | 'maximum';
  performanceRequirements: 'standard' | 'high' | 'ultra';
  complianceNeeds: boolean;
  budget: 'cost-effective' | 'moderate' | 'premium';
}

@Injectable()
export class RedisStrategySelector {
  selectOptimalStrategy(requirements: TenantRequirements): RedisStrategy {
    // Maximum isolation requirements
    if (requirements.isolationLevel === 'maximum' || requirements.complianceNeeds) {
      return 'instance-per-tenant';
    }
    
    // Small tenant count with high isolation
    if (requirements.tenantCount <= 15 && requirements.isolationLevel === 'high') {
      return 'database-selection';
    }
    
    // Redis Cluster deployments
    if (requirements.performanceRequirements === 'ultra') {
      return 'namespace-isolation';
    }
    
    // Default: Most flexible option
    return 'key-prefixing';
  }
}

type RedisStrategy = 'key-prefixing' | 'database-selection' | 'namespace-isolation' | 'instance-per-tenant';
\`\`\`

### **Performance Optimization**
\`\`\`typescript
// Connection pooling and optimization
@Injectable()
export class OptimizedRedisService {
  private connectionPool: Map<string, Redis[]> = new Map();
  private readonly poolSize = 10;

  async getOptimizedConnection(tenantId: string): Promise<Redis> {
    const pool = this.connectionPool.get(tenantId) || [];
    
    // Return available connection from pool
    const available = pool.find(conn => conn.status === 'ready');
    if (available) return available;
    
    // Create new connection if pool not full
    if (pool.length < this.poolSize) {
      const newConnection = await this.createTenantConnection(tenantId);
      pool.push(newConnection);
      this.connectionPool.set(tenantId, pool);
      return newConnection;
    }
    
    // Wait for available connection
    return await this.waitForAvailableConnection(tenantId);
  }

  // Pipelining for bulk operations
  async bulkOperation(
    tenantId: string,
    operations: BulkOperation[]
  ): Promise<any[]> {
    const redis = await this.getOptimizedConnection(tenantId);
    const pipeline = redis.pipeline();
    
    operations.forEach(op => {
      const key = this.buildTenantKey(tenantId, op.key);
      
      switch (op.type) {
        case 'SET':
          pipeline.setex(key, op.ttl || 3600, JSON.stringify(op.value));
          break;
        case 'GET':
          pipeline.get(key);
          break;
        case 'DEL':
          pipeline.del(key);
          break;
      }
    });
    
    const results = await pipeline.exec();
    return results?.map(([err, result]) => result) || [];
  }
}

interface BulkOperation {
  type: 'SET' | 'GET' | 'DEL';
  key: string;
  value?: any;
  ttl?: number;
}
\`\`\`

---

## 📊 Strategy Comparison Matrix

| Aspect | Key Prefixing | Database Selection | Namespace Isolation | Instance-per-Tenant |
|--------|---------------|-------------------|--------------------|--------------------|
| **Tenant Limit** | Unlimited | 16 | Unlimited | Unlimited |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Isolation** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Operational Complexity** | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cost Efficiency** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Cluster Support** | ⭐⭐⭐ | ❌ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

*💡 **Recommendation**: Start with key prefixing for flexibility, consider namespace isolation for Redis Cluster, and reserve instance-per-tenant for enterprise clients with strict compliance requirements.*

`,
      )
      .setVersion('1.0');

    // Add dynamic server configuration
    SwaggerConfigUtil.addServers(config, port);

    // Create document with empty include array to prevent any controllers from being included
    const document = SwaggerModule.createDocument(app, config.build(), {
      include: [], // Explicitly exclude all controllers - this should be documentation only
      deepScanRoutes: false, // Prevent automatic route discovery
      ignoreGlobalPrefix: false,
    });

    // Manually clear any accidentally included paths to ensure only documentation content
    document.paths = {};

    // Clear any business domain schemas and add only infrastructure schemas
    document.components = document.components || {};
    document.components.schemas = {
      // Only include infrastructure/platform schemas - no business domain schemas
    };

    SwaggerModule.setup('api/docs/multi-tenancy/redis', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/multi-tenancy/redis`;
  }
}
