# Doppler Project Structure Design

> **Phase 1.2 Deliverable**: Project architecture for gs-scaffold Doppler integration  
> **Owner**: Lead Developer  
> **Date**: August 15, 2025

---

## 📊 Doppler Project Mapping Strategy

### Project Architecture Overview

Based on the analysis of the gs-scaffold application, we'll implement a **unified project approach** for the initial migration, with the option to split into microservices as the architecture evolves.

### Primary Project Structure

```
Doppler Organization: gs-scaffold
│
├── 📁 gs-scaffold-api (Primary Project)
│   ├── 🌍 dev (Development environment)
│   ├── 🌍 staging (Staging environment)
│   └── 🌍 prod (Production environment)
│
├── 📁 gs-scaffold-shared (Shared Infrastructure)
│   ├── 🌍 dev
│   ├── 🌍 staging
│   └── 🌍 prod
│
└── 📁 gs-scaffold-contexts (Future: Context-specific configs)
    ├── 🌍 dev
    ├── 🌍 staging
    └── 🌍 prod
```

### Rationale for Unified Approach

1. **Current State**: Monolithic NestJS application with modular contexts
2. **Simplified Management**: Single project reduces token management complexity
3. **Gradual Migration**: Allows for smooth transition without architectural changes
4. **Future Flexibility**: Easy to split into separate projects as services become independent

---

## 🌍 Environment Naming Conventions

### Standard Environment Names

- **`dev`** - Development environment (local + shared dev)
- **`staging`** - Pre-production testing environment
- **`prod`** - Production environment

### Personal Development Environments

For individual developer isolation:

- **`dev_<username>`** - Personal development configs
- **`dev_feature_<branch>`** - Feature branch specific configs (optional)

### Environment Hierarchy

```
prod (highest security)
  ↑
staging (moderate security)
  ↑
dev (development baseline)
  ↑
dev_personal (individual developer)
```

---

## 🔑 Service Token Architecture

### Token Types & Scope

#### 1. Project Tokens (Read-Only)

```
gs-scaffold-api:dev:readonly
gs-scaffold-api:staging:readonly
gs-scaffold-api:prod:readonly
```

#### 2. Service Tokens (Full Access)

```
gs-scaffold-api:dev:service
gs-scaffold-api:staging:service
gs-scaffold-api:prod:service
```

#### 3. CI/CD Tokens (Environment-Specific)

```
gs-scaffold-api:dev:ci
gs-scaffold-api:staging:ci
gs-scaffold-api:prod:ci
```

### Token Usage Matrix

| Environment | Local Dev     | CI/CD         | Production Deploy | Monitoring    |
| ----------- | ------------- | ------------- | ----------------- | ------------- |
| **dev**     | Project Token | Service Token | Service Token     | Project Token |
| **staging** | Project Token | Service Token | Service Token     | Project Token |
| **prod**    | ❌ No Access  | Service Token | Service Token     | Project Token |

### Token Security Levels

| Token Type   | Expiry   | Rotation  | Access Level         |
| ------------ | -------- | --------- | -------------------- |
| Personal Dev | 30 days  | Manual    | dev environment only |
| CI/CD        | 90 days  | Automated | Build/test/deploy    |
| Production   | 90 days  | Automated | Production secrets   |
| Monitoring   | 180 days | Quarterly | Read-only access     |

---

## 📋 Secret Naming Standards

### Naming Convention: `DOMAIN_COMPONENT_PURPOSE`

#### Core Infrastructure Secrets

```bash
# Database
DB_CONNECTION_STRING         # Primary database URL
DB_READ_CONNECTION_STRING    # Read replica connection
DB_POOL_MIN                  # Connection pool minimum
DB_POOL_MAX                  # Connection pool maximum

# Redis
REDIS_CONNECTION_STRING      # Primary Redis URL
REDIS_PROJECTIONS_URL        # Projections Redis instance
REDIS_CACHE_URL             # Cache Redis instance
REDIS_KEY_PREFIX            # Environment-specific key prefix

# EventStore
ESDB_CONNECTION_STRING       # EventStore connection
ESDB_DISCOVERY_URL          # EventStore discovery endpoint
ESDB_TLS_VERIFY_CERTS       # TLS certificate verification
```

#### Authentication & Authorization

```bash
# Keycloak
KEYCLOAK_URL                 # Keycloak base URL
KEYCLOAK_REALM              # Keycloak realm name
KEYCLOAK_CLIENT_ID          # OAuth client ID
KEYCLOAK_CLIENT_SECRET      # OAuth client secret

# JWT Configuration
JWT_AUDIENCE                # JWT audience claim
JWKS_CACHE_MAX_AGE         # JWKS cache duration
JWKS_REQUESTS_PER_MINUTE   # Rate limiting
JWKS_TIMEOUT_MS            # Request timeout

# OPA (Open Policy Agent)
OPA_URL                     # OPA service URL
OPA_TIMEOUT_MS             # OPA request timeout
OPA_DECISION_LOGS          # Enable decision logging
```

#### Application Configuration

```bash
# Core Application
APP_NAME                    # Application identifier
APP_VERSION                # Application version
NODE_ENV                   # Environment type
PORT                       # HTTP server port
PROTOCOL                   # HTTP/HTTPS protocol

# Logging & Monitoring
LOG_LEVEL                  # Logging level
LOG_SINK                   # Log destination
PRETTY_LOGS               # Pretty printing flag
LOKI_URL                  # Loki endpoint
LOKI_BASIC_AUTH          # Loki authentication

# External Services
PUBLIC_API_URL            # Public API endpoint
STAGING_API_URL          # Staging environment URL
CORS_ALLOWED_ORIGINS     # CORS configuration
CORS_ALLOW_CREDENTIALS   # CORS credentials flag
```

#### Context-Specific Secrets (Future)

```bash
# User Context
USER_ENCRYPTION_KEY         # User data encryption
USER_PASSWORD_SALT         # Password hashing salt

# Order Context
ORDER_PAYMENT_API_KEY      # Payment gateway API key
ORDER_SHIPPING_API_KEY     # Shipping provider API key

# Product Context
PRODUCT_IMAGE_STORAGE_KEY  # Image storage credentials
PRODUCT_SEARCH_API_KEY     # Search service API key
```

### Secret Classification

#### 🔴 **HIGH RISK** (Require immediate rotation if compromised)

- `*_CLIENT_SECRET`
- `*_API_KEY`
- `*_PASSWORD`
- `*_PRIVATE_KEY`

#### 🟡 **MEDIUM RISK** (Require rotation within 24h)

- `*_CONNECTION_STRING`
- `*_URL` (with authentication)
- `*_TOKEN`

#### 🟢 **LOW RISK** (Configuration values)

- `*_TIMEOUT_MS`
- `*_POOL_*`
- `*_CACHE_*`
- `LOG_*`

---

## 🏗️ Implementation Phases

### Phase 1: Core Application (Week 3)

**Scope**: Main gs-scaffold-api project with essential secrets

**Secrets to Migrate**:

```bash
NODE_ENV
APP_NAME
APP_VERSION
PORT
DB_CONNECTION_STRING
REDIS_CONNECTION_STRING
ESDB_CONNECTION_STRING
KEYCLOAK_CLIENT_SECRET
JWT_AUDIENCE
OPA_URL
LOG_LEVEL
LOG_SINK
LOKI_URL
```

### Phase 2: Enhanced Configuration (Week 4)

**Scope**: Complete application configuration

**Additional Secrets**:

```bash
DB_POOL_MIN
DB_POOL_MAX
REDIS_PROJECTIONS_URL
REDIS_KEY_PREFIX
JWKS_CACHE_MAX_AGE
JWKS_REQUESTS_PER_MINUTE
OPA_TIMEOUT_MS
CORS_ALLOWED_ORIGINS
PUBLIC_API_URL
STAGING_API_URL
```

### Phase 3: Advanced Features (Week 5-6)

**Scope**: Context-specific and advanced configurations

**Future Secrets**:

```bash
USER_ENCRYPTION_KEY
ORDER_PAYMENT_API_KEY
PRODUCT_IMAGE_STORAGE_KEY
MONITORING_API_KEY
ALERTING_WEBHOOK_URL
```

---

## 🔄 Migration Strategy

### 1. Environment Preparation Order

1. **dev** → Test and validate all configurations
2. **staging** → Production-like testing
3. **prod** → Final production migration

### 2. Secret Import Process

```bash
# Export current .env to staging format
doppler secrets import \
  --project gs-scaffold-api \
  --config dev \
  --format env \
  .env.complete

# Validate imported secrets
doppler secrets download \
  --project gs-scaffold-api \
  --config dev \
  --format env | head -20
```

### 3. Validation Checklist

- [ ] All required secrets present
- [ ] Secret values properly formatted
- [ ] Environment-specific overrides applied
- [ ] No test/dummy values in staging/prod
- [ ] Service tokens have appropriate permissions

---

## 📈 Future Evolution Path

### Microservices Readiness

As contexts evolve into independent services:

```
Current: gs-scaffold-api (unified)
         ↓
Future:  gs-scaffold-user-service
         gs-scaffold-order-service
         gs-scaffold-product-service
         gs-scaffold-catalog-service
         gs-scaffold-shared-infrastructure
```

### Token Management Evolution

```
Current: Single service token per environment
         ↓
Future:  Per-service tokens with specific scopes
         Automated token rotation
         Service mesh integration
```

### Environment Evolution

```
Current: dev → staging → prod
         ↓
Future:  dev → staging → canary → prod
         Integration testing environments
         Performance testing environments
```

---

## 📊 Success Metrics

### Implementation Success

- [ ] All environments configured within 1 day
- [ ] Zero manual secret copying between environments
- [ ] Application starts successfully in all environments
- [ ] All team members can access development environment

### Security Success

- [ ] No secrets visible in git repositories
- [ ] Automated secret redaction in logs
- [ ] Service tokens have minimal required permissions
- [ ] Emergency rotation procedures documented

### Developer Experience Success

- [ ] Local development setup time < 15 minutes
- [ ] Clear error messages for missing/invalid secrets
- [ ] Seamless transition between environments
- [ ] Self-service secret access for developers

---

This project structure design provides a solid foundation for migrating gs-scaffold to Doppler while maintaining flexibility for future architectural evolution.
