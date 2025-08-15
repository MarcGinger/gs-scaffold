# Doppler Naming Convention Guide

> **Phase 1.2 Deliverable**: Standardized naming conventions for gs-scaffold Doppler implementation  
> **Owner**: Lead Developer  
> **Date**: August 15, 2025

---

## 🎯 Overview

This guide establishes consistent naming conventions for Doppler projects, environments, secrets, and service tokens to ensure maintainability, security, and developer productivity.

---

## 📁 Project Naming Convention

### Format: `{company}-{application}-{service}`

#### Examples

```
gs-scaffold-api              # Main application
gs-scaffold-shared           # Shared infrastructure
gs-scaffold-user            # User context service (future)
gs-scaffold-order           # Order context service (future)
gs-scaffold-product         # Product context service (future)
```

#### Rules

- **Lowercase only**: No uppercase letters or special characters
- **Hyphen separated**: Use hyphens (-) to separate words
- **Descriptive**: Clearly indicates the service purpose
- **Consistent prefix**: All projects start with `gs-scaffold-`

---

## 🌍 Environment Naming Convention

### Standard Environments

```
dev         # Development (shared development environment)
staging     # Pre-production testing environment
prod        # Production environment
```

### Personal Development Environments

```
dev_john    # Personal development for user 'john'
dev_sarah   # Personal development for user 'sarah'
```

### Feature Branch Environments (Optional)

```
dev_feature_auth     # Feature branch: authentication
dev_feature_orders   # Feature branch: order management
```

#### Rules

- **Lowercase only**: No uppercase or special characters except underscore
- **Underscore for personal**: Use underscore for personal/feature environments
- **Short names**: Keep environment names concise
- **No spaces**: Never use spaces in environment names

---

## 🔑 Secret Naming Convention

### Format: `{DOMAIN}_{COMPONENT}_{PURPOSE}`

All secret names must be in **UPPER_SNAKE_CASE**.

### Core Infrastructure Secrets

#### Database Secrets

```
DB_CONNECTION_STRING         # Primary database connection
DB_READ_CONNECTION_STRING    # Read replica connection
DB_HOST                     # Database host
DB_PORT                     # Database port
DB_NAME                     # Database name
DB_USER                     # Database username
DB_PASSWORD                 # Database password
DB_SSL_MODE                 # SSL connection mode
DB_POOL_MIN                 # Connection pool minimum
DB_POOL_MAX                 # Connection pool maximum
DB_TIMEOUT_MS              # Connection timeout
```

#### Redis Secrets

```
REDIS_CONNECTION_STRING     # Primary Redis connection
REDIS_PROJECTIONS_URL      # Projections Redis instance
REDIS_CACHE_URL           # Cache Redis instance
REDIS_SESSION_URL         # Session Redis instance
REDIS_HOST                # Redis host
REDIS_PORT                # Redis port
REDIS_PASSWORD            # Redis password
REDIS_KEY_PREFIX          # Environment-specific key prefix
REDIS_TTL_DEFAULT         # Default TTL for keys
```

#### EventStore Secrets

```
ESDB_CONNECTION_STRING      # EventStore connection
ESDB_HOST                  # EventStore host
ESDB_PORT                  # EventStore port
ESDB_USERNAME              # EventStore username
ESDB_PASSWORD              # EventStore password
ESDB_TLS_VERIFY_CERTS      # TLS certificate verification
ESDB_DISCOVERY_URL         # EventStore discovery endpoint
```

### Authentication & Authorization Secrets

#### Keycloak Configuration

```
KEYCLOAK_URL               # Keycloak base URL
KEYCLOAK_REALM             # Keycloak realm name
KEYCLOAK_CLIENT_ID         # OAuth client ID
KEYCLOAK_CLIENT_SECRET     # OAuth client secret
KEYCLOAK_ADMIN_USERNAME    # Admin username
KEYCLOAK_ADMIN_PASSWORD    # Admin password
KEYCLOAK_PUBLIC_KEY        # Public key for verification
```

#### JWT Configuration

```
JWT_SECRET                 # JWT signing secret
JWT_AUDIENCE              # JWT audience claim
JWT_ISSUER                # JWT issuer claim
JWT_EXPIRY_TIME           # Token expiry duration
JWKS_URI                  # JWKS endpoint URL
JWKS_CACHE_MAX_AGE        # JWKS cache duration
JWKS_REQUESTS_PER_MINUTE  # Rate limiting
JWKS_TIMEOUT_MS           # Request timeout
```

#### OPA (Open Policy Agent)

```
OPA_URL                   # OPA service URL
OPA_TOKEN                 # OPA authentication token
OPA_TIMEOUT_MS            # OPA request timeout
OPA_DECISION_LOGS         # Enable decision logging
OPA_CIRCUIT_BREAKER_ENABLED # Circuit breaker flag
OPA_CIRCUIT_BREAKER_THRESHOLD # Failure threshold
```

### Application Configuration Secrets

#### Core Application

```
APP_NAME                  # Application identifier
APP_VERSION              # Application version
APP_DESCRIPTION          # Application description
NODE_ENV                 # Environment type
PORT                     # HTTP server port
HOST                     # Server host binding
PROTOCOL                 # HTTP/HTTPS protocol
PUBLIC_API_URL           # Public API endpoint
STAGING_API_URL          # Staging environment URL
```

#### Logging & Monitoring

```
LOG_LEVEL                # Logging level (debug|info|warn|error|fatal)
LOG_SINK                 # Log destination (stdout|console|loki|elasticsearch)
LOG_FORMAT               # Log format (json|text)
PRETTY_LOGS              # Pretty printing flag (true|false)
LOG_REDACT               # Comma-separated list of keys to redact

# Loki Configuration
LOKI_URL                 # Loki endpoint URL
LOKI_BASIC_AUTH          # Loki basic authentication (user:pass)
LOKI_TENANT_ID           # Loki tenant identifier
LOKI_BATCH_SIZE          # Log batch size
LOKI_TIMEOUT_MS          # Loki request timeout

# Elasticsearch Configuration
ES_NODE                  # Elasticsearch node URL
ES_INDEX                 # Elasticsearch index name
ES_USERNAME              # Elasticsearch username
ES_PASSWORD              # Elasticsearch password
```

#### Security & CORS

```
CORS_ALLOWED_ORIGINS     # Comma-separated allowed origins
CORS_ALLOW_CREDENTIALS   # Allow credentials (true|false)
CORS_ALLOWED_METHODS     # Allowed HTTP methods
CORS_ALLOWED_HEADERS     # Allowed headers
CORS_MAX_AGE             # Preflight cache duration

# Security Headers
SECURITY_HELMET_ENABLED  # Enable Helmet security headers
SECURITY_RATE_LIMIT      # Rate limiting configuration
SECURITY_CSP_ENABLED     # Content Security Policy
```

### Context-Specific Secrets (Future)

#### User Context

```
USER_ENCRYPTION_KEY      # User data encryption key
USER_PASSWORD_SALT       # Password hashing salt
USER_JWT_SECRET          # User-specific JWT secret
USER_SESSION_TIMEOUT     # User session timeout
USER_MFA_SECRET          # Multi-factor authentication secret
```

#### Order Context

```
ORDER_PAYMENT_API_KEY    # Payment gateway API key
ORDER_PAYMENT_WEBHOOK_SECRET # Payment webhook secret
ORDER_SHIPPING_API_KEY   # Shipping provider API key
ORDER_TAX_API_KEY        # Tax calculation API key
ORDER_ENCRYPTION_KEY     # Order data encryption
```

#### Product Context

```
PRODUCT_IMAGE_STORAGE_KEY    # Image storage credentials
PRODUCT_SEARCH_API_KEY       # Search service API key
PRODUCT_CACHE_TTL            # Product cache TTL
PRODUCT_INVENTORY_API_KEY    # Inventory service API key
```

### External Service Secrets

#### Cloud Storage

```
AWS_ACCESS_KEY_ID        # AWS access key
AWS_SECRET_ACCESS_KEY    # AWS secret key
AWS_REGION               # AWS region
AWS_S3_BUCKET            # S3 bucket name

AZURE_STORAGE_ACCOUNT    # Azure storage account
AZURE_STORAGE_KEY        # Azure storage key
AZURE_STORAGE_CONTAINER  # Azure container name
```

#### Communication Services

```
SMTP_HOST                # SMTP server host
SMTP_PORT                # SMTP server port
SMTP_USERNAME            # SMTP username
SMTP_PASSWORD            # SMTP password
SMTP_FROM_EMAIL          # Default from email
SMTP_FROM_NAME           # Default from name

SLACK_BOT_TOKEN          # Slack bot token
SLACK_WEBHOOK_URL        # Slack webhook URL
SLACK_CHANNEL_DEFAULT    # Default Slack channel
```

#### Monitoring & Analytics

```
MONITORING_API_KEY       # Monitoring service API key
ANALYTICS_TOKEN          # Analytics service token
METRICS_ENDPOINT         # Metrics collection endpoint
ALERTING_WEBHOOK_URL     # Alerting webhook URL
SENTRY_DSN               # Sentry error tracking DSN
```

---

## 🔐 Service Token Naming Convention

### Format: `{PROJECT}_{ENVIRONMENT}_{PURPOSE}_{TYPE}`

#### Examples

```
gs-scaffold-api_dev_readonly_token
gs-scaffold-api_staging_service_token
gs-scaffold-api_prod_ci_token
gs-scaffold-shared_prod_monitoring_token
```

#### Token Types

- **`readonly`**: Read-only access to secrets
- **`service`**: Full read/write access for service operations
- **`ci`**: CI/CD pipeline access
- **`monitoring`**: Monitoring and alerting access
- **`admin`**: Administrative access (emergency use only)

---

## 📋 Secret Classification & Prefixes

### By Risk Level

#### 🔴 **CRITICAL** (Immediate rotation required if compromised)

```
*_SECRET                 # Any secret value
*_PRIVATE_KEY            # Private keys
*_API_KEY               # API authentication keys
*_PASSWORD              # Passwords
*_TOKEN                 # Authentication tokens
```

#### 🟡 **HIGH** (24h rotation window)

```
*_CONNECTION_STRING     # Database/service connections
*_URL (with auth)       # URLs containing authentication
*_WEBHOOK_SECRET        # Webhook signing secrets
*_ENCRYPTION_KEY        # Data encryption keys
```

#### 🟢 **MEDIUM** (7 day rotation window)

```
*_HOST                  # Service hostnames
*_PORT                  # Service ports
*_ENDPOINT              # Service endpoints
*_TIMEOUT_MS            # Timeout configurations
```

#### ⚪ **LOW** (Configuration values, 30+ day rotation)

```
*_ENABLED               # Feature flags
*_POOL_*                # Connection pool settings
*_CACHE_*               # Cache configurations
LOG_*                   # Logging configurations
*_TTL                   # Time-to-live settings
```

---

## ✅ Validation Rules

### Secret Name Validation

1. **Must be UPPER_SNAKE_CASE**: Only uppercase letters, numbers, and underscores
2. **No consecutive underscores**: `DB__HOST` ❌ → `DB_HOST` ✅
3. **Must start with letter**: `1ST_SECRET` ❌ → `FIRST_SECRET` ✅
4. **Maximum length**: 64 characters
5. **Descriptive**: Name should clearly indicate purpose

### Environment Name Validation

1. **Must be lowercase**: Only lowercase letters, numbers, and underscores
2. **No spaces or special characters**: Except underscore for personal environments
3. **Maximum length**: 32 characters
4. **Reserved names**: Cannot use `config`, `admin`, `root`, `system`

### Project Name Validation

1. **Must be lowercase**: Only lowercase letters, numbers, and hyphens
2. **Must start with company prefix**: `gs-scaffold-`
3. **Maximum length**: 50 characters
4. **No consecutive hyphens**: `gs--scaffold` ❌ → `gs-scaffold` ✅

---

## 🔄 Migration Mapping

### Current .env → Doppler Secret Names

#### From .env.example

```bash
# Current → New
APP_NAME → APP_NAME
APP_VERSION → APP_VERSION
NODE_ENV → NODE_ENV
PORT → PORT
LOG_SINK → LOG_SINK
LOG_LEVEL → LOG_LEVEL
PRETTY_LOGS → PRETTY_LOGS
LOKI_URL → LOKI_URL
```

#### From .env.security

```bash
# Current → New
KEYCLOAK_URL → KEYCLOAK_URL
KEYCLOAK_REALM → KEYCLOAK_REALM
KEYCLOAK_CLIENT_ID → KEYCLOAK_CLIENT_ID
KEYCLOAK_CLIENT_SECRET → KEYCLOAK_CLIENT_SECRET
JWT_AUDIENCE → JWT_AUDIENCE
JWKS_CACHE_MAX_AGE → JWKS_CACHE_MAX_AGE
OPA_URL → OPA_URL
CORS_ALLOWED_ORIGINS → CORS_ALLOWED_ORIGINS
```

#### From .env.complete (Additional)

```bash
# Current → New
PROTOCOL → PROTOCOL
HOST → HOST
PUBLIC_API_URL → PUBLIC_API_URL
DATABASE_URL → DB_CONNECTION_STRING
REDIS_URL → REDIS_CONNECTION_STRING
DATABASE_HOST → DB_HOST
DATABASE_PORT → DB_PORT
DATABASE_NAME → DB_NAME
DATABASE_USER → DB_USER
DATABASE_PASSWORD → DB_PASSWORD
```

---

## 🧪 Testing & Validation

### Naming Convention Tests

Create automated tests to validate naming conventions:

```bash
# Test script: validate-naming.sh
#!/bin/bash

# Check secret names in Doppler
doppler secrets list --project gs-scaffold-api --config dev | \
  grep -v '^[A-Z][A-Z0-9_]*$' && \
  echo "❌ Invalid secret names found" || \
  echo "✅ All secret names valid"

# Check for forbidden patterns
doppler secrets list --project gs-scaffold-api --config dev | \
  grep -E '(password|secret|key)' | \
  grep -v -E '_(PASSWORD|SECRET|KEY)$' && \
  echo "⚠️  Potential security secrets without proper suffix" || \
  echo "✅ Security secret naming compliant"
```

### Convention Compliance Checklist

- [ ] All secrets use UPPER_SNAKE_CASE
- [ ] Environment names are lowercase
- [ ] Project names follow company prefix
- [ ] No hardcoded secrets in source code
- [ ] Secret classification tags applied
- [ ] Service tokens have descriptive names

---

This naming convention guide ensures consistency, security, and maintainability across the entire Doppler implementation for gs-scaffold.
