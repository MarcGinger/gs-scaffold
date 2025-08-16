import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 🗃️ PostgreSQL Multi-Tenancy Strategies Documentation
 *
 * This module provides comprehensive documentation for PostgreSQL-specific
 * multi-tenancy patterns and implementation strategies.
 */
export class OverviewPostgreSQLDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🗃️ PostgreSQL Multi-Tenancy Strategies')
      .setDescription(
        `
# 🗃️ PostgreSQL Multi-Tenancy Strategies

Comprehensive guide to implementing multi-tenancy patterns in PostgreSQL for scalable, secure, and compliant applications.

---

## 🎯 Strategy Overview

PostgreSQL offers multiple approaches to tenant isolation, each with distinct trade-offs for security, performance, and operational complexity.

| Strategy | Isolation Level | Operational Complexity | Cost Efficiency | Best For |
|----------|----------------|------------------------|-----------------|----------|
| **Schema-per-Tenant** | High | Medium | Medium | Enterprise clients, compliance requirements |
| **Row-Level Security (RLS)** | Medium | Low | High | SaaS platforms, many small tenants |
| **Database-per-Tenant** | Maximum | High | Low | Highly regulated industries, dedicated infrastructure |

---

## 🏢 Schema-per-Tenant Strategy

### **Implementation Pattern**
\`\`\`sql
-- Create tenant-specific schemas
CREATE SCHEMA tenant_123;
CREATE SCHEMA tenant_456;
CREATE SCHEMA tenant_789;

-- Deploy identical table structures per tenant
CREATE TABLE tenant_123.bank_products (
    id BIGSERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    product_type VARCHAR(100) NOT NULL,
    interest_rate DECIMAL(5,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant_456.bank_products (
    id BIGSERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    product_type VARCHAR(100) NOT NULL,
    interest_rate DECIMAL(5,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

### **Dynamic Schema Selection**
\`\`\`typescript
// TypeORM with dynamic schema selection
@Injectable()
export class TenantAwareRepository<T> {
  constructor(
    private dataSource: DataSource,
    private entityClass: EntityTarget<T>
  ) {}

  async findByTenant(tenantId: string, criteria: any): Promise<T[]> {
    const repository = this.dataSource
      .getRepository(this.entityClass)
      .createQueryBuilder()
      .from(\`tenant_\${tenantId}.\${this.getTableName()}\`, 'entity');
    
    return repository.where(criteria).getMany();
  }

  private getTableName(): string {
    return this.dataSource.getMetadata(this.entityClass).tableName;
  }
}
\`\`\`

### **Schema Migration Management**
\`\`\`typescript
// Automated schema deployment across tenants
@Injectable()
export class MultiTenantMigrationService {
  constructor(private dataSource: DataSource) {}

  async deployMigrationToAllTenants(migrationSql: string): Promise<void> {
    const tenantSchemas = await this.getTenantSchemas();
    
    for (const schema of tenantSchemas) {
      await this.dataSource.query(\`SET search_path TO \${schema}\`);
      await this.dataSource.query(migrationSql);
    }
    
    // Reset to default schema
    await this.dataSource.query('SET search_path TO public');
  }

  private async getTenantSchemas(): Promise<string[]> {
    const result = await this.dataSource.query(\`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%'
    \`);
    
    return result.map(row => row.schema_name);
  }
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Strong Isolation**: Complete separation of tenant data
- **✅ Easy Backup/Restore**: Per-tenant database operations
- **✅ Clear Data Ownership**: Obvious tenant boundaries
- **✅ Compliance Friendly**: Audit trails per tenant
- **✅ Independent Scaling**: Schema-level optimization

**Ideal For:**
- Enterprise clients requiring data isolation
- Compliance-heavy industries (finance, healthcare)
- Large tenants with significant data volumes
- Customers with specific data residency requirements

---

## 🔒 Row-Level Security (RLS) Strategy

### **Policy-Based Isolation**
\`\`\`sql
-- Enable RLS on tables
ALTER TABLE bank_products ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy
CREATE POLICY tenant_isolation ON bank_products
  USING (tenant_id = current_setting('app.current_tenant_id')::bigint);

-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_products TO app_user;

-- Set tenant context per session
SET app.current_tenant_id = '123';
\`\`\`

### **Application-Level Context Management**
\`\`\`typescript
// Tenant context middleware
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = this.extractTenantId(req);
    
    // Store tenant context for this request
    req['tenantId'] = tenantId;
    next();
  }

  private extractTenantId(req: Request): string {
    // Extract from JWT, header, subdomain, etc.
    return req.headers['x-tenant-id'] as string || 
           this.extractFromJWT(req.headers.authorization);
  }
}

// Tenant-aware repository base class
@Injectable()
export class TenantAwareBaseRepository<T> {
  constructor(
    private dataSource: DataSource,
    private entityClass: EntityTarget<T>
  ) {}

  async withTenantContext<R>(tenantId: string, operation: () => Promise<R>): Promise<R> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
      // Set tenant context for this session
      await queryRunner.query(\`SET app.current_tenant_id = '\${tenantId}'\`);
      
      // Execute operation within tenant context
      return await operation();
    } finally {
      await queryRunner.release();
    }
  }
}
\`\`\`

### **Advanced RLS Patterns**
\`\`\`sql
-- Multi-level tenant hierarchy support
CREATE POLICY hierarchical_tenant_access ON bank_products
  USING (
    tenant_id = current_setting('app.current_tenant_id')::bigint
    OR 
    parent_tenant_id = current_setting('app.current_tenant_id')::bigint
  );

-- Time-based access policies
CREATE POLICY temporal_access ON audit_logs
  USING (
    tenant_id = current_setting('app.current_tenant_id')::bigint
    AND created_at >= current_setting('app.access_start_date')::timestamp
    AND created_at <= current_setting('app.access_end_date')::timestamp
  );

-- Role-based tenant access
CREATE POLICY role_based_tenant_access ON sensitive_data
  USING (
    tenant_id = current_setting('app.current_tenant_id')::bigint
    AND current_setting('app.user_role') IN ('admin', 'compliance_officer')
  );
\`\`\`

### **Benefits & Use Cases**
- **✅ Cost Effective**: Single schema, shared infrastructure
- **✅ Simple Management**: Unified schema updates
- **✅ Resource Efficient**: Optimal resource utilization
- **✅ Fast Onboarding**: No schema creation per tenant
- **✅ Cross-Tenant Analytics**: Aggregated reporting possible

**Ideal For:**
- SaaS platforms with many small tenants
- Cost-sensitive deployments
- Rapid tenant onboarding requirements
- Applications with frequent schema changes

---

## 🏗️ Database-per-Tenant Strategy

### **Complete Isolation Implementation**
\`\`\`sql
-- Create dedicated databases per tenant
CREATE DATABASE tenant_123_banking_db
  WITH OWNER = tenant_123_user
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.utf8'
  LC_CTYPE = 'en_US.utf8'
  TEMPLATE = template_banking_db;

CREATE DATABASE tenant_456_banking_db
  WITH OWNER = tenant_456_user
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.utf8'
  LC_CTYPE = 'en_US.utf8'
  TEMPLATE = template_banking_db;
\`\`\`

### **Dynamic Connection Management**
\`\`\`typescript
// Multi-database connection manager
@Injectable()
export class TenantDatabaseManager {
  private connectionCache = new Map<string, DataSource>();

  async getTenantDataSource(tenantId: string): Promise<DataSource> {
    if (this.connectionCache.has(tenantId)) {
      return this.connectionCache.get(tenantId)!;
    }

    const dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      username: \`tenant_\${tenantId}_user\`,
      password: await this.getTenantPassword(tenantId),
      database: \`tenant_\${tenantId}_banking_db\`,
      entities: [/* tenant entities */],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development'
    });

    await dataSource.initialize();
    this.connectionCache.set(tenantId, dataSource);
    
    return dataSource;
  }

  async executeTenantOperation<T>(
    tenantId: string, 
    operation: (dataSource: DataSource) => Promise<T>
  ): Promise<T> {
    const dataSource = await this.getTenantDataSource(tenantId);
    return await operation(dataSource);
  }

  private async getTenantPassword(tenantId: string): Promise<string> {
    // Retrieve from secure configuration service
    return this.configService.getTenantDbPassword(tenantId);
  }
}
\`\`\`

### **Automated Database Provisioning**
\`\`\`typescript
// Tenant provisioning service
@Injectable()
export class TenantProvisioningService {
  constructor(
    private masterDataSource: DataSource,
    private tenantManager: TenantDatabaseManager
  ) {}

  async provisionNewTenant(tenantId: string, configuration: TenantConfig): Promise<void> {
    const dbName = \`tenant_\${tenantId}_banking_db\`;
    const username = \`tenant_\${tenantId}_user\`;
    const password = this.generateSecurePassword();

    // Create database and user
    await this.masterDataSource.query(\`
      CREATE USER \${username} WITH PASSWORD '\${password}';
      CREATE DATABASE \${dbName} 
        WITH OWNER = \${username} 
        TEMPLATE = template_banking_db;
      GRANT ALL PRIVILEGES ON DATABASE \${dbName} TO \${username};
    \`);

    // Store tenant credentials securely
    await this.configService.storeTenantCredentials(tenantId, {
      database: dbName,
      username: username,
      password: password
    });

    // Run tenant-specific initialization
    const tenantDataSource = await this.tenantManager.getTenantDataSource(tenantId);
    await this.initializeTenantData(tenantDataSource, configuration);
  }

  private async initializeTenantData(
    dataSource: DataSource, 
    config: TenantConfig
  ): Promise<void> {
    // Run tenant-specific setup scripts
    await dataSource.query('INSERT INTO tenant_settings ...');
    await dataSource.query('INSERT INTO default_products ...');
  }
}
\`\`\`

### **Benefits & Use Cases**
- **✅ Maximum Isolation**: Complete tenant separation
- **✅ Independent Scaling**: Per-tenant performance tuning
- **✅ Regulatory Compliance**: Meets strictest requirements
- **✅ Custom Configuration**: Tenant-specific database settings
- **✅ Disaster Recovery**: Independent backup strategies

**Ideal For:**
- Highly regulated industries (banking, healthcare)
- Enterprise contracts requiring dedicated infrastructure
- Tenants with specific performance requirements
- Geographic data residency compliance

---

## 🛠️ Implementation Guidelines

### **Schema Evolution Strategy**
\`\`\`typescript
// Version-aware migration system
interface MigrationContext {
  tenantId?: string;
  strategy: 'schema-per-tenant' | 'rls' | 'database-per-tenant';
  version: string;
}

@Injectable()
export class UnifiedMigrationService {
  async runMigration(context: MigrationContext, migration: Migration): Promise<void> {
    switch (context.strategy) {
      case 'schema-per-tenant':
        await this.runSchemaPerTenantMigration(context, migration);
        break;
      case 'rls':
        await this.runRLSMigration(context, migration);
        break;
      case 'database-per-tenant':
        await this.runDatabasePerTenantMigration(context, migration);
        break;
    }
  }

  private async runSchemaPerTenantMigration(
    context: MigrationContext, 
    migration: Migration
  ): Promise<void> {
    const tenantSchemas = await this.getTenantSchemas();
    
    for (const schema of tenantSchemas) {
      await this.dataSource.query(\`SET search_path TO \${schema}\`);
      await migration.up(this.dataSource.createQueryRunner());
    }
  }
}
\`\`\`

### **Performance Optimization**
\`\`\`sql
-- Tenant-aware indexing strategies
-- Schema-per-tenant: Standard indexes per schema
CREATE INDEX idx_tenant_123_products_type ON tenant_123.bank_products(product_type);
CREATE INDEX idx_tenant_123_products_created ON tenant_123.bank_products(created_at);

-- RLS: Composite indexes including tenant_id
CREATE INDEX idx_rls_products_tenant_type ON bank_products(tenant_id, product_type);
CREATE INDEX idx_rls_products_tenant_created ON bank_products(tenant_id, created_at);

-- Partitioning for large RLS tables
CREATE TABLE bank_products_partitioned (
    id BIGSERIAL,
    tenant_id BIGINT NOT NULL,
    product_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY HASH (tenant_id);

CREATE TABLE bank_products_p0 PARTITION OF bank_products_partitioned
    FOR VALUES WITH (modulus 4, remainder 0);
CREATE TABLE bank_products_p1 PARTITION OF bank_products_partitioned
    FOR VALUES WITH (modulus 4, remainder 1);
\`\`\`

### **Security Best Practices**
\`\`\`sql
-- Principle of least privilege
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA tenant_123 TO tenant_123_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tenant_123 TO tenant_123_app_role;

-- Audit logging
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (
        tenant_id,
        table_name,
        operation,
        old_values,
        new_values,
        user_id,
        timestamp
    ) VALUES (
        COALESCE(NEW.tenant_id, OLD.tenant_id),
        TG_TABLE_NAME,
        TG_OP,
        to_jsonb(OLD),
        to_jsonb(NEW),
        current_setting('app.user_id'),
        CURRENT_TIMESTAMP
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
\`\`\`

---

## 📊 Strategy Comparison Matrix

| Aspect | Schema-per-Tenant | Row-Level Security | Database-per-Tenant |
|--------|-------------------|-------------------|---------------------|
| **Data Isolation** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Operational Complexity** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cost Efficiency** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Compliance** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scalability** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

*💡 **Recommendation**: Start with RLS for cost efficiency, migrate to schema-per-tenant for growing tenants, and reserve database-per-tenant for enterprise clients with strict compliance requirements.*

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

    SwaggerModule.setup('api/docs/multi-tenancy/postgresql', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/multi-tenancy/postgresql`;
  }
}
