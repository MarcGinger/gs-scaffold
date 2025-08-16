import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 🏗️ Architecture Documentation
 *
 * This module provides comprehensive documentation about our platform's
 * architecture philosophy, design patterns, and technical decisions.
 */
export class ArchitectureDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🏗️ Platform Architecture Documentation')
      .setDescription(
        `
# 🏗️ Platform Architecture Documentation

Welcome to our **Platform Architecture Documentation**. This guide explains our architectural philosophy, design patterns, and technical decisions that shape how we build and operate our systems.

---

## 🏛️ Architecture Philosophy

### 🎯 **Modular Monolith Design**
**Best of Both Worlds**: We use a **hybrid architecture** that combines the simplicity of monoliths with the scalability of microservices:

- **🏗️ Modular Monolith** for configuration and master data management
- **⚡ Microservices** for high-throughput transactional operations

Our platform follows **Domain-Driven Design (DDD)** principles with:
- **Clear bounded contexts** for each business domain
- **Isolated modules** that can evolve independently within the monolith
- **Strategic decomposition** to microservices for performance-critical operations
- **Comprehensive documentation** that reflects actual implementation
- **Single source of truth** for each domain's API contracts

#### **🏛️ Monolith Benefits (Configuration & Master Data)**
- **Simplified Operations**: Single deployment unit for reference data
- **ACID Transactions**: Strong consistency across related entities
- **Easier Development**: Shared data models and business logic
- **Lower Latency**: In-process communication for configuration lookups
- **Centralized Governance**: Unified access control and audit trails

#### **🚀 Microservices Benefits (High-Throughput Operations)**
- **Independent Scaling**: Scale transaction processing independently
- **Technology Diversity**: Choose optimal tech stack per service
- **Fault Isolation**: Failures don't cascade across the entire system
- **Team Autonomy**: Independent development and deployment cycles
- **Performance Optimization**: Purpose-built services for specific workloads

#### **🔄 Hybrid Integration Patterns**
- **Event-Driven Communication**: Async messaging between monolith and microservices
- **API Gateway**: Unified entry point with routing to appropriate services
- **Shared Data Strategy**: Reference data from monolith, transactional data in microservices
- **Eventual Consistency**: Accept temporary inconsistency for performance gains

### 📋 **Documentation Strategy**
- **Comprehensive Module Docs**: Complete business domain coverage
- **Navigation Tables**: Easy access to specific functionality
- **Domain-Driven Organization**: Aligned with business capabilities
- **Developer-Friendly**: Interactive examples and clear usage patterns

---

## 🎯 **Design Principles**

### 🔧 **Domain-Driven Design (DDD)**
Our architecture is built around **Domain-Driven Design** principles:

#### **🎯 Bounded Contexts**
- **Clear Domain Boundaries**: Each business domain has well-defined boundaries
- **Ubiquitous Language**: Domain experts and developers share common terminology
- **Context Mapping**: Explicit relationships between different bounded contexts
- **Anti-Corruption Layers**: Protect domain integrity when integrating with external systems

#### **🏗️ Tactical Patterns**
- **Aggregates**: Consistency boundaries for business transactions
- **Entities**: Objects with unique identity and lifecycle
- **Value Objects**: Immutable objects defined by their attributes
- **Domain Services**: Business logic that doesn't belong to specific entities
- **Domain Events**: Represent significant business occurrences

#### **📦 Strategic Patterns**
- **Shared Kernel**: Common models shared across bounded contexts
- **Customer/Supplier**: Dependencies between different contexts
- **Conformist**: Accepting upstream context's model
- **Open Host Service**: Public API for other contexts to consume

### ⚡ **Performance & Scalability**

#### **🔄 Caching Strategy**
- **Redis Integration**: Distributed caching for frequently accessed data
- **Cache Aside Pattern**: Application manages cache population and invalidation
- **Write-Through Caching**: Updates both cache and database simultaneously
- **Cache Warming**: Proactive loading of frequently accessed data

#### **📊 Database Design**
- **Read Replicas**: Separate read and write workloads
- **Connection Pooling**: Efficient database connection management
- **Query Optimization**: Index strategies and query performance tuning
- **Data Partitioning**: Horizontal scaling for large datasets

#### **🚀 Async Processing**
- **Event Sourcing**: Capture all changes as immutable events
- **CQRS (Command Query Responsibility Segregation)**: Separate read and write models
- **Message Queues**: Asynchronous processing with Kafka/RabbitMQ
- **Eventual Consistency**: Accept temporary inconsistency for better performance

---

## 🔧 **Implementation Patterns**

### 📦 **Module Organization**
Our platform is organized into logical modules that align with business domains:

\`\`\`
src/
├── shared/                    # Cross-cutting concerns
│   ├── infrastructure/        # Technical infrastructure
│   ├── domain/               # Shared domain concepts
│   └── application/          # Shared application services
├── [business-domain]/        # Business domain modules
│   ├── domain/              # Domain layer (entities, aggregates, events)
│   ├── application/         # Application layer (use cases, handlers)
│   ├── infrastructure/      # Infrastructure layer (repositories, adapters)
│   └── interface/           # Interface layer (controllers, DTOs)
└── main.ts                  # Application bootstrap
\`\`\`

### 🎯 **Dependency Management**
- **Dependency Injection**: NestJS IoC container for loose coupling
- **Interface Segregation**: Small, focused interfaces
- **Dependency Inversion**: Depend on abstractions, not concretions
- **Single Responsibility**: Each class has one reason to change

### 📝 **Error Handling Strategy**
- **Domain Exceptions**: Business rule violations as typed exceptions
- **Infrastructure Exceptions**: Technical failures with proper categorization
- **Global Exception Filter**: Consistent error response formatting
- **Circuit Breaker Pattern**: Prevent cascading failures

### 🔍 **Monitoring & Observability**
- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Distributed Tracing**: Request flow tracking across services
- **Metrics Collection**: Business and technical metrics
- **Health Checks**: Comprehensive system health monitoring

---

## 🚀 **Deployment Architecture**

### 🐳 **Containerization**
- **Docker**: Application containerization for consistency
- **Multi-Stage Builds**: Optimized container images
- **Distroless Images**: Minimal attack surface
- **Health Checks**: Container-level health monitoring

### ☸️ **Orchestration**
- **Kubernetes**: Container orchestration and management
- **Horizontal Pod Autoscaling**: Automatic scaling based on metrics
- **Rolling Deployments**: Zero-downtime deployments
- **Service Mesh**: Traffic management and security

### 🔄 **CI/CD Pipeline**
- **Infrastructure as Code**: Terraform/Bicep for infrastructure management
- **GitOps**: Git-driven deployment workflows
- **Automated Testing**: Unit, integration, and end-to-end tests
- **Security Scanning**: Vulnerability assessment in pipeline

---

## 📊 **Data Architecture**

### 🗄️ **Event Sourcing & CQRS Architecture**

We use **EventStoreDB (ESDB)** as the source of truth to record all domain mutations (event sourcing). **Redis** is used for fast in-memory access via projections, while **PostgreSQL** (with TypeORM) provides persistent and query-optimized views, also built from projections. **Kafka** facilitates cross-silo communication and external system integration.

#### **🔍 Component Roles**

| Component | Role | Description |
|-----------|------|-------------|
| **EventStoreDB** | Source of Truth | Captures immutable domain events; the write model and source of truth |
| **Redis** | Fast Read Models | Serves cached read models, updated via projections for ultra-fast access |
| **PostgreSQL** | Query Layer | Used as a relational projection layer with TypeORM for querying/reporting |
| **Kafka** | Event Streaming | Enables decoupled communication between services and publishes events to external consumers or silos |

#### **🔁 Projection Architecture**
All reads (Redis, PostgreSQL) are derived from ESDB events through projection services (aka projectors or subscribers). This supports CQRS and event sourcing best practices:

- **Write Model**: Domain events persisted to EventStoreDB streams
- **Read Models**: Projections built from events into Redis and PostgreSQL  
- **Event Streaming**: Kafka publishes domain events across service boundaries
- **Eventual Consistency**: Read models are eventually consistent with the event store

#### **📊 Data Flow Overview**
\`\`\`
Domain Command → Aggregate → Domain Event → EventStoreDB
                                    ↓
                            Projection Services
                          ↙                    ↘
                    Redis Cache           PostgreSQL Views
                   (Ultra-fast)          (Rich Querying)
                                    ↓
                              Kafka Streams
                           (External Integration)
\`\`\`

### 🔄 **Data Flow Patterns**
- **Event-Driven Architecture**: Loose coupling through domain events
- **Saga Pattern**: Distributed transaction management
- **Outbox Pattern**: Reliable event publishing
- **Change Data Capture**: Real-time data synchronization

### 📈 **Analytics & Reporting**
- **Read Models**: Optimized views for reporting
- **Data Warehousing**: Historical data analysis
- **Real-Time Analytics**: Stream processing for immediate insights
- **Data Lake**: Raw data storage for future analysis

---

## 🔮 **Future Considerations**

### 🌐 **Cloud-Native Evolution**
- **Multi-Cloud Strategy**: Avoid vendor lock-in
- **Serverless Functions**: Event-driven compute for specific workloads
- **Edge Computing**: Bring computation closer to users
- **Global Distribution**: Multi-region deployments

### 🤖 **AI/ML Integration**
- **Model Serving**: Machine learning model deployment
- **Feature Stores**: Reusable feature engineering
- **A/B Testing**: Data-driven decision making
- **Recommendation Systems**: Personalized user experiences

### 📱 **API Evolution**
- **GraphQL**: Flexible query capabilities
- **gRPC**: High-performance service communication
- **WebSockets**: Real-time bidirectional communication
- **API Versioning**: Backward compatibility strategies

---

## 💡 **Getting Started with Architecture**

### 📚 **Essential Reading**
- **Domain-Driven Design** by Eric Evans
- **Building Microservices** by Sam Newman
- **Clean Architecture** by Robert Martin
- **Patterns of Enterprise Application Architecture** by Martin Fowler

### 🛠️ **Development Guidelines**
- Follow established patterns and conventions
- Write comprehensive tests for all layers
- Document architectural decisions (ADRs)
- Regular architecture reviews and refactoring

### 🎯 **Best Practices**
- **Fail Fast**: Detect and handle errors early
- **Idempotency**: Design operations to be safely retried
- **Backward Compatibility**: Maintain API contracts
- **Performance Testing**: Validate scalability assumptions

---

*💬 **Questions about Architecture?** Contact the platform architecture team for guidance on design decisions, patterns, and best practices.*

`,
      )
      .setVersion('1.0');

    // Add dynamic server configuration
    SwaggerConfigUtil.addServers(config, port);

    // Create document with empty include array - architecture documentation only
    const document = SwaggerModule.createDocument(app, config.build(), {
      include: [], // Architecture documentation only - no actual endpoints
      deepScanRoutes: false,
      ignoreGlobalPrefix: false,
    });

    // Clear any accidentally included paths and schemas
    document.paths = {};
    document.components = document.components || {};
    document.components.schemas = {
      // Only include architecture-related schemas if needed
      ArchitectureDecision: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'ADR-001' },
          title: {
            type: 'string',
            example: 'Use Modular Monolith for Configuration',
          },
          status: {
            type: 'string',
            enum: ['proposed', 'accepted', 'deprecated'],
            example: 'accepted',
          },
          date: { type: 'string', format: 'date', example: '2025-01-15' },
          context: {
            type: 'string',
            example: 'Need to manage configuration and master data efficiently',
          },
          decision: {
            type: 'string',
            example:
              'Adopt modular monolith pattern for configuration services',
          },
          consequences: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'status', 'date', 'context', 'decision'],
      },
    };

    SwaggerModule.setup('api/docs/architecture', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/architecture`;
  }
}
