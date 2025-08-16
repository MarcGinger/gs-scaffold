import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 📊 EventStoreDB Multi-Tenancy Strategies Documentation
 *
 * This module provides comprehensive documentation for EventStoreDB-specific
 * multi-tenancy patterns and event sourcing strategies.
 */
export class OverviewEventStoreDBDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('📊 EventStoreDB Multi-Tenancy Strategies')
      .setDescription(
        `
# 📊 EventStoreDB Multi-Tenancy Strategies

Comprehensive guide to implementing multi-tenancy patterns in EventStoreDB for event sourcing, projections, and audit trails.

---

## 🎯 Strategy Overview

EventStoreDB provides multiple approaches to tenant isolation in event-sourced systems, each optimized for different event volumes and isolation requirements.

| Strategy | Isolation Level | Query Performance | Projection Complexity | Best For |
|----------|----------------|-------------------|----------------------|----------|
| **Stream Prefixing** | Medium | ⭐⭐⭐⭐ | Low | Most applications, flexible querying |
| **Category Separation** | Medium | ⭐⭐⭐⭐⭐ | Low | Domain-driven design, category projections |
| **Projection Isolation** | High | ⭐⭐⭐ | Medium | Complex read models, tenant-specific logic |
| **Database-per-Tenant** | Maximum | ⭐⭐⭐⭐⭐ | Low | Enterprise, strict compliance |

---

## 🔄 Stream Prefixing Strategy

### **Stream Naming Convention**
\`\`\`
# Hierarchical stream naming
tenant-{tenantId}-{domain}-{aggregateType}-{aggregateId}

# Examples
tenant-123-banking-product-456
tenant-123-banking-account-789
tenant-123-user-session-101
tenant-456-banking-transaction-202
tenant-456-notification-email-303
\`\`\`

### **TypeScript Implementation**
\`\`\`typescript
// Event store service with tenant awareness
@Injectable()
export class TenantEventStoreService {
  constructor(
    @Inject('EVENT_STORE_CLIENT') private eventStore: EventStoreDBClient,
    private logger: Logger
  ) {}

  private buildStreamName(
    tenantId: string,
    domain: string,
    aggregateType: string,
    aggregateId: string
  ): string {
    return \`tenant-\${tenantId}-\${domain}-\${aggregateType}-\${aggregateId}\`;
  }

  // Append events to tenant stream
  async appendToStream(
    tenantId: string,
    domain: string,
    aggregateType: string,
    aggregateId: string,
    events: EventData[],
    expectedRevision?: any
  ): Promise<AppendResult> {
    const streamName = this.buildStreamName(tenantId, domain, aggregateType, aggregateId);
    
    // Add tenant metadata to all events
    const enrichedEvents = events.map(event => ({
      ...event,
      metadata: {
        ...event.metadata,
        tenantId,
        domain,
        aggregateType,
        aggregateId,
        timestamp: new Date().toISOString()
      }
    }));

    return await this.eventStore.appendToStream(
      streamName,
      enrichedEvents,
      { expectedRevision }
    );
  }

  // Read tenant stream events
  async readStream(
    tenantId: string,
    domain: string,
    aggregateType: string,
    aggregateId: string,
    options?: ReadStreamOptions
  ): Promise<ResolvedEvent[]> {
    const streamName = this.buildStreamName(tenantId, domain, aggregateType, aggregateId);
    
    const events: ResolvedEvent[] = [];
    const stream = this.eventStore.readStream(streamName, options);

    for await (const event of stream) {
      events.push(event);
    }

    return events;
  }

  // Read all tenant events by pattern
  async readTenantEvents(
    tenantId: string,
    domain?: string,
    options?: ReadAllOptions
  ): Promise<ResolvedEvent[]> {
    const filterPattern = domain 
      ? \`tenant-\${tenantId}-\${domain}-\`
      : \`tenant-\${tenantId}-\`;

    const events: ResolvedEvent[] = [];
    const stream = this.eventStore.readAll({
      ...options,
      filter: {
        filterOn: 'streamName',
        prefixes: [filterPattern]
      }
    });

    for await (const event of stream) {
      events.push(event);
    }

    return events;
  }
}
\`\`\`

### **Aggregate Repository Pattern**
\`\`\`typescript
// Tenant-aware aggregate repository
export abstract class TenantAggregateRepository<T extends AggregateRoot> {
  constructor(
    protected eventStore: TenantEventStoreService,
    protected tenantId: string,
    protected domain: string,
    protected aggregateType: string
  ) {}

  async save(aggregate: T, expectedVersion?: number): Promise<void> {
    const events = aggregate.getUncommittedEvents();
    if (events.length === 0) return;

    const eventData = events.map(event => ({
      eventId: uuid(),
      type: event.constructor.name,
      data: event,
      metadata: {
        aggregateVersion: aggregate.version + events.indexOf(event) + 1,
        correlationId: aggregate.correlationId,
        causationId: aggregate.causationId
      }
    }));

    await this.eventStore.appendToStream(
      this.tenantId,
      this.domain,
      this.aggregateType,
      aggregate.id,
      eventData,
      expectedVersion
    );

    aggregate.markEventsAsCommitted();
  }

  async getById(aggregateId: string): Promise<T | null> {
    const events = await this.eventStore.readStream(
      this.tenantId,
      this.domain,
      this.aggregateType,
      aggregateId
    );

    if (events.length === 0) return null;

    const aggregate = this.createEmpty();
    aggregate.loadFromHistory(events.map(e => e.event));
    
    return aggregate;
  }

  protected abstract createEmpty(): T;
}

// Banking product repository example
@Injectable()
export class BankingProductRepository extends TenantAggregateRepository<BankingProduct> {
  constructor(
    eventStore: TenantEventStoreService,
    @Inject('TENANT_CONTEXT') private tenantContext: TenantContext
  ) {
    super(eventStore, tenantContext.tenantId, 'banking', 'product');
  }

  protected createEmpty(): BankingProduct {
    return new BankingProduct();
  }

  // Domain-specific queries
  async findActiveProducts(): Promise<BankingProduct[]> {
    const events = await this.eventStore.readTenantEvents(
      this.tenantId,
      this.domain,
      {
        filter: {
          filterOn: 'eventType',
          eventTypes: ['ProductCreated', 'ProductActivated']
        }
      }
    );

    // Group events by aggregate and reconstruct products
    const productsMap = new Map<string, ResolvedEvent[]>();
    
    events.forEach(event => {
      const aggregateId = event.event?.metadata?.aggregateId;
      if (!aggregateId) return;
      
      if (!productsMap.has(aggregateId)) {
        productsMap.set(aggregateId, []);
      }
      productsMap.get(aggregateId)!.push(event);
    });

    const products: BankingProduct[] = [];
    for (const [aggregateId, aggregateEvents] of productsMap) {
      const product = this.createEmpty();
      product.loadFromHistory(aggregateEvents.map(e => e.event));
      if (product.isActive) {
        products.push(product);
      }
    }

    return products;
  }
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Flexible Querying**: Can filter by tenant, domain, or aggregate type
- **✅ Human Readable**: Stream names are self-documenting
- **✅ Cross-Tenant Analytics**: Possible when needed (with proper access control)
- **✅ Event Store Native**: Works with all EventStoreDB features

**Ideal For:**
- Most event-sourced applications
- Multi-tenant SaaS platforms
- Applications requiring flexible event querying
- Systems with moderate isolation requirements

---

## 📁 Category Separation Strategy

### **Category-Based Stream Organization**
\`\`\`
# Category naming convention
$category-tenant_{tenantId}_{domain}_{aggregateType}

# Stream examples within categories
tenant_123_banking_product-456
tenant_123_banking_product-789
tenant_123_banking_account-101
tenant_456_banking_product-202
\`\`\`

### **Category Projection Implementation**
\`\`\`typescript
// Category-based projection service
@Injectable()
export class TenantCategoryProjectionService {
  constructor(
    @Inject('EVENT_STORE_CLIENT') private eventStore: EventStoreDBClient,
    private logger: Logger
  ) {}

  // Create tenant-specific category projection
  async createTenantProjection(
    tenantId: string,
    domain: string,
    aggregateType: string,
    projectionName: string
  ): Promise<void> {
    const categoryName = \`tenant_\${tenantId}_\${domain}_\${aggregateType}\`;
    
    const projectionSource = \`
      fromCategory('\${categoryName}')
        .when({
          \$init: function() {
            return {
              tenantId: '\${tenantId}',
              aggregates: {},
              totalEvents: 0,
              lastUpdated: new Date().toISOString()
            };
          },
          
          \$any: function(state, event) {
            const aggregateId = event.streamId.split('-').pop();
            
            if (!state.aggregates[aggregateId]) {
              state.aggregates[aggregateId] = {
                id: aggregateId,
                events: [],
                version: 0,
                lastEvent: null
              };
            }
            
            state.aggregates[aggregateId].events.push({
              type: event.eventType,
              data: event.data,
              timestamp: event.created
            });
            
            state.aggregates[aggregateId].version++;
            state.aggregates[aggregateId].lastEvent = event.eventType;
            state.totalEvents++;
            state.lastUpdated = new Date().toISOString();
            
            return state;
          }
        })
        .transformBy(function(state) {
          // Create read model suitable for queries
          return {
            tenantId: state.tenantId,
            summary: {
              totalAggregates: Object.keys(state.aggregates).length,
              totalEvents: state.totalEvents,
              lastUpdated: state.lastUpdated
            },
            aggregates: Object.values(state.aggregates)
          };
        })
        .outputState();
    \`;

    await this.eventStore.createProjection(projectionName, projectionSource, {
      enabled: true,
      checkpoints: true,
      emit: true
    });
  }

  // Read tenant projection state
  async getTenantProjectionState(projectionName: string): Promise<any> {
    return await this.eventStore.getProjectionState(projectionName);
  }

  // Query tenant-specific projections
  async queryTenantAggregates(
    tenantId: string,
    domain: string,
    aggregateType: string
  ): Promise<any> {
    const projectionName = \`tenant_\${tenantId}_\${domain}_\${aggregateType}_projection\`;
    const state = await this.getTenantProjectionState(projectionName);
    
    return state?.aggregates || [];
  }
}

// Advanced category projections
@Injectable()
export class AdvancedCategoryProjections {
  constructor(private projectionService: TenantCategoryProjectionService) {}

  // Banking-specific projections
  async createBankingDashboardProjection(tenantId: string): Promise<void> {
    const projectionName = \`tenant_\${tenantId}_banking_dashboard\`;
    
    const projectionSource = \`
      fromCategories(['tenant_\${tenantId}_banking_product', 'tenant_\${tenantId}_banking_account'])
        .when({
          \$init: function() {
            return {
              tenantId: '\${tenantId}',
              dashboard: {
                totalProducts: 0,
                activeAccounts: 0,
                totalTransactionAmount: 0,
                dailyTransactions: {},
                productTypes: {}
              }
            };
          },
          
          'ProductCreated': function(state, event) {
            state.dashboard.totalProducts++;
            
            const productType = event.data.productType;
            if (!state.dashboard.productTypes[productType]) {
              state.dashboard.productTypes[productType] = 0;
            }
            state.dashboard.productTypes[productType]++;
            
            return state;
          },
          
          'AccountCreated': function(state, event) {
            state.dashboard.activeAccounts++;
            return state;
          },
          
          'TransactionProcessed': function(state, event) {
            const amount = parseFloat(event.data.amount);
            state.dashboard.totalTransactionAmount += amount;
            
            const date = event.created.substring(0, 10); // YYYY-MM-DD
            if (!state.dashboard.dailyTransactions[date]) {
              state.dashboard.dailyTransactions[date] = {
                count: 0,
                totalAmount: 0
              };
            }
            
            state.dashboard.dailyTransactions[date].count++;
            state.dashboard.dailyTransactions[date].totalAmount += amount;
            
            return state;
          }
        })
        .outputState();
    \`;

    await this.eventStore.createProjection(projectionName, projectionSource, {
      enabled: true,
      checkpoints: true,
      emit: true
    });
  }

  // Real-time tenant metrics
  async getTenantDashboard(tenantId: string): Promise<TenantDashboard> {
    const projectionName = \`tenant_\${tenantId}_banking_dashboard\`;
    const state = await this.projectionService.getTenantProjectionState(projectionName);
    
    return state?.dashboard || {
      totalProducts: 0,
      activeAccounts: 0,
      totalTransactionAmount: 0,
      dailyTransactions: {},
      productTypes: {}
    };
  }
}

interface TenantDashboard {
  totalProducts: number;
  activeAccounts: number;
  totalTransactionAmount: number;
  dailyTransactions: { [date: string]: { count: number; totalAmount: number } };
  productTypes: { [type: string]: number };
}
\`\`\`

### **Benefits & Use Cases**
- **✅ High Performance**: Category projections are highly optimized
- **✅ Domain Alignment**: Natural fit with DDD bounded contexts
- **✅ Real-time Read Models**: Projections update automatically
- **✅ EventStoreDB Native**: Leverages built-in category features

**Ideal For:**
- Domain-driven design implementations
- Real-time analytics and dashboards
- High-performance read models
- Event-driven architectures with clear domain boundaries

---

## 🎯 Projection Isolation Strategy

### **Tenant-Specific Read Models**
\`\`\`typescript
// Isolated projection manager
@Injectable()
export class TenantProjectionManager {
  constructor(
    @Inject('EVENT_STORE_CLIENT') private eventStore: EventStoreDBClient,
    private logger: Logger
  ) {}

  // Create tenant-specific projection with custom logic
  async createTenantSpecificProjection(
    tenantId: string,
    projectionName: string,
    customLogic: TenantProjectionLogic
  ): Promise<void> {
    const fullProjectionName = \`tenant_\${tenantId}_\${projectionName}\`;
    
    const projectionSource = \`
      fromCategory('tenant_\${tenantId}')
        .when({
          \$init: function() {
            return \${JSON.stringify(customLogic.initialState)};
          },
          
          \${this.generateEventHandlers(customLogic.eventHandlers)}
        })
        .transformBy(function(state) {
          \${customLogic.transformFunction || 'return state;'}
        })
        .outputState();
    \`;

    await this.eventStore.createProjection(fullProjectionName, projectionSource, {
      enabled: true,
      checkpoints: true,
      emit: true
    });
  }

  // Banking-specific tenant projections
  async createBankingProductCatalog(
    tenantId: string,
    catalogConfig: ProductCatalogConfig
  ): Promise<void> {
    const projectionLogic: TenantProjectionLogic = {
      initialState: {
        tenantId,
        catalog: {
          products: {},
          categories: {},
          features: {},
          pricing: {}
        },
        configuration: catalogConfig
      },
      
      eventHandlers: {
        'ProductCreated': \`
          function(state, event) {
            const product = {
              id: event.data.id,
              name: event.data.name,
              type: event.data.type,
              category: event.data.category,
              features: event.data.features || [],
              pricing: event.data.pricing,
              status: 'active',
              createdAt: event.created
            };
            
            state.catalog.products[product.id] = product;
            
            // Update category counts
            if (!state.catalog.categories[product.category]) {
              state.catalog.categories[product.category] = { count: 0, products: [] };
            }
            state.catalog.categories[product.category].count++;
            state.catalog.categories[product.category].products.push(product.id);
            
            // Index features
            product.features.forEach(feature => {
              if (!state.catalog.features[feature]) {
                state.catalog.features[feature] = [];
              }
              state.catalog.features[feature].push(product.id);
            });
            
            return state;
          }
        \`,
        
        'ProductUpdated': \`
          function(state, event) {
            const productId = event.data.id;
            if (state.catalog.products[productId]) {
              Object.assign(state.catalog.products[productId], event.data);
              state.catalog.products[productId].lastUpdated = event.created;
            }
            return state;
          }
        \`,
        
        'ProductDeactivated': \`
          function(state, event) {
            const productId = event.data.id;
            if (state.catalog.products[productId]) {
              state.catalog.products[productId].status = 'inactive';
              state.catalog.products[productId].deactivatedAt = event.created;
            }
            return state;
          }
        \`
      },
      
      transformFunction: \`
        // Create optimized read model
        const activeProducts = Object.values(state.catalog.products)
          .filter(p => p.status === 'active');
          
        return {
          tenantId: state.tenantId,
          lastUpdated: new Date().toISOString(),
          summary: {
            totalProducts: Object.keys(state.catalog.products).length,
            activeProducts: activeProducts.length,
            categories: Object.keys(state.catalog.categories).length,
            features: Object.keys(state.catalog.features).length
          },
          products: activeProducts,
          categorizedProducts: state.catalog.categories,
          featureIndex: state.catalog.features,
          configuration: state.configuration
        };
      \`
    };

    await this.createTenantSpecificProjection(tenantId, 'product_catalog', projectionLogic);
  }

  // Complex tenant-specific business logic
  async createRiskAssessmentProjection(
    tenantId: string,
    riskParameters: RiskAssessmentParameters
  ): Promise<void> {
    const projectionLogic: TenantProjectionLogic = {
      initialState: {
        tenantId,
        riskProfiles: {},
        alerts: [],
        parameters: riskParameters,
        lastCalculation: null
      },
      
      eventHandlers: {
        'TransactionProcessed': \`
          function(state, event) {
            const transaction = event.data;
            const accountId = transaction.accountId;
            
            if (!state.riskProfiles[accountId]) {
              state.riskProfiles[accountId] = {
                accountId: accountId,
                totalTransactions: 0,
                totalAmount: 0,
                averageAmount: 0,
                highRiskTransactions: 0,
                riskScore: 0,
                lastActivity: event.created
              };
            }
            
            const profile = state.riskProfiles[accountId];
            profile.totalTransactions++;
            profile.totalAmount += transaction.amount;
            profile.averageAmount = profile.totalAmount / profile.totalTransactions;
            profile.lastActivity = event.created;
            
            // Risk calculation based on tenant parameters
            if (transaction.amount > state.parameters.highAmountThreshold) {
              profile.highRiskTransactions++;
            }
            
            // Calculate risk score
            const amountRisk = transaction.amount / state.parameters.maxNormalAmount;
            const frequencyRisk = profile.totalTransactions / state.parameters.maxDailyTransactions;
            profile.riskScore = Math.min(100, (amountRisk + frequencyRisk) * 50);
            
            // Generate alerts for high-risk profiles
            if (profile.riskScore > state.parameters.alertThreshold) {
              state.alerts.push({
                accountId: accountId,
                riskScore: profile.riskScore,
                reason: 'High risk score detected',
                timestamp: event.created,
                transactionId: transaction.id
              });
            }
            
            return state;
          }
        \`
      }
    };

    await this.createTenantSpecificProjection(tenantId, 'risk_assessment', projectionLogic);
  }

  private generateEventHandlers(handlers: { [eventType: string]: string }): string {
    return Object.entries(handlers)
      .map(([eventType, handler]) => \`'\${eventType}': \${handler}\`)
      .join(',\\n          ');
  }
}

interface TenantProjectionLogic {
  initialState: any;
  eventHandlers: { [eventType: string]: string };
  transformFunction?: string;
}

interface ProductCatalogConfig {
  enableFeatureSearch: boolean;
  enablePriceComparison: boolean;
  categoryGrouping: string[];
}

interface RiskAssessmentParameters {
  highAmountThreshold: number;
  maxNormalAmount: number;
  maxDailyTransactions: number;
  alertThreshold: number;
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Custom Business Logic**: Tenant-specific processing rules
- **✅ Isolated Read Models**: Complete separation of tenant data
- **✅ Performance Optimization**: Tailored projections for specific needs
- **✅ Complex Analytics**: Advanced data processing per tenant

**Ideal For:**
- Tenants with unique business requirements
- Complex analytics and reporting needs
- Custom compliance and audit trails
- White-label solutions with tenant-specific features

---

## 🏢 Database-per-Tenant Strategy

### **Dedicated EventStoreDB Instances**
\`\`\`typescript
// Multi-instance EventStore manager
@Injectable()
export class TenantEventStoreManager {
  private tenantClients = new Map<string, EventStoreDBClient>();

  constructor(private configService: ConfigService) {}

  async getTenantClient(tenantId: string): Promise<EventStoreDBClient> {
    if (this.tenantClients.has(tenantId)) {
      return this.tenantClients.get(tenantId)!;
    }

    const config = await this.getTenantEventStoreConfig(tenantId);
    const client = new EventStoreDBClient(config);
    
    this.tenantClients.set(tenantId, client);
    return client;
  }

  private async getTenantEventStoreConfig(tenantId: string): Promise<any> {
    const tenantConfig = await this.configService.getTenantEventStoreConfig(tenantId);

    return {
      endpoint: tenantConfig.endpoint || \`https://tenant-\${tenantId}-eventstore.internal:2113\`,
      credentials: {
        username: tenantConfig.username || \`tenant_\${tenantId}_user\`,
        password: tenantConfig.password
      },
      insecure: false,
      defaultCredentials: 'admin:changeit'
    };
  }

  async executeTenantOperation<T>(
    tenantId: string,
    operation: (client: EventStoreDBClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getTenantClient(tenantId);
    return await operation(client);
  }

  // Tenant provisioning
  async provisionTenantEventStore(
    tenantId: string,
    configuration: TenantEventStoreConfig
  ): Promise<void> {
    // This would typically involve infrastructure provisioning
    // For demonstration, we'll show the configuration
    
    const config = {
      clusterId: \`tenant-\${tenantId}-cluster\`,
      nodes: configuration.nodes || 3,
      diskSize: configuration.diskSize || '100GB',
      memorySize: configuration.memorySize || '8GB',
      backupSchedule: configuration.backupSchedule || 'daily',
      retentionPolicy: configuration.retentionPolicy || '1 year'
    };

    await this.configService.storeTenantEventStoreConfig(tenantId, config);
    
    // Initialize tenant-specific projections
    await this.initializeTenantProjections(tenantId);
  }

  private async initializeTenantProjections(tenantId: string): Promise<void> {
    const client = await this.getTenantClient(tenantId);
    
    // Standard projections for this tenant
    const standardProjections = [
      'tenant_streams_projection',
      'tenant_events_by_type',
      'tenant_aggregates_summary'
    ];

    for (const projectionName of standardProjections) {
      await this.createStandardProjection(client, projectionName);
    }
  }
}

// Simplified tenant operations (no prefixing needed)
@Injectable()
export class DedicatedEventStoreService {
  constructor(private tenantManager: TenantEventStoreManager) {}

  async appendToStream(
    tenantId: string,
    streamName: string,
    events: EventData[],
    expectedRevision?: any
  ): Promise<AppendResult> {
    return await this.tenantManager.executeTenantOperation(tenantId, async (client) => {
      // Simple stream names - no tenant prefixing needed
      return await client.appendToStream(streamName, events, { expectedRevision });
    });
  }

  async readStream(
    tenantId: string,
    streamName: string,
    options?: ReadStreamOptions
  ): Promise<ResolvedEvent[]> {
    return await this.tenantManager.executeTenantOperation(tenantId, async (client) => {
      const events: ResolvedEvent[] = [];
      const stream = client.readStream(streamName, options);

      for await (const event of stream) {
        events.push(event);
      }

      return events;
    });
  }

  // Tenant-level operations
  async getTenantStatistics(tenantId: string): Promise<TenantEventStoreStats> {
    return await this.tenantManager.executeTenantOperation(tenantId, async (client) => {
      // Get statistics from this tenant's EventStore
      const stats = await client.getStatistics();
      
      return {
        totalStreams: stats.totalStreams,
        totalEvents: stats.totalEvents,
        diskUsage: stats.diskUsage,
        memoryUsage: stats.memoryUsage,
        lastBackup: stats.lastBackup,
        uptime: stats.uptime
      };
    });
  }

  async backupTenantData(tenantId: string): Promise<string> {
    return await this.tenantManager.executeTenantOperation(tenantId, async (client) => {
      // Initiate backup for this tenant's EventStore
      const backupResult = await client.createBackup({
        destination: \`s3://tenant-\${tenantId}-backups/\${new Date().toISOString()}\`,
        includeIndexes: true,
        includeProjections: true
      });
      
      return backupResult.backupId;
    });
  }
}

interface TenantEventStoreConfig {
  nodes?: number;
  diskSize?: string;
  memorySize?: string;
  backupSchedule?: string;
  retentionPolicy?: string;
}

interface TenantEventStoreStats {
  totalStreams: number;
  totalEvents: number;
  diskUsage: string;
  memoryUsage: string;
  lastBackup: Date;
  uptime: string;
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Maximum Isolation**: Complete instance separation
- **✅ Independent Scaling**: Per-tenant performance tuning
- **✅ Custom Configuration**: Tenant-specific EventStore settings
- **✅ Compliance**: Meets strictest data isolation requirements
- **✅ Disaster Recovery**: Independent backup and restore strategies

**Ideal For:**
- Enterprise clients requiring dedicated infrastructure
- Highly regulated industries (banking, healthcare)
- Tenants with massive event volumes
- Geographic data residency compliance
- White-label solutions with complete isolation

---

## 🛠️ Implementation Guidelines

### **Event Schema Design**
\`\`\`typescript
// Tenant-aware event base class
export abstract class TenantEvent {
  abstract readonly eventType: string;
  readonly tenantId: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(data: {
    tenantId: string;
    aggregateId: string;
    aggregateType: string;
    version: number;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = data.tenantId;
    this.aggregateId = data.aggregateId;
    this.aggregateType = data.aggregateType;
    this.version = data.version;
    this.timestamp = new Date();
    this.correlationId = data.correlationId;
    this.causationId = data.causationId;
  }
}

// Domain event examples
export class BankingProductCreatedEvent extends TenantEvent {
  readonly eventType = 'BankingProductCreated';
  
  constructor(
    tenantData: any,
    public readonly productName: string,
    public readonly productType: string,
    public readonly interestRate: number,
    public readonly features: string[]
  ) {
    super(tenantData);
  }
}

export class AccountCreatedEvent extends TenantEvent {
  readonly eventType = 'AccountCreated';
  
  constructor(
    tenantData: any,
    public readonly accountNumber: string,
    public readonly customerId: string,
    public readonly productId: string,
    public readonly initialBalance: number
  ) {
    super(tenantData);
  }
}
\`\`\`

### **Performance Optimization**
\`\`\`typescript
// Optimized event store operations
@Injectable()
export class OptimizedTenantEventStore {
  constructor(
    private eventStore: TenantEventStoreService,
    private cacheService: CacheService
  ) {}

  // Batch event appending
  async appendBatchEvents(
    tenantId: string,
    streamEvents: Array<{
      streamName: string;
      events: EventData[];
      expectedRevision?: any;
    }>
  ): Promise<AppendResult[]> {
    const promises = streamEvents.map(({ streamName, events, expectedRevision }) => {
      const [domain, aggregateType, aggregateId] = this.parseStreamName(streamName);
      return this.eventStore.appendToStream(
        tenantId,
        domain,
        aggregateType,
        aggregateId,
        events,
        expectedRevision
      );
    });

    return await Promise.all(promises);
  }

  // Cached aggregate loading
  async loadAggregateWithCache<T extends AggregateRoot>(
    tenantId: string,
    domain: string,
    aggregateType: string,
    aggregateId: string,
    createEmpty: () => T,
    cacheTtl: number = 300 // 5 minutes
  ): Promise<T | null> {
    const cacheKey = \`aggregate:\${tenantId}:\${domain}:\${aggregateType}:\${aggregateId}\`;
    
    // Try cache first
    const cached = await this.cacheService.get<T>(cacheKey);
    if (cached) return cached;

    // Load from event store
    const events = await this.eventStore.readStream(tenantId, domain, aggregateType, aggregateId);
    if (events.length === 0) return null;

    const aggregate = createEmpty();
    aggregate.loadFromHistory(events.map(e => e.event));
    
    // Cache the loaded aggregate
    await this.cacheService.set(cacheKey, aggregate, cacheTtl);
    
    return aggregate;
  }

  // Snapshot support
  async createSnapshot<T>(
    tenantId: string,
    domain: string,
    aggregateType: string,
    aggregateId: string,
    aggregate: T,
    version: number
  ): Promise<void> {
    const snapshotStream = \`\${tenantId}-\${domain}-\${aggregateType}-\${aggregateId}-snapshots\`;
    
    const snapshotEvent = {
      eventId: uuid(),
      type: 'AggregateSnapshot',
      data: {
        aggregateId,
        aggregateType,
        version,
        data: aggregate,
        createdAt: new Date().toISOString()
      }
    };

    await this.eventStore.appendToStream(
      tenantId,
      domain,
      'snapshots',
      aggregateId,
      [snapshotEvent]
    );
  }

  private parseStreamName(streamName: string): [string, string, string] {
    const parts = streamName.split('-');
    return [parts[1], parts[2], parts[3]]; // domain, aggregateType, aggregateId
  }
}
\`\`\`

---

## 📊 Strategy Comparison Matrix

| Aspect | Stream Prefixing | Category Separation | Projection Isolation | Database-per-Tenant |
|--------|------------------|--------------------|--------------------|---------------------|
| **Isolation Level** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Query Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Operational Complexity** | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cost Efficiency** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Scalability** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Compliance** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

*💡 **Recommendation**: Start with stream prefixing for flexibility, use category separation for high-performance projections, add projection isolation for complex business logic, and reserve database-per-tenant for enterprise clients with strict compliance requirements.*

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

    SwaggerModule.setup('api/docs/multi-tenancy/eventstore', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/multi-tenancy/eventstore`;
  }
}
