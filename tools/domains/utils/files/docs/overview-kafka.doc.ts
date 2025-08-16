import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 🔀 Kafka Multi-Tenancy Strategies Documentation
 *
 * This module provides comprehensive documentation for Kafka-specific
 * multi-tenancy patterns and event streaming strategies.
 */
export class OverviewKafkaDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🔀 Kafka Multi-Tenancy Strategies')
      .setDescription(
        `

---

## 🌐 Distributed Bounded Context Communication

### **Kafka as Contract Boundary**

In a distributed architecture where bounded contexts are deployed separately, **Kafka becomes the contract boundary** for inter-BC events — enabling **decoupled**, **observable**, and **scalable** communication.

#### **📡 Upstream & Downstream Flow**

In software architecture, **"upstream"** and **"downstream"** describe the direction of data or control flow between systems, services, or components.

\`\`\`
┌─────────────────┐    Events    ┌─────────────────┐    Events    ┌─────────────────┐
│   Banking BC    │─────────────→│   Kafka Topics  │─────────────→│ Notification BC │
│   (Upstream)    │              │  (Contract Bus) │              │  (Downstream)   │
└─────────────────┘              └─────────────────┘              └─────────────────┘
        │                                │                                │
        ▼                                ▼                                ▼
   Produces Events              Stores & Routes Events              Consumes Events
   - AccountCreated             - Event Persistence                - Send Welcome Email
   - TransactionMade            - Event Ordering                   - Update Preferences
   - FeeApplied                 - Event Delivery                   - Generate Reports
\`\`\`

#### **🎯 Event Flow Patterns**

**Upstream Bounded Context (Producer)**:
- **Banking Context**: Produces business events when domain state changes
- **Core Context**: Produces configuration and system events
- **User Context**: Produces user lifecycle events

**Downstream Bounded Context (Consumer)**:
- **Notification Context**: Consumes events to send communications
- **Analytics Context**: Consumes events to build reports and insights
- **Audit Context**: Consumes events to maintain compliance trails

#### **📋 Contract Definition Example**

\`\`\`json
// banking-events topic schema
{
  "eventType": "AccountCreated",
  "version": "v1",
  "tenantId": "tenant-123",
  "aggregateId": "account-456",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "accountNumber": "ACC-789",
    "productType": "SAVINGS",
    "customerId": "CUST-101",
    "initialBalance": 1000.00,
    "currency": "USD"
  },
  "metadata": {
    "correlationId": "req-abc123",
    "causationId": "cmd-def456",
    "userId": "user-789"
  }
}
\`\`\`

### **🔄 Inter-BC Communication Patterns**

#### **1. Domain Event Publishing**
\`\`\`typescript
// Banking BC publishes domain events
class BankingProductAggregate {
  createAccount(accountData: CreateAccountData): void {
    // Domain logic...
    const event = new AccountCreatedEvent({
      tenantId: this.tenantId,
      accountId: this.accountId,
      productType: accountData.productType,
      customerId: accountData.customerId
    });
    
    this.addDomainEvent(event);
  }
}

// Event gets published to Kafka
await eventPublisher.publish('banking-events', event);
\`\`\`

#### **2. Event Consumption & Projection**
\`\`\`typescript
// Notification BC consumes banking events
@EventHandler('AccountCreated')
class AccountCreatedHandler {
  async handle(event: AccountCreatedEvent): Promise<void> {
    // Downstream business logic
    await this.emailService.sendWelcomeEmail({
      customerId: event.customerId,
      accountNumber: event.accountNumber,
      productType: event.productType
    });
    
    // Update downstream read model
    await this.customerPreferences.updateAccountNotifications(
      event.customerId,
      event.accountId
    );
  }
}
\`\`\`

#### **3. Saga Orchestration**
\`\`\`typescript
// Cross-BC business process coordination
@Saga()
class AccountOnboardingSaga {
  @StartsSaga()
  async onAccountCreated(event: AccountCreatedEvent): Promise<void> {
    // Coordinate across multiple BCs
    await this.commandBus.send(new CreateWelcomePackageCommand({
      customerId: event.customerId,
      accountId: event.accountId
    }));
    
    await this.commandBus.send(new SetupDefaultPreferencesCommand({
      customerId: event.customerId
    }));
  }
}
\`\`\`

### **🎯 Benefits of Kafka Contract Boundary**

#### **🔗 Decoupling**
- **Temporal Decoupling**: Producer and consumer don't need to be online simultaneously
- **Spatial Decoupling**: Services can be deployed independently
- **Synchronization Decoupling**: Asynchronous communication prevents blocking

#### **👁️ Observability**
- **Event Audit Trail**: Complete history of all inter-BC communications
- **Message Tracing**: Correlation IDs for end-to-end request tracking
- **Dead Letter Queues**: Failed message handling and analysis

#### **📈 Scalability**
- **Independent Scaling**: Each BC can scale based on its specific load
- **Partitioning**: Events distributed across partitions for parallel processing
- **Consumer Groups**: Multiple instances of downstream services for load distribution

### **🔧 Contract Boundary Implementation Strategies**

#### **Event Schema Evolution**
\`\`\`json
// Backward compatible schema evolution
{
  "eventType": "AccountCreated",
  "version": "v2",  // ← Version increment
  "data": {
    "accountNumber": "ACC-789",
    "productType": "SAVINGS",
    "customerId": "CUST-101",
    "initialBalance": 1000.00,
    "currency": "USD",
    "branchCode": "BR-001"  // ← New optional field
  }
}
\`\`\`

#### **Multi-Tenant Event Routing**
\`\`\`typescript
// Tenant-aware event publishing for distributed BCs
const topicName = \`tenant-\${tenantId}-banking-events\`;
await eventPublisher.publish(topicName, event, {
  partition: hash(event.aggregateId) % partitionCount,
  headers: {
    'tenant-id': tenantId,
    'event-type': event.constructor.name,
    'source-bc': 'banking',
    'target-bc': 'notification'
  }
});
\`\`\`

#### **Error Handling & Retry**
\`\`\`typescript
// Resilient inter-BC event processing
@EventHandler('AccountCreated', {
  retryPolicy: {
    maxRetries: 3,
    backoffStrategy: 'exponential',
    deadLetterTopic: 'notification-dlq'
  }
})
class ResilientAccountHandler {
  async handle(event: AccountCreatedEvent): Promise<void> {
    try {
      await this.processEvent(event);
    } catch (error) {
      // Automatic retry with exponential backoff
      throw new RetryableError(error.message);
    }
  }
}
\`\`\`

---

# 🔀 Kafka Multi-Tenancy Strategies

Comprehensive guide to implementing multi-tenancy patterns in Kafka for event streaming, inter-service communication, and distributed bounded context coordination.

---

## 🎯 Strategy Overview

Kafka provides multiple approaches to tenant isolation in event-driven architectures, each optimized for different message volumes and isolation requirements.

| Strategy | Isolation Level | Throughput | Operational Complexity | Best For |
|----------|----------------|------------|------------------------|----------|
| **Topic Prefixing** | Medium | ⭐⭐⭐⭐ | Low | Most applications, flexible routing |
| **Partition Strategy** | Medium | ⭐⭐⭐⭐⭐ | Medium | High-throughput, tenant-specific ordering |
| **Consumer Group Strategy** | High | ⭐⭐⭐⭐ | Medium | Independent processing, error isolation |
| **Cluster-per-Tenant** | Maximum | ⭐⭐⭐ | High | Enterprise, strict compliance |

---

## 🏷️ Topic Prefixing Strategy

### **Topic Naming Convention**
\`\`\`
# Hierarchical topic naming
tenant-{tenantId}-{domain}-{eventType}

# Examples
tenant-123-banking-events
tenant-123-banking-commands
tenant-123-user-events
tenant-456-product-events
tenant-456-notification-events
\`\`\`

### **TypeScript Implementation**
\`\`\`typescript
// Tenant-aware Kafka service
@Injectable()
export class TenantKafkaService {
  constructor(
    @Inject('KAFKA_PRODUCER') private producer: Producer,
    @Inject('KAFKA_CONSUMER') private consumer: Consumer,
    private logger: Logger
  ) {}

  private buildTopicName(tenantId: string, domain: string, eventType: string): string {
    return \`tenant-\${tenantId}-\${domain}-\${eventType}\`;
  }

  // Publish tenant events
  async publishEvent(
    tenantId: string,
    domain: string,
    eventType: string,
    event: any,
    options?: PublishOptions
  ): Promise<RecordMetadata[]> {
    const topic = this.buildTopicName(tenantId, domain, eventType);
    
    const message = {
      key: options?.key || event.aggregateId,
      value: JSON.stringify({
        ...event,
        metadata: {
          ...event.metadata,
          tenantId,
          domain,
          eventType,
          publishedAt: new Date().toISOString(),
          version: '1.0'
        }
      }),
      headers: {
        'tenant-id': tenantId,
        'domain': domain,
        'event-type': eventType,
        'correlation-id': options?.correlationId || '',
        'message-type': 'domain-event'
      }
    };

    return await this.producer.send({
      topic,
      messages: [message]
    });
  }

  // Subscribe to tenant events
  async subscribeTenantEvents(
    tenantId: string,
    domain: string,
    eventTypes: string[],
    handler: EventHandler,
    consumerGroup: string
  ): Promise<void> {
    const topics = eventTypes.map(eventType => 
      this.buildTopicName(tenantId, domain, eventType)
    );

    const consumer = this.kafka.consumer({ 
      groupId: \`\${consumerGroup}-\${tenantId}\`,
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });

    await consumer.connect();
    await consumer.subscribe({ topics });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}');
          const headers = this.parseHeaders(message.headers);
          
          await handler.handle(event, {
            topic,
            partition,
            offset: message.offset,
            headers,
            timestamp: message.timestamp
          });
          
        } catch (error) {
          this.logger.error(\`Error processing message from \${topic}\`, error);
          // Could implement dead letter queue here
        }
      }
    });
  }

  // Topic management
  async createTenantTopics(
    tenantId: string,
    domains: string[],
    eventTypes: string[]
  ): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();

    const topics = [];
    for (const domain of domains) {
      for (const eventType of eventTypes) {
        topics.push({
          topic: this.buildTopicName(tenantId, domain, eventType),
          numPartitions: 3,
          replicationFactor: 2,
          configEntries: [
            { name: 'cleanup.policy', value: 'delete' },
            { name: 'retention.ms', value: '604800000' }, // 7 days
            { name: 'compression.type', value: 'snappy' }
          ]
        });
      }
    }

    await admin.createTopics({ topics });
    await admin.disconnect();
  }
}

interface PublishOptions {
  key?: string;
  correlationId?: string;
  partition?: number;
}

interface EventHandler {
  handle(event: any, context: MessageContext): Promise<void>;
}

interface MessageContext {
  topic: string;
  partition: number;
  offset: string;
  headers: { [key: string]: string };
  timestamp: string;
}
\`\`\`

### **Event Publishing Patterns**
\`\`\`typescript
// Domain event publisher
@Injectable()
export class TenantDomainEventPublisher {
  constructor(private kafkaService: TenantKafkaService) {}

  // Banking domain events
  async publishBankingEvent(
    tenantId: string,
    event: BankingDomainEvent
  ): Promise<void> {
    await this.kafkaService.publishEvent(
      tenantId,
      'banking',
      'events',
      event,
      {
        key: event.aggregateId,
        correlationId: event.correlationId
      }
    );
  }

  // Cross-domain command publishing
  async publishCommand(
    tenantId: string,
    targetDomain: string,
    command: DomainCommand
  ): Promise<void> {
    await this.kafkaService.publishEvent(
      tenantId,
      targetDomain,
      'commands',
      command,
      {
        key: command.targetAggregateId,
        correlationId: command.correlationId
      }
    );
  }

  // Integration events (cross-tenant if needed)
  async publishIntegrationEvent(
    tenantId: string,
    event: IntegrationEvent
  ): Promise<void> {
    // For cross-tenant events, use integration topic
    const topic = event.crossTenant 
      ? 'integration-events'
      : \`tenant-\${tenantId}-integration-events\`;
      
    await this.producer.send({
      topic,
      messages: [{
        key: event.eventId,
        value: JSON.stringify(event),
        headers: {
          'source-tenant': tenantId,
          'event-type': event.eventType,
          'cross-tenant': event.crossTenant ? 'true' : 'false'
        }
      }]
    });
  }
}

// Event consumer base class
export abstract class TenantEventConsumer {
  constructor(
    protected tenantId: string,
    protected kafkaService: TenantKafkaService,
    protected logger: Logger
  ) {}

  abstract getConsumerGroup(): string;
  abstract getSubscriptions(): EventSubscription[];
  
  async startConsuming(): Promise<void> {
    const subscriptions = this.getSubscriptions();
    
    for (const subscription of subscriptions) {
      await this.kafkaService.subscribeTenantEvents(
        this.tenantId,
        subscription.domain,
        subscription.eventTypes,
        {
          handle: async (event, context) => {
            await this.handleEvent(event, context, subscription);
          }
        },
        this.getConsumerGroup()
      );
    }
  }

  protected abstract handleEvent(
    event: any,
    context: MessageContext,
    subscription: EventSubscription
  ): Promise<void>;
}

interface EventSubscription {
  domain: string;
  eventTypes: string[];
  handler?: string;
}

// Banking notification consumer example
@Injectable()
export class BankingNotificationConsumer extends TenantEventConsumer {
  getConsumerGroup(): string {
    return 'banking-notifications';
  }

  getSubscriptions(): EventSubscription[] {
    return [
      {
        domain: 'banking',
        eventTypes: ['events'],
        handler: 'banking-events'
      }
    ];
  }

  protected async handleEvent(
    event: any,
    context: MessageContext,
    subscription: EventSubscription
  ): Promise<void> {
    switch (event.eventType) {
      case 'AccountCreated':
        await this.handleAccountCreated(event);
        break;
      case 'TransactionProcessed':
        await this.handleTransactionProcessed(event);
        break;
      default:
        this.logger.debug(\`Unhandled event type: \${event.eventType}\`);
    }
  }

  private async handleAccountCreated(event: any): Promise<void> {
    // Send welcome email, set up notifications, etc.
    this.logger.info(\`Processing AccountCreated for tenant \${this.tenantId}\`);
  }

  private async handleTransactionProcessed(event: any): Promise<void> {
    // Send transaction notifications
    this.logger.info(\`Processing TransactionProcessed for tenant \${this.tenantId}\`);
  }
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Clear Ownership**: Topic names clearly indicate tenant and domain
- **✅ Flexible Routing**: Can subscribe to specific tenant/domain combinations
- **✅ Access Control**: Topic-level security and ACLs
- **✅ Monitoring**: Easy to track metrics per tenant

**Ideal For:**
- Most multi-tenant applications
- Clear domain boundaries
- Tenant-specific monitoring and alerting
- Flexible subscription patterns

---

## 🎯 Partition Strategy

### **Tenant-Based Partitioning**
\`\`\`typescript
// Tenant-aware partitioning service
@Injectable()
export class TenantPartitioningService {
  constructor(
    @Inject('KAFKA_PRODUCER') private producer: Producer,
    private configService: ConfigService
  ) {}

  // Calculate tenant partition
  private calculateTenantPartition(tenantId: string, totalPartitions: number): number {
    // Consistent hashing to ensure same tenant always goes to same partition
    const hash = this.hash(tenantId);
    return hash % totalPartitions;
  }

  // Publish with tenant-based partitioning
  async publishWithTenantPartitioning(
    topic: string,
    tenantId: string,
    event: any,
    options?: PartitioningOptions
  ): Promise<RecordMetadata[]> {
    const topicMetadata = await this.getTopicMetadata(topic);
    const partition = options?.customPartition ?? 
      this.calculateTenantPartition(tenantId, topicMetadata.partitionCount);

    const message = {
      key: tenantId, // Tenant ID as message key for ordering
      value: JSON.stringify({
        ...event,
        tenantId,
        partitionInfo: {
          partition,
          totalPartitions: topicMetadata.partitionCount,
          partitionKey: tenantId
        }
      }),
      partition, // Explicit partition assignment
      headers: {
        'tenant-id': tenantId,
        'partition-strategy': 'tenant-based',
        'partition-number': partition.toString()
      }
    };

    return await this.producer.send({
      topic,
      messages: [message]
    });
  }

  // Advanced partitioning strategies
  async publishWithLoadBalancing(
    topic: string,
    tenantId: string,
    event: any,
    loadBalancingStrategy: LoadBalancingStrategy
  ): Promise<RecordMetadata[]> {
    let partition: number;

    switch (loadBalancingStrategy.type) {
      case 'round-robin':
        partition = await this.getRoundRobinPartition(topic, tenantId);
        break;
      case 'least-loaded':
        partition = await this.getLeastLoadedPartition(topic, tenantId);
        break;
      case 'consistent-hash':
        partition = this.calculateTenantPartition(
          \`\${tenantId}-\${event.aggregateId}\`,
          loadBalancingStrategy.totalPartitions
        );
        break;
      default:
        partition = this.calculateTenantPartition(tenantId, loadBalancingStrategy.totalPartitions);
    }

    return await this.publishWithTenantPartitioning(topic, tenantId, event, {
      customPartition: partition
    });
  }

  // Tenant partition analytics
  async getTenantPartitionMetrics(
    topic: string,
    tenantId: string,
    timeRange: TimeRange
  ): Promise<PartitionMetrics> {
    const topicMetadata = await this.getTopicMetadata(topic);
    const tenantPartition = this.calculateTenantPartition(tenantId, topicMetadata.partitionCount);

    // Get metrics for the tenant's partition
    const metrics = await this.getPartitionMetrics(topic, tenantPartition, timeRange);

    return {
      tenantId,
      partition: tenantPartition,
      messageCount: metrics.messageCount,
      bytesSize: metrics.bytesSize,
      averageLatency: metrics.averageLatency,
      errorRate: metrics.errorRate,
      consumerLag: metrics.consumerLag
    };
  }

  private hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

interface PartitioningOptions {
  customPartition?: number;
  keyOverride?: string;
}

interface LoadBalancingStrategy {
  type: 'round-robin' | 'least-loaded' | 'consistent-hash' | 'tenant-dedicated';
  totalPartitions: number;
  options?: any;
}

interface PartitionMetrics {
  tenantId: string;
  partition: number;
  messageCount: number;
  bytesSize: number;
  averageLatency: number;
  errorRate: number;
  consumerLag: number;
}

interface TimeRange {
  start: Date;
  end: Date;
}
\`\`\`

### **Partition Management**
\`\`\`typescript
// Dynamic partition allocation
@Injectable()
export class DynamicPartitionManager {
  constructor(
    private kafka: Kafka,
    private metricsService: MetricsService
  ) {}

  // Allocate dedicated partitions for high-volume tenants
  async allocateDedicatedPartitions(
    topic: string,
    tenantId: string,
    partitionCount: number
  ): Promise<number[]> {
    const admin = this.kafka.admin();
    await admin.connect();

    try {
      // Get current topic configuration
      const topicMetadata = await admin.fetchTopicMetadata({ topics: [topic] });
      const currentPartitions = topicMetadata.topics[0].partitions.length;

      // Add new partitions for this tenant
      await admin.createPartitions({
        topicPartitions: [{
          topic,
          count: currentPartitions + partitionCount
        }]
      });

      // Allocate the new partitions to this tenant
      const allocatedPartitions = [];
      for (let i = 0; i < partitionCount; i++) {
        allocatedPartitions.push(currentPartitions + i);
      }

      // Store allocation in metadata
      await this.storeTenantPartitionAllocation(tenantId, topic, allocatedPartitions);

      return allocatedPartitions;

    } finally {
      await admin.disconnect();
    }
  }

  // Monitor and rebalance partitions based on load
  async rebalanceTenantPartitions(topic: string): Promise<RebalanceResult> {
    const tenantMetrics = await this.getTenantLoadMetrics(topic);
    const rebalanceActions: RebalanceAction[] = [];

    for (const [tenantId, metrics] of tenantMetrics) {
      if (metrics.averageLatency > 1000) { // High latency threshold
        // Allocate additional partition
        const newPartitions = await this.allocateDedicatedPartitions(topic, tenantId, 1);
        rebalanceActions.push({
          tenantId,
          action: 'allocate',
          partitions: newPartitions,
          reason: 'High latency detected'
        });
      } else if (metrics.messageRate < 10 && metrics.allocatedPartitions > 1) {
        // Deallocate unused partition
        const removedPartition = await this.deallocatePartition(topic, tenantId);
        rebalanceActions.push({
          tenantId,
          action: 'deallocate',
          partitions: [removedPartition],
          reason: 'Low message rate'
        });
      }
    }

    return {
      topic,
      actions: rebalanceActions,
      rebalancedAt: new Date()
    };
  }

  // Partition health monitoring
  async monitorPartitionHealth(topic: string): Promise<PartitionHealthReport> {
    const admin = this.kafka.admin();
    await admin.connect();

    try {
      const topicMetadata = await admin.fetchTopicMetadata({ topics: [topic] });
      const partitions = topicMetadata.topics[0].partitions;
      
      const healthReport: PartitionHealthReport = {
        topic,
        totalPartitions: partitions.length,
        healthyPartitions: 0,
        unhealthyPartitions: [],
        checkedAt: new Date()
      };

      for (const partition of partitions) {
        const health = await this.checkPartitionHealth(topic, partition.partitionId);
        
        if (health.isHealthy) {
          healthReport.healthyPartitions++;
        } else {
          healthReport.unhealthyPartitions.push({
            partitionId: partition.partitionId,
            issues: health.issues,
            severity: health.severity
          });
        }
      }

      return healthReport;

    } finally {
      await admin.disconnect();
    }
  }
}

interface RebalanceAction {
  tenantId: string;
  action: 'allocate' | 'deallocate';
  partitions: number[];
  reason: string;
}

interface RebalanceResult {
  topic: string;
  actions: RebalanceAction[];
  rebalancedAt: Date;
}

interface PartitionHealthReport {
  topic: string;
  totalPartitions: number;
  healthyPartitions: number;
  unhealthyPartitions: Array<{
    partitionId: number;
    issues: string[];
    severity: 'low' | 'medium' | 'high';
  }>;
  checkedAt: Date;
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Message Ordering**: Events for same tenant maintain order
- **✅ Load Distribution**: Even distribution across partitions
- **✅ Parallel Processing**: Different tenants can be processed in parallel
- **✅ Scalability**: Easy to add partitions for high-volume tenants

**Ideal For:**
- High-throughput applications
- Applications requiring message ordering per tenant
- Systems with varying tenant load patterns
- Parallel processing requirements

---

## 👥 Consumer Group Strategy

### **Tenant-Specific Consumer Groups**
\`\`\`typescript
// Tenant-isolated consumer management
@Injectable()
export class TenantConsumerGroupManager {
  private consumerGroups = new Map<string, Consumer>();
  
  constructor(
    private kafka: Kafka,
    private logger: Logger
  ) {}

  // Create tenant-specific consumer group
  async createTenantConsumerGroup(
    tenantId: string,
    groupId: string,
    config?: ConsumerConfig
  ): Promise<Consumer> {
    const tenantGroupId = \`tenant-\${tenantId}-\${groupId}\`;
    
    if (this.consumerGroups.has(tenantGroupId)) {
      return this.consumerGroups.get(tenantGroupId)!;
    }

    const consumer = this.kafka.consumer({
      groupId: tenantGroupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576, // 1MB
      ...config
    });

    this.consumerGroups.set(tenantGroupId, consumer);
    
    // Set up error handling
    consumer.on('consumer.crash', (error) => {
      this.logger.error(\`Consumer crashed for tenant \${tenantId}\`, error);
      this.handleConsumerCrash(tenantId, groupId, error);
    });

    return consumer;
  }

  // Subscribe tenant consumer to topics
  async subscribeTenantConsumer(
    tenantId: string,
    groupId: string,
    topics: string[],
    handler: TenantMessageHandler
  ): Promise<void> {
    const consumer = await this.createTenantConsumerGroup(tenantId, groupId);
    
    await consumer.connect();
    await consumer.subscribe({ topics });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const context: TenantMessageContext = {
          tenantId,
          topic,
          partition,
          offset: message.offset,
          timestamp: message.timestamp,
          headers: this.parseHeaders(message.headers)
        };

        try {
          await handler.processMessage(message, context);
          
          // Commit manually for better control
          await consumer.commitOffsets([{
            topic,
            partition,
            offset: (parseInt(message.offset) + 1).toString()
          }]);

        } catch (error) {
          await this.handleProcessingError(context, error, message);
        }
      }
    });
  }

  // Tenant-specific error handling
  private async handleProcessingError(
    context: TenantMessageContext,
    error: Error,
    message: KafkaMessage
  ): Promise<void> {
    this.logger.error(
      \`Error processing message for tenant \${context.tenantId}\`, 
      { error, context, messageKey: message.key?.toString() }
    );

    // Tenant-specific dead letter queue
    const dlqTopic = \`tenant-\${context.tenantId}-dlq\`;
    
    await this.sendToDeadLetterQueue(dlqTopic, message, error, context);
  }

  // Dead letter queue management
  private async sendToDeadLetterQueue(
    dlqTopic: string,
    originalMessage: KafkaMessage,
    error: Error,
    context: TenantMessageContext
  ): Promise<void> {
    const producer = this.kafka.producer();
    await producer.connect();

    try {
      await producer.send({
        topic: dlqTopic,
        messages: [{
          key: originalMessage.key,
          value: originalMessage.value,
          headers: {
            ...originalMessage.headers,
            'dlq-reason': error.message,
            'dlq-timestamp': new Date().toISOString(),
            'original-topic': context.topic,
            'original-partition': context.partition.toString(),
            'original-offset': context.offset
          }
        }]
      });
    } finally {
      await producer.disconnect();
    }
  }

  // Consumer group monitoring
  async getConsumerGroupMetrics(tenantId: string, groupId: string): Promise<ConsumerGroupMetrics> {
    const tenantGroupId = \`tenant-\${tenantId}-\${groupId}\`;
    const admin = this.kafka.admin();
    await admin.connect();

    try {
      const description = await admin.describeGroups([tenantGroupId]);
      const offsets = await admin.fetchOffsets({ groupId: tenantGroupId });

      return {
        tenantId,
        groupId: tenantGroupId,
        state: description.groups[0]?.state || 'Unknown',
        memberCount: description.groups[0]?.members.length || 0,
        coordinator: description.groups[0]?.coordinator,
        lag: this.calculateConsumerLag(offsets),
        lastActivity: new Date()
      };
    } finally {
      await admin.disconnect();
    }
  }
}

interface TenantMessageHandler {
  processMessage(message: KafkaMessage, context: TenantMessageContext): Promise<void>;
}

interface TenantMessageContext {
  tenantId: string;
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  headers: { [key: string]: string };
}

interface ConsumerGroupMetrics {
  tenantId: string;
  groupId: string;
  state: string;
  memberCount: number;
  coordinator?: any;
  lag: number;
  lastActivity: Date;
}

// Banking event processor example
@Injectable()
export class BankingEventProcessor implements TenantMessageHandler {
  constructor(
    private bankingService: BankingService,
    private notificationService: NotificationService,
    private logger: Logger
  ) {}

  async processMessage(message: KafkaMessage, context: TenantMessageContext): Promise<void> {
    const event = JSON.parse(message.value?.toString() || '{}');
    
    // Route to appropriate handler based on event type
    switch (event.eventType) {
      case 'AccountCreated':
        await this.handleAccountCreated(event, context);
        break;
      case 'TransactionProcessed':
        await this.handleTransactionProcessed(event, context);
        break;
      case 'ProductCreated':
        await this.handleProductCreated(event, context);
        break;
      default:
        this.logger.warn(\`Unknown event type: \${event.eventType}\`, { context });
    }
  }

  private async handleAccountCreated(event: any, context: TenantMessageContext): Promise<void> {
    // Update read models
    await this.bankingService.updateAccountReadModel(context.tenantId, event);
    
    // Send notifications
    await this.notificationService.sendAccountCreatedNotification(
      context.tenantId,
      event.customerId,
      event.accountId
    );
    
    this.logger.info(\`Processed AccountCreated for tenant \${context.tenantId}\`);
  }

  private async handleTransactionProcessed(event: any, context: TenantMessageContext): Promise<void> {
    // Update balances and transaction history
    await this.bankingService.updateTransactionReadModel(context.tenantId, event);
    
    // Real-time balance updates
    await this.bankingService.updateAccountBalance(
      context.tenantId,
      event.accountId,
      event.amount
    );
    
    this.logger.info(\`Processed TransactionProcessed for tenant \${context.tenantId}\`);
  }

  private async handleProductCreated(event: any, context: TenantMessageContext): Promise<void> {
    // Update product catalog
    await this.bankingService.updateProductCatalog(context.tenantId, event);
    
    this.logger.info(\`Processed ProductCreated for tenant \${context.tenantId}\`);
  }
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Processing Isolation**: Each tenant has dedicated consumer groups
- **✅ Error Isolation**: Failures in one tenant don't affect others
- **✅ Independent Scaling**: Scale consumers per tenant based on load
- **✅ Monitoring**: Tenant-specific metrics and alerting

**Ideal For:**
- Applications requiring processing isolation
- Different SLA requirements per tenant
- Tenant-specific error handling and retry policies
- Independent scaling and monitoring

---

## 🏢 Cluster-per-Tenant Strategy

### **Dedicated Kafka Clusters**
\`\`\`typescript
// Multi-cluster Kafka manager
@Injectable()
export class TenantKafkaClusterManager {
  private tenantClusters = new Map<string, Kafka>();

  constructor(private configService: ConfigService) {}

  async getTenantKafka(tenantId: string): Promise<Kafka> {
    if (this.tenantClusters.has(tenantId)) {
      return this.tenantClusters.get(tenantId)!;
    }

    const config = await this.getTenantKafkaConfig(tenantId);
    const kafka = new Kafka(config);
    
    this.tenantClusters.set(tenantId, kafka);
    return kafka;
  }

  private async getTenantKafkaConfig(tenantId: string): Promise<KafkaConfig> {
    const tenantConfig = await this.configService.getTenantKafkaConfig(tenantId);

    return {
      clientId: \`tenant-\${tenantId}-client\`,
      brokers: tenantConfig.brokers || [\`tenant-\${tenantId}-kafka.internal:9092\`],
      ssl: tenantConfig.ssl || {
        rejectUnauthorized: false,
        ca: [tenantConfig.caCert],
        key: tenantConfig.clientKey,
        cert: tenantConfig.clientCert
      },
      sasl: tenantConfig.sasl || {
        mechanism: 'plain',
        username: tenantConfig.username,
        password: tenantConfig.password
      },
      connectionTimeout: 3000,
      authenticationTimeout: 1000,
      reauthenticationThreshold: 10000
    };
  }

  async executeTenantOperation<T>(
    tenantId: string,
    operation: (kafka: Kafka) => Promise<T>
  ): Promise<T> {
    const kafka = await this.getTenantKafka(tenantId);
    return await operation(kafka);
  }

  // Cluster provisioning
  async provisionTenantKafkaCluster(
    tenantId: string,
    configuration: TenantKafkaClusterConfig
  ): Promise<void> {
    // This would typically involve infrastructure provisioning
    const config = {
      clusterId: \`tenant-\${tenantId}-kafka\`,
      brokers: configuration.brokerCount || 3,
      partitions: configuration.defaultPartitions || 6,
      replicationFactor: configuration.replicationFactor || 2,
      storage: configuration.storage || '100GB',
      retentionPolicy: configuration.retentionPolicy || '7d'
    };

    await this.configService.storeTenantKafkaConfig(tenantId, config);
    
    // Initialize standard topics
    await this.initializeTenantTopics(tenantId);
  }

  private async initializeTenantTopics(tenantId: string): Promise<void> {
    const kafka = await this.getTenantKafka(tenantId);
    const admin = kafka.admin();
    await admin.connect();

    try {
      // Standard topics for this tenant
      const topics = [
        {
          topic: 'banking-events',
          numPartitions: 6,
          replicationFactor: 2
        },
        {
          topic: 'banking-commands',
          numPartitions: 3,
          replicationFactor: 2
        },
        {
          topic: 'integration-events',
          numPartitions: 3,
          replicationFactor: 2
        },
        {
          topic: 'dead-letter-queue',
          numPartitions: 1,
          replicationFactor: 2,
          configEntries: [
            { name: 'retention.ms', value: '2592000000' } // 30 days
          ]
        }
      ];

      await admin.createTopics({ topics });
    } finally {
      await admin.disconnect();
    }
  }

  // Cluster monitoring
  async getClusterHealth(tenantId: string): Promise<ClusterHealthReport> {
    return await this.executeTenantOperation(tenantId, async (kafka) => {
      const admin = kafka.admin();
      await admin.connect();

      try {
        const metadata = await admin.fetchTopicMetadata();
        const brokers = metadata.brokers;
        
        return {
          tenantId,
          brokerCount: brokers.length,
          onlineBrokers: brokers.filter(b => b.host).length,
          totalTopics: metadata.topics.length,
          totalPartitions: metadata.topics.reduce((sum, topic) => 
            sum + topic.partitions.length, 0),
          health: 'healthy', // Would implement actual health checks
          lastChecked: new Date()
        };
      } finally {
        await admin.disconnect();
      }
    });
  }
}

// Simplified tenant operations (no prefixing needed)
@Injectable()
export class DedicatedClusterKafkaService {
  constructor(private clusterManager: TenantKafkaClusterManager) {}

  async publishEvent(
    tenantId: string,
    topic: string,
    event: any,
    options?: PublishOptions
  ): Promise<RecordMetadata[]> {
    return await this.clusterManager.executeTenantOperation(tenantId, async (kafka) => {
      const producer = kafka.producer();
      await producer.connect();

      try {
        return await producer.send({
          topic, // Simple topic names - no tenant prefixing needed
          messages: [{
            key: options?.key || event.aggregateId,
            value: JSON.stringify(event),
            headers: {
              'event-type': event.eventType,
              'correlation-id': options?.correlationId || ''
            }
          }]
        });
      } finally {
        await producer.disconnect();
      }
    });
  }

  async subscribeToEvents(
    tenantId: string,
    topics: string[],
    consumerGroup: string,
    handler: EventHandler
  ): Promise<void> {
    await this.clusterManager.executeTenantOperation(tenantId, async (kafka) => {
      const consumer = kafka.consumer({ groupId: consumerGroup });
      await consumer.connect();
      await consumer.subscribe({ topics });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const event = JSON.parse(message.value?.toString() || '{}');
          await handler.handle(event, { topic, partition, offset: message.offset });
        }
      });
    });
  }

  // Cluster-level operations
  async getTopicList(tenantId: string): Promise<string[]> {
    return await this.clusterManager.executeTenantOperation(tenantId, async (kafka) => {
      const admin = kafka.admin();
      await admin.connect();

      try {
        const metadata = await admin.fetchTopicMetadata();
        return metadata.topics.map(topic => topic.name);
      } finally {
        await admin.disconnect();
      }
    });
  }

  async createTopic(
    tenantId: string,
    topicConfig: TopicConfig
  ): Promise<void> {
    await this.clusterManager.executeTenantOperation(tenantId, async (kafka) => {
      const admin = kafka.admin();
      await admin.connect();

      try {
        await admin.createTopics({
          topics: [topicConfig]
        });
      } finally {
        await admin.disconnect();
      }
    });
  }
}

interface TenantKafkaClusterConfig {
  brokerCount?: number;
  defaultPartitions?: number;
  replicationFactor?: number;
  storage?: string;
  retentionPolicy?: string;
}

interface ClusterHealthReport {
  tenantId: string;
  brokerCount: number;
  onlineBrokers: number;
  totalTopics: number;
  totalPartitions: number;
  health: 'healthy' | 'warning' | 'critical';
  lastChecked: Date;
}

interface TopicConfig {
  topic: string;
  numPartitions: number;
  replicationFactor: number;
  configEntries?: Array<{ name: string; value: string }>;
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Maximum Isolation**: Complete cluster separation
- **✅ Independent Scaling**: Per-tenant cluster scaling
- **✅ Custom Configuration**: Tenant-specific Kafka settings
- **✅ Compliance**: Meets strictest data isolation requirements
- **✅ Network Isolation**: Complete network-level separation

**Ideal For:**
- Enterprise clients requiring dedicated infrastructure
- Highly regulated industries
- Tenants with massive message volumes
- Geographic data residency compliance
- White-label solutions with complete isolation

---

## 🛠️ Implementation Guidelines

### **Strategy Selection Framework**
\`\`\`typescript
interface KafkaTenantRequirements {
  messageVolume: 'low' | 'medium' | 'high' | 'massive';
  isolationLevel: 'basic' | 'medium' | 'high' | 'maximum';
  complianceNeeds: boolean;
  crossTenantCommunication: boolean;
  latencyRequirements: 'standard' | 'low' | 'ultra-low';
  budget: 'cost-effective' | 'moderate' | 'premium';
}

@Injectable()
export class KafkaStrategySelector {
  selectOptimalStrategy(requirements: KafkaTenantRequirements): KafkaMultiTenancyStrategy {
    // Maximum isolation requirements
    if (requirements.isolationLevel === 'maximum' || requirements.complianceNeeds) {
      return 'cluster-per-tenant';
    }
    
    // High isolation with processing separation
    if (requirements.isolationLevel === 'high') {
      return 'consumer-group-strategy';
    }
    
    // High throughput with ordering requirements
    if (requirements.messageVolume === 'high' || requirements.latencyRequirements === 'ultra-low') {
      return 'partition-strategy';
    }
    
    // Default: Most flexible option
    return 'topic-prefixing';
  }
}

type KafkaMultiTenancyStrategy = 
  | 'topic-prefixing' 
  | 'partition-strategy' 
  | 'consumer-group-strategy' 
  | 'cluster-per-tenant';
\`\`\`

---

## 📊 Strategy Comparison Matrix

| Aspect | Topic Prefixing | Partition Strategy | Consumer Groups | Cluster-per-Tenant |
|--------|----------------|-------------------|-----------------|-------------------|
| **Isolation Level** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Throughput** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Message Ordering** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Operational Complexity** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cost Efficiency** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Monitoring** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

*💡 **Recommendation**: Start with topic prefixing for simplicity, use partition strategy for high-throughput scenarios, implement consumer groups for processing isolation, and reserve cluster-per-tenant for enterprise clients with strict compliance requirements.*

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

    SwaggerModule.setup('api/docs/multi-tenancy/kafka', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/multi-tenancy/kafka`;
  }
}
