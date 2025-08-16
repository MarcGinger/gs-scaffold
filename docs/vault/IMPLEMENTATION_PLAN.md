# Doppler Secrets Management Implementation Plan

> **Project**: gs-scaffold Microservices Architecture  
> **Goal**: Migrate from `.env` files to Doppler-first secrets management  
> **Timeline**: 6 weeks (3 phases)  
> **Team Size**: 2-3 developers + 1 DevOps engineer

---

## 📋 Executive Summary

This implementation plan outlines the migration of the gs-scaffold application from traditional `.env` file-based configuration to a production-ready Doppler secrets management system. The plan is structured in 3 phases to minimize risk and ensure smooth transition.

**Current State:**

- NestJS monolith with modular architecture
- Multiple contexts: order, user, catalog, product
- Shared infrastructure: EventStore, Redis, TypeORM, Keycloak
- Development setup using local `.env` files

**Target State:**

- All secrets managed via Doppler
- Environment-specific configurations (dev/staging/prod)
- Zero secrets in git repositories
- Automated secret rotation and monitoring
- Production-ready security posture

---

## 🎯 Phase 1: Foundation & Core Infrastructure (Weeks 1-2)

### Week 1: Project Setup & Infrastructure Preparation

#### 1.1 Doppler Organization Setup

**Owner**: DevOps Engineer  
**Duration**: 2 days

**Tasks:**

- [ ] Create Doppler organization account
- [ ] Set up billing and user management
- [ ] Configure RBAC roles and permissions
- [x] Install Doppler CLI on development machines

**Deliverables:**

- Doppler organization with proper RBAC
- CLI access for all team members
- Initial project structure plan

#### 1.2 Project Structure Design

**Owner**: Lead Developer  
**Duration**: 1 day

**Tasks:**

- [x] Define Doppler project mapping strategy
- [x] Design environment naming conventions
- [x] Plan service token architecture
- [x] Document secret naming standards

**Deliverables:**

- [x] Project architecture document
- [x] Naming convention guide
- [x] Service token matrix

#### 1.3 Current State Audit ✅ **COMPLETED**

**Owner**: Full Team  
**Duration**: 2 days  
**Completed**: August 15, 2025

**Tasks:**

- [x] Inventory all existing `.env` files
- [x] Document current secrets and their usage
- [x] Identify high-risk credentials requiring immediate rotation
- [x] Map secrets to services and contexts

**Deliverables:**

- [x] Complete secrets inventory ([PHASE_1_3_CURRENT_STATE_AUDIT.md](./PHASE_1_3_CURRENT_STATE_AUDIT.md))
- [x] Risk assessment matrix (32+ environment variables classified)
- [x] Service dependency mapping ([SECRET_MIGRATION_MAPPING.md](./SECRET_MIGRATION_MAPPING.md))
- [x] Migration priority matrix (P0-P4 classification)

### Week 2: Core Configuration Framework

#### 2.1 Configuration Schema Implementation ✅ **COMPLETED**

**Owner**: Senior Developer  
**Duration**: 3 days  
**Completed**: August 15, 2025

**Tasks:**

- [x] Install and configure Zod validation library
- [x] Create base configuration schema
- [x] Implement schema validation in bootstrap
- [x] Add configuration testing utilities

**Deliverables:**

- [x] Complete Zod schema with 8 configuration domains ([app-config.schema.ts](../src/shared/config/app-config.schema.ts))
- [x] Dual-source configuration loader with Doppler support ([config-loader.ts](../src/shared/config/config-loader.ts))
- [x] Enhanced validation framework ([config-validator.ts](../src/shared/config/config-validator.ts))
- [x] Comprehensive test suite ([config-system.test.ts](../src/shared/config/__tests__/config-system.test.ts))
- [x] Legacy compatibility mapping (32+ variable mappings)
- [x] Production security validation and environment-specific rules

**Implementation Details:**

```typescript
// src/shared/config/base-config.schema.ts
import { z } from 'zod';

export const BaseConfigSchema = z.object({
  SERVICE_NAME: z.string().min(1),
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().int().min(1000).max(65535),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_REDACT: z.string().optional(),
});

// src/shared/config/app-config.schema.ts
export const AppConfigSchema = BaseConfigSchema.extend({
  // EventStore
  ESDB_CONNECTION_STRING: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Database
  TYPEORM_URL: z.string().url(),

  // Authentication
  KEYCLOAK_ISSUER_URL: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(8),

  // Authorization
  OPA_URL: z.string().url(),
});
```

**Deliverables:**

- Configuration validation framework
- Schema for main application
- Unit tests for configuration validation

#### 2.2 Secret Redaction & Logging ⚠️ **IN PROGRESS**

**Owner**: Mid-level Developer  
**Duration**: 2 days  
**Status**: Critical security requirement - needs immediate attention

**Tasks:**

- [ ] Configure pino with secret redaction
- [ ] Implement centralized logging configuration
- [ ] Add tests to verify no secrets leak to logs
- [ ] Create logging utility functions

**Implementation Details:**

```typescript
// src/shared/logging/logger.config.ts
import { createLogger } from '@nestjs/common';
import pino from 'pino';

const DEFAULT_REDACT_KEYS = [
  '*_SECRET',
  '*_TOKEN',
  '*_PASSWORD',
  'AZURE_*_KEY',
  'AZURE_STORAGE_CONNECTION_STRING',
  'KEYCLOAK_CLIENT_SECRET',
  'TYPEORM_PASSWORD',
  'REDIS_PASSWORD',
];

export const createAppLogger = (config: AppConfig) => {
  const redactKeys = config.LOG_REDACT
    ? [...DEFAULT_REDACT_KEYS, ...config.LOG_REDACT.split(',')]
    : DEFAULT_REDACT_KEYS;

  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: redactKeys,
      censor: '[REDACTED]',
    },
  });
};
```

**Deliverables:**

- Centralized logging configuration
- Secret redaction implementation
- Automated tests for log security

---

## 🔧 Phase 2: Service Integration & Migration (Weeks 3-4)

### Week 3: Core Service Migration

#### 3.1 Main Application Doppler Integration ⚠️ **PARTIALLY COMPLETE**

**Owner**: Lead Developer  
**Duration**: 2 days  
**Status**: Core migration complete, staging/prod environments needed

**Tasks:**

- [x] Create `gs-scaffold-api` Doppler project
- [x] Set up dev configuration
- [x] Migrate existing secrets to Doppler (25+ variables)
- [ ] Set up staging/prod configurations
- [ ] Update application bootstrap process
- [ ] Validate functionality across all environments

**Implementation Details:**

```typescript
// src/main.ts
import { validateConfig } from './shared/config/app-config.schema';
import { createAppLogger } from './shared/logging/logger.config';

async function bootstrap() {
  // Validate configuration before anything else
  const config = validateConfig();

  // Setup logging with secret redaction
  const logger = createAppLogger(config);

  logger.info(`🚀 Starting ${config.SERVICE_NAME} in ${config.NODE_ENV} mode`);

  const app = await NestFactory.create(AppModule, {
    logger: logger,
  });

  // Rest of bootstrap logic...
}
```

**Deliverables:**

- Doppler project for main application
- Migrated secrets and validated functionality
- Updated bootstrap process

#### 3.2 Local Development Setup

**Owner**: All Developers  
**Duration**: 1 day

**Tasks:**

- [ ] Create `.env.example` template
- [ ] Update npm scripts for Doppler integration
- [ ] Test local development workflows
- [ ] Document developer onboarding process

**Implementation Details:**

```json
// package.json script updates
{
  "scripts": {
    "dev": "doppler run -- nest start --watch",
    "dev:local": "nest start --watch",
    "config:validate": "ts-node -r tsconfig-paths/register src/shared/config/validate-config.ts",
    "doppler:setup": "doppler setup --no-interactive"
  }
}
```

**Deliverables:**

- Updated development scripts
- `.env.example` template
- Developer onboarding guide

#### 3.3 Health Checks & Monitoring

**Owner**: DevOps Engineer  
**Duration**: 2 days

**Tasks:**

- [ ] Implement secrets health indicator
- [ ] Add configuration validation endpoint
- [ ] Set up basic monitoring for secret loading
- [ ] Create alerting rules

**Implementation Details:**

```typescript
// src/health/secrets.health.ts
@Injectable()
export class SecretsHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const requiredSecrets = [
      'KEYCLOAK_CLIENT_SECRET',
      'TYPEORM_URL',
      'REDIS_URL',
      'ESDB_CONNECTION_STRING',
    ];

    const missingSecrets = requiredSecrets.filter(
      (secret) => !process.env[secret],
    );

    const isHealthy = missingSecrets.length === 0;

    return this.getStatus(key, isHealthy, {
      missingSecrets: missingSecrets.length > 0 ? missingSecrets : undefined,
      loadedAt: new Date().toISOString(),
    });
  }
}
```

**Deliverables:**

- Health check endpoints
- Basic monitoring setup
- Alert configuration

### Week 4: Service Context Migration

#### 4.1 User Context Service Migration

**Owner**: Mid-level Developer  
**Duration**: 2 days

**Tasks:**

- [ ] Create configuration schema for user context
- [ ] Set up Doppler project for user service
- [ ] Migrate user-specific secrets
- [ ] Test user service functionality

#### 4.2 Order Context Service Migration

**Owner**: Junior Developer  
**Duration**: 2 days

**Tasks:**

- [ ] Create configuration schema for order context
- [ ] Set up Doppler project for order service
- [ ] Migrate order-specific secrets
- [ ] Test order service functionality

#### 4.3 Shared Infrastructure Update

**Owner**: Senior Developer  
**Duration**: 1 day

**Tasks:**

- [ ] Update shared database configuration
- [ ] Update EventStore connection management
- [ ] Update Redis connection configuration
- [ ] Test all shared infrastructure components

**Deliverables:**

- All service contexts migrated to Doppler
- Validated functionality across all services
- Updated shared infrastructure

---

## 🚀 Phase 3: Production Readiness & Advanced Features (Weeks 5-6)

### Week 5: Docker & CI/CD Integration

#### 5.1 Docker Integration Strategy

**Owner**: DevOps Engineer  
**Duration**: 2 days

**Tasks:**

- [ ] Implement Option A (runtime injection) for development
- [ ] Implement Option B (in-image CLI) for production
- [ ] Update docker-compose files
- [ ] Create production Dockerfile optimizations

**Implementation Details:**

```dockerfile
# Dockerfile.prod (Option B - in-image CLI)
FROM node:18-alpine AS doppler
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

FROM node:18-alpine AS production
COPY --from=doppler /usr/local/bin/doppler /usr/local/bin/doppler

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY doppler.yaml ./

EXPOSE 3000
CMD ["doppler", "run", "--", "node", "dist/main.js"]
```

**Deliverables:**

- Production-ready Docker configuration
- Updated compose files
- Docker build optimization

#### 5.2 GitHub Actions CI/CD Pipeline

**Owner**: DevOps Engineer  
**Duration**: 2 days

**Tasks:**

- [ ] Set up Doppler GitHub Action
- [ ] Configure service tokens in GitHub secrets
- [ ] Update build and test workflows
- [ ] Add deployment pipeline integration

**Implementation Details:**

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with secrets
        run: doppler run --project gs-scaffold-api --config dev -- npm test
        env:
          DOPPLER_TOKEN: ${{ secrets.API_DOPPLER_TOKEN_DEV }}

      - name: Validate configuration schemas
        run: doppler run --project gs-scaffold-api --config dev -- npm run config:validate
        env:
          DOPPLER_TOKEN: ${{ secrets.API_DOPPLER_TOKEN_DEV }}
```

**Deliverables:**

- Automated CI/CD pipeline
- Secret management in GitHub Actions
- Deployment automation

#### 5.3 Error Handling & Fallback Implementation

**Owner**: Senior Developer  
**Duration**: 1 day

**Tasks:**

- [ ] Implement graceful degradation patterns
- [ ] Add fallback configuration loading
- [ ] Create error recovery procedures
- [ ] Test failure scenarios

**Implementation Details:**

```typescript
// src/shared/config/config-loader.ts
export class ConfigLoader {
  static async loadConfiguration(): Promise<AppConfig> {
    try {
      // Primary: Load from Doppler-injected environment
      const config = AppConfigSchema.parse(process.env);
      logger.info('✅ Configuration loaded from Doppler');
      return config;
    } catch (error) {
      logger.warn('⚠️  Doppler configuration failed, attempting fallback');

      if (process.env.NODE_ENV === 'development') {
        return this.loadFallbackConfig();
      } else {
        logger.error(
          '❌ Production configuration failed - no fallback allowed',
        );
        process.exit(1);
      }
    }
  }

  private static loadFallbackConfig(): AppConfig {
    // Load from .env.local for development only
    require('dotenv').config({ path: '.env.local' });
    return AppConfigSchema.parse(process.env);
  }
}
```

**Deliverables:**

- Robust error handling
- Fallback mechanisms for development
- Comprehensive testing of failure scenarios

### Week 6: Security Hardening & Documentation

#### 6.1 Security Audit & Hardening

**Owner**: DevOps Engineer + Security Consultant  
**Duration**: 2 days

**Tasks:**

- [ ] Conduct security audit of Doppler setup
- [ ] Implement secret rotation procedures
- [ ] Set up audit logging and monitoring
- [ ] Create incident response procedures

**Deliverables:**

- Security audit report
- Rotation procedures
- Incident response runbook

#### 6.2 Advanced Monitoring & Alerting

**Owner**: DevOps Engineer  
**Duration**: 2 days

**Tasks:**

- [ ] Set up Prometheus metrics for secret loading
- [ ] Create Grafana dashboards
- [ ] Configure alerting rules
- [ ] Test monitoring and alerting

**Implementation Details:**

```typescript
// src/shared/metrics/secrets.metrics.ts
import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram } from 'prom-client';

@Injectable()
export class SecretsMetrics {
  private secretLoadingCounter = new Counter({
    name: 'secrets_loading_total',
    help: 'Total number of secret loading attempts',
    labelNames: ['service', 'status'],
    registers: [register],
  });

  private secretLoadingDuration = new Histogram({
    name: 'secrets_loading_duration_seconds',
    help: 'Duration of secret loading operations',
    labelNames: ['service'],
    registers: [register],
  });

  recordSecretLoading(service: string, success: boolean, duration: number) {
    this.secretLoadingCounter.inc({
      service,
      status: success ? 'success' : 'failure',
    });

    this.secretLoadingDuration.observe({ service }, duration);
  }
}
```

**Deliverables:**

- Production monitoring setup
- Grafana dashboards
- Alert configuration

#### 6.3 Documentation & Training

**Owner**: Lead Developer  
**Duration**: 1 day

**Tasks:**

- [ ] Create comprehensive documentation
- [ ] Record training videos
- [ ] Conduct team training sessions
- [ ] Create troubleshooting guides

**Deliverables:**

- Complete documentation suite
- Team training materials
- Troubleshooting guides

---

## 📊 Success Metrics & KPIs

### Technical Metrics

- **Secret Loading Success Rate**: >99.9%
- **Configuration Validation Failures**: <0.1%
- **Mean Time to Secret Rotation**: <30 minutes
- **Zero secrets in git repositories**: 100% compliance

### Operational Metrics

- **Developer Onboarding Time**: <2 hours (vs. current 4+ hours)
- **Deployment Failures due to Config**: <1% (vs. current 15%)
- **Security Incident Response Time**: <15 minutes
- **Environment Consistency**: 100% across dev/staging/prod

### Business Metrics

- **Compliance Audit Ready**: 100% (SOC2, GDPR)
- **Secret Rotation Automation**: 90% of secrets auto-rotated
- **Security Risk Reduction**: 80% reduction in secret-related risks

---

## 🚨 Risk Mitigation & Contingency Plans

### High-Risk Scenarios

#### 1. Doppler Service Outage

**Risk**: Complete loss of secret access  
**Mitigation**:

- Cached secrets with 24h validity in staging
- Emergency fallback procedures documented
- Alternative secret management system on standby

#### 2. Mass Secret Compromise

**Risk**: Multiple secrets leaked simultaneously  
**Mitigation**:

- Automated rotation scripts ready
- Emergency contact procedures
- Rollback to previous secret versions

#### 3. Team Knowledge Gap

**Risk**: Team unable to manage new system  
**Mitigation**:

- Comprehensive training program
- Documentation with step-by-step guides
- On-call expert support during transition

### Rollback Plan

- **Phase 1 Rollback**: Return to `.env` files (2 hours)
- **Phase 2 Rollback**: Service-by-service rollback (4 hours)
- **Phase 3 Rollback**: Full system rollback (8 hours)

---

## 📅 Detailed Timeline & Milestones

| Week | Phase      | Key Milestone          | Success Criteria                    |
| ---- | ---------- | ---------------------- | ----------------------------------- |
| 1    | Foundation | Doppler Setup Complete | All team members can access Doppler |
| 2    | Foundation | Config Framework Ready | Schema validation working locally   |
| 3    | Migration  | Core Service Migrated  | Main app running on Doppler         |
| 4    | Migration  | All Services Migrated  | All contexts using Doppler          |
| 5    | Production | CI/CD Integration      | Automated deployments working       |
| 6    | Production | Production Ready       | Full monitoring and security        |

### Go/No-Go Decision Points

**End of Week 2**: Configuration framework must be stable  
**End of Week 4**: All services must be successfully migrated  
**End of Week 5**: CI/CD pipeline must be fully functional

---

## 💰 Resource Requirements

### Human Resources

- **Lead Developer**: 6 weeks @ 40 hours/week = 240 hours
- **Senior Developer**: 4 weeks @ 40 hours/week = 160 hours
- **Mid-level Developer**: 4 weeks @ 40 hours/week = 160 hours
- **Junior Developer**: 2 weeks @ 40 hours/week = 80 hours
- **DevOps Engineer**: 6 weeks @ 30 hours/week = 180 hours

**Total**: 820 hours

### Technology Resources

- **Doppler Pro Plan**: $20/user/month × 5 users × 2 months = $200
- **Additional monitoring tools**: $500/month × 2 months = $1,000
- **Security audit consultant**: $5,000 (one-time)

**Total Budget**: ~$6,200

### Infrastructure

- No additional infrastructure costs (leveraging existing systems)
- Potential cost savings from improved automation: ~$2,000/month

---

## 🎯 Post-Implementation Roadmap

### Month 1 Post-Launch

- [ ] Monitor system stability and performance
- [ ] Gather team feedback and iterate
- [ ] Implement automated secret rotation
- [ ] Conduct security review

### Month 3 Post-Launch

- [ ] Evaluate additional Doppler features
- [ ] Implement advanced monitoring
- [ ] Scale to additional services/environments
- [ ] Conduct cost-benefit analysis

### Month 6 Post-Launch

- [ ] Full security audit and compliance review
- [ ] Optimize secret management workflows
- [ ] Plan next phase of infrastructure improvements
- [ ] Share learnings with broader organization

---

## 🤝 Team Responsibilities

### Lead Developer

- Overall technical leadership
- Architecture decisions
- Code review and quality assurance
- Team coordination

### DevOps Engineer

- Doppler platform management
- CI/CD pipeline implementation
- Security and compliance
- Monitoring and alerting

### Senior Developer

- Core framework implementation
- Complex service migrations
- Performance optimization
- Mentoring junior developers

### Mid-level Developers

- Service-specific implementations
- Testing and validation
- Documentation creation
- Bug fixes and improvements

### Junior Developer

- Simple service migrations
- Documentation updates
- Testing assistance
- Learning and knowledge transfer

---

This implementation plan provides a structured approach to migrating the gs-scaffold application to Doppler-based secrets management with clear timelines, responsibilities, and success criteria. The phased approach minimizes risk while ensuring comprehensive coverage of all technical and operational requirements.
