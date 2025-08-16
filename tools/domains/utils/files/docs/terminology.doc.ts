import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 🧠 Platform Terminology & Strategies Documentation
 *
 * This module provides comprehensive documentation for platform concepts,
 * multi-tenancy strategies, and implementation patterns.
 */
export class TerminologyDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🧠 Platform Terminology & Strategies')
      .setDescription(
        `
# 🧠 Platform Terminology & Strategies

This documentation covers the **core concepts**, **multi-tenancy strategies**, and **implementation patterns** used throughout the platform.

---

## 📚 Core Concepts

Understanding these fundamental concepts is essential for working effectively with the platform.

| Concept | Description | Implementation |
|---------|-------------|----------------|
| **🔀 Kafka** | Distributed event streaming platform for real-time data pipelines and streaming applications | Event sourcing, microservice communication, audit trails |
| **🗄️ SQL Schema** | Logical separation of database objects within PostgreSQL | Each bounded context gets its own schema (bank_product, core_slack) |
| **👥 Multi-Tenancy** | Single application instance serving multiple tenants with data isolation | Tenant-specific partitioning across all data stores |
| **📦 Bounded Context** | Strategic DDD pattern defining clear business domain boundaries | Independent deployable units with their own data models |
| **⚡ Event Sourcing** | Storing state changes as events rather than current state | EventStoreDB for audit trails and state reconstruction |
| **🎯 CQRS** | Command Query Responsibility Segregation pattern | Separate read and write models for optimal performance |
| **🏗️ Domain-Driven Design** | Strategic approach to software development focusing on business domains | Rich domain models, ubiquitous language, bounded contexts |
| **🔄 Event-Driven Architecture** | Loosely coupled architecture using events for communication | Asynchronous processing, eventual consistency, scalability |

---

##  Multi-Tenant Separation Strategies

Our platform supports multiple tenancy patterns depending on security, compliance, and scalability requirements. Each data store has dedicated documentation with comprehensive implementation strategies:

### **📚 Data Store Strategy Guides**

| Data Store | Strategy Documentation | Key Patterns | Best For |
|------------|----------------------|--------------|----------|
| **🗃️ PostgreSQL** | [PostgreSQL Multi-Tenancy](/api/docs/multi-tenancy/postgresql) | Schema-per-tenant, Row-Level Security, Database-per-tenant | Transactional data, compliance requirements |
| **🔴 Redis** | [Redis Multi-Tenancy](/api/docs/multi-tenancy/redis) | Key prefixing, Database selection, Namespace isolation | Caching, session storage, real-time data |
| **📊 EventStoreDB** | [EventStoreDB Multi-Tenancy](/api/docs/multi-tenancy/eventstore) | Stream prefixing, Category separation, Projection isolation | Event sourcing, audit trails, CQRS |
| **🔀 Kafka** | [Kafka Multi-Tenancy](/api/docs/multi-tenancy/kafka) | Topic prefixing, Partition strategy, Consumer groups | Event streaming, inter-service communication |

### **🎯 Quick Strategy Overview**

Each data store offers multiple isolation levels to match your specific requirements:

#### **🔒 Isolation Levels**
- **Basic**: Logical separation within shared infrastructure
- **Medium**: Enhanced separation with dedicated resources
- **High**: Strong isolation with tenant-specific configurations  
- **Maximum**: Complete physical separation per tenant

#### **⚖️ Strategy Selection Matrix**

| Requirement | PostgreSQL | Redis | EventStoreDB | Kafka |
|-------------|------------|-------|--------------|-------|
| **Cost Optimization** | Row-Level Security | Key Prefixing | Stream Prefixing | Topic Prefixing |
| **Balanced Approach** | Schema-per-Tenant | Namespace Isolation | Category Separation | Partition Strategy |
| **Maximum Security** | Database-per-Tenant | Instance-per-Tenant | Database-per-Tenant | Cluster-per-Tenant |
| **Complex Logic** | Custom RLS Policies | Advanced Scripting | Projection Isolation | Consumer Groups |

### **🚀 Implementation Recommendations**

**Start Simple, Scale Smartly:**
1. **Phase 1**: Begin with shared multi-tenancy (RLS, Key Prefixing, Stream Prefixing, Topic Prefixing)
2. **Phase 2**: Migrate high-value tenants to dedicated schemas/namespaces  
3. **Phase 3**: Provide enterprise-grade isolation with dedicated instances/clusters

**Compliance Considerations:**
- **Healthcare/Finance**: Use maximum isolation strategies
- **General SaaS**: Start with medium isolation, upgrade as needed
- **Development/Testing**: Basic isolation is often sufficient

---

## 🎯 Deployment Strategies Matrix

Choose the right strategy based on your requirements:

| Strategy | PostgreSQL | Redis | EventStoreDB | Kafka | Best For |
|----------|------------|-------|--------------|-------|----------|
| **🏢 Single Tenant** | Dedicated Database | Dedicated Instance | Dedicated Cluster | Dedicated Topics | Enterprise clients, compliance requirements |
| **🌐 Multi-Tenant Shared** | Schema/RLS | Key Prefixing | Stream Prefixing | Topic Prefixing | SaaS platforms, cost optimization |
| **⚖️ Hybrid** | Mix of strategies | Mix of strategies | Mix of strategies | Mix of strategies | Tiered service offerings |

---

## 🔒 Security Considerations

### **Data Isolation**
- **Encryption at Rest**: All data stores support encryption
- **Encryption in Transit**: TLS/SSL for all communications
- **Access Control**: Role-based access control (RBAC) per tenant

### **Audit & Compliance**
- **Event Sourcing**: Complete audit trail of all changes
- **Kafka Logging**: All events logged and retained
- **Database Auditing**: Row-level change tracking

### **Monitoring & Alerting**
- **Tenant-specific Metrics**: Isolated monitoring per tenant
- **Resource Usage Tracking**: Billing and capacity planning
- **Security Event Detection**: Anomaly detection per tenant

---

## 🚀 Performance Optimization

### **Caching Strategies**
- **Redis**: Application-level caching with tenant isolation
- **Database**: Query optimization with tenant-aware indexes
- **Event Store**: Projection caching for read models

### **Scaling Patterns**
- **Horizontal Scaling**: Add more instances per tenant tier
- **Vertical Scaling**: Increase resources for high-demand tenants
- **Data Partitioning**: Shard data across multiple instances

### **Resource Management**
- **Connection Pooling**: Tenant-aware connection management
- **Rate Limiting**: Per-tenant API rate limits
- **Queue Management**: Priority queuing for different tenant tiers

---

*💡 **Best Practices**: Start with shared multi-tenancy for cost efficiency, then migrate high-value tenants to dedicated resources as needed.*

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

    SwaggerModule.setup('api/docs/terminology', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/terminology`;
  }
}
