# Secret Migration Mapping - Current State to Doppler

> **Purpose**: Complete mapping of existing environment variables to standardized Doppler secret names  
> **Phase**: 1.3 Current State Audit  
> **Date**: August 15, 2025

---

## 🔄 Migration Strategy Overview

This document provides the exact mapping from current `.env` file variables to the new Doppler secret naming convention following the `{DOMAIN}_{COMPONENT}_{PURPOSE}` pattern.

---

## 📋 Complete Variable Mapping

### **🔐 Security & Authentication Secrets**

| Current Variable         | New Doppler Secret            | Risk Level  | Migration Priority | Notes                         |
| ------------------------ | ----------------------------- | ----------- | ------------------ | ----------------------------- |
| `KEYCLOAK_CLIENT_SECRET` | `AUTH_KEYCLOAK_CLIENT_SECRET` | 🔴 Critical | P0                 | Required for all environments |
| `PII_ENCRYPTION_KEY`     | `SECURITY_PII_ENCRYPTION_KEY` | 🔴 Critical | P0                 | Remove hardcoded fallback     |
| `DATABASE_PASSWORD`      | `DATABASE_POSTGRES_PASSWORD`  | 🔴 Critical | P0                 | Part of connection config     |
| `REDIS_PASSWORD`         | `CACHE_REDIS_PASSWORD`        | 🟡 High     | P1                 | May be embedded in REDIS_URL  |
| `LOKI_BASIC_AUTH`        | `LOGGING_LOKI_BASIC_AUTH`     | 🟡 High     | P2                 | Optional for development      |

### **🔗 Connection Strings & URLs**

| Current Variable         | New Doppler Secret                  | Risk Level  | Migration Priority | Notes                            |
| ------------------------ | ----------------------------------- | ----------- | ------------------ | -------------------------------- |
| `DATABASE_URL`           | `DATABASE_POSTGRES_URL`             | 🔴 Critical | P0                 | Complete connection string       |
| `REDIS_URL`              | `CACHE_REDIS_URL`                   | 🟡 High     | P1                 | May contain embedded credentials |
| `ESDB_CONNECTION_STRING` | `EVENTSTORE_ESDB_CONNECTION_STRING` | 🟡 High     | P1                 | EventStore connection            |
| `KEYCLOAK_URL`           | `AUTH_KEYCLOAK_URL`                 | 🟢 Medium   | P2                 | Service endpoint                 |
| `OPA_URL`                | `SECURITY_OPA_URL`                  | 🟢 Medium   | P2                 | Policy service endpoint          |
| `LOKI_URL`               | `LOGGING_LOKI_URL`                  | 🟢 Medium   | P3                 | Logging service endpoint         |
| `ES_NODE`                | `LOGGING_ELASTICSEARCH_NODE`        | 🟢 Medium   | P3                 | Alternative logging backend      |

### **🏗️ Application Configuration**

| Current Variable  | New Doppler Secret        | Risk Level | Migration Priority | Notes                    |
| ----------------- | ------------------------- | ---------- | ------------------ | ------------------------ |
| `NODE_ENV`        | `APP_RUNTIME_ENVIRONMENT` | 🟢 Low     | P3                 | Environment designation  |
| `APP_NAME`        | `APP_CORE_NAME`           | 🟢 Low     | P4                 | Application identifier   |
| `APP_VERSION`     | `APP_CORE_VERSION`        | 🟢 Low     | P4                 | Version string           |
| `PORT`            | `APP_SERVER_PORT`         | 🟢 Low     | P3                 | Server binding port      |
| `PROTOCOL`        | `APP_SERVER_PROTOCOL`     | 🟢 Low     | P3                 | HTTP/HTTPS               |
| `HOST`            | `APP_SERVER_HOST`         | 🟢 Low     | P3                 | Server binding host      |
| `PUBLIC_API_URL`  | `APP_SERVER_PUBLIC_URL`   | 🟢 Medium  | P2                 | External/public endpoint |
| `STAGING_API_URL` | `APP_SERVER_STAGING_URL`  | 🟢 Low     | P4                 | Staging reference URL    |

### **💾 Database Configuration**

| Current Variable                   | New Doppler Secret                          | Risk Level | Migration Priority | Notes                           |
| ---------------------------------- | ------------------------------------------- | ---------- | ------------------ | ------------------------------- |
| `DATABASE_HOST`                    | `DATABASE_POSTGRES_HOST`                    | 🟢 Medium  | P2                 | Individual connection component |
| `DATABASE_PORT`                    | `DATABASE_POSTGRES_PORT`                    | 🟢 Medium  | P2                 | Database port                   |
| `DATABASE_NAME`                    | `DATABASE_POSTGRES_NAME`                    | 🟢 Medium  | P2                 | Database name                   |
| `DATABASE_USER`                    | `DATABASE_POSTGRES_USER`                    | 🟡 High    | P1                 | Database username               |
| `DATABASE_SSL`                     | `DATABASE_POSTGRES_SSL_ENABLED`             | 🟢 Low     | P3                 | SSL configuration               |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `DATABASE_POSTGRES_SSL_REJECT_UNAUTHORIZED` | 🟢 Low     | P3                 | SSL validation                  |
| `DATABASE_POOL_MIN`                | `DATABASE_POSTGRES_POOL_MIN`                | 🟢 Low     | P4                 | Connection pool minimum         |
| `DATABASE_POOL_MAX`                | `DATABASE_POSTGRES_POOL_MAX`                | 🟢 Low     | P4                 | Connection pool maximum         |

### **📊 Logging Configuration**

| Current Variable | New Doppler Secret            | Risk Level | Migration Priority | Notes                    |
| ---------------- | ----------------------------- | ---------- | ------------------ | ------------------------ |
| `LOG_LEVEL`      | `LOGGING_CORE_LEVEL`          | 🟢 Low     | P3                 | Log verbosity            |
| `LOG_SINK`       | `LOGGING_CORE_SINK`           | 🟢 Low     | P3                 | Output destination       |
| `PRETTY_LOGS`    | `LOGGING_CORE_PRETTY_ENABLED` | 🟢 Low     | P4                 | Pretty printing          |
| `LOGGER_LEVEL`   | `LOGGING_CORE_LEVEL`          | 🟢 Low     | P3                 | Alias for LOG_LEVEL      |
| `PINO_LOG_LEVEL` | `LOGGING_CORE_LEVEL`          | 🟢 Low     | P3                 | Pino-specific level      |
| `ES_INDEX`       | `LOGGING_ELASTICSEARCH_INDEX` | 🟢 Low     | P4                 | Elasticsearch index name |

### **🔐 JWT & Security Configuration**

| Current Variable           | New Doppler Secret              | Risk Level | Migration Priority | Notes                   |
| -------------------------- | ------------------------------- | ---------- | ------------------ | ----------------------- |
| `JWT_AUDIENCE`             | `AUTH_JWT_AUDIENCE`             | 🟢 Medium  | P2                 | JWT validation audience |
| `JWKS_CACHE_MAX_AGE`       | `AUTH_JWKS_CACHE_MAX_AGE`       | 🟢 Low     | P4                 | Performance tuning      |
| `JWKS_REQUESTS_PER_MINUTE` | `AUTH_JWKS_REQUESTS_PER_MINUTE` | 🟢 Low     | P4                 | Rate limiting           |
| `JWKS_TIMEOUT_MS`          | `AUTH_JWKS_TIMEOUT_MS`          | 🟢 Low     | P4                 | Request timeout         |
| `KEYCLOAK_REALM`           | `AUTH_KEYCLOAK_REALM`           | 🟢 Medium  | P2                 | Keycloak realm name     |
| `KEYCLOAK_CLIENT_ID`       | `AUTH_KEYCLOAK_CLIENT_ID`       | 🟢 Medium  | P2                 | OAuth client ID         |

### **🔒 OPA Policy Configuration**

| Current Variable                          | New Doppler Secret                                 | Risk Level | Migration Priority | Notes                  |
| ----------------------------------------- | -------------------------------------------------- | ---------- | ------------------ | ---------------------- |
| `OPA_TIMEOUT_MS`                          | `SECURITY_OPA_TIMEOUT_MS`                          | 🟢 Low     | P4                 | Request timeout        |
| `OPA_DECISION_LOGS`                       | `SECURITY_OPA_DECISION_LOGS_ENABLED`               | 🟢 Low     | P4                 | Audit logging          |
| `OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD`   | `SECURITY_OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD`   | 🟢 Low     | P4                 | Circuit breaker config |
| `OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS` | `SECURITY_OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS` | 🟢 Low     | P4                 | Recovery timeout       |
| `OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD`   | `SECURITY_OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD`   | 🟢 Low     | P4                 | Success threshold      |

### **🌐 CORS Configuration**

| Current Variable         | New Doppler Secret                | Risk Level | Migration Priority | Notes                   |
| ------------------------ | --------------------------------- | ---------- | ------------------ | ----------------------- |
| `CORS_ALLOWED_ORIGINS`   | `SECURITY_CORS_ALLOWED_ORIGINS`   | 🟢 Medium  | P2                 | Comma-separated origins |
| `CORS_ALLOW_CREDENTIALS` | `SECURITY_CORS_ALLOW_CREDENTIALS` | 🟢 Medium  | P2                 | Credentials flag        |

### **🐳 Container/Infrastructure**

| Current Variable          | New Doppler Secret               | Risk Level | Migration Priority | Notes                 |
| ------------------------- | -------------------------------- | ---------- | ------------------ | --------------------- |
| `DOCKER_CONTAINER`        | `INFRA_CONTAINER_DOCKER_ENABLED` | 🟢 Low     | P4                 | Container detection   |
| `CONTAINER_HOST`          | `INFRA_CONTAINER_HOST`           | 🟢 Low     | P4                 | Container hostname    |
| `HOSTNAME`                | `INFRA_SYSTEM_HOSTNAME`          | 🟢 Low     | P4                 | System hostname       |
| `KUBERNETES_SERVICE_HOST` | `INFRA_KUBERNETES_SERVICE_HOST`  | 🟢 Low     | P4                 | K8s service discovery |

---

## 🏷️ Domain Classification

### **Domain Prefixes Used**

| Domain        | Purpose                   | Example Variables                                       | Count |
| ------------- | ------------------------- | ------------------------------------------------------- | ----- |
| `APP_`        | Core application settings | `APP_CORE_NAME`, `APP_SERVER_PORT`                      | 8     |
| `AUTH_`       | Authentication & JWT      | `AUTH_KEYCLOAK_CLIENT_SECRET`, `AUTH_JWT_AUDIENCE`      | 7     |
| `SECURITY_`   | Security policies & PII   | `SECURITY_PII_ENCRYPTION_KEY`, `SECURITY_OPA_URL`       | 8     |
| `DATABASE_`   | Database connections      | `DATABASE_POSTGRES_URL`, `DATABASE_POSTGRES_PASSWORD`   | 9     |
| `CACHE_`      | Redis/caching             | `CACHE_REDIS_URL`, `CACHE_REDIS_PASSWORD`               | 2     |
| `LOGGING_`    | Logging & observability   | `LOGGING_CORE_LEVEL`, `LOGGING_LOKI_URL`                | 7     |
| `EVENTSTORE_` | EventStore configuration  | `EVENTSTORE_ESDB_CONNECTION_STRING`                     | 1     |
| `INFRA_`      | Infrastructure detection  | `INFRA_CONTAINER_HOST`, `INFRA_KUBERNETES_SERVICE_HOST` | 4     |

---

## 📦 Migration Packages by Priority

### **P0 - Critical (Week 1, Day 1-2)**

```yaml
secrets:
  AUTH_KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET}
  SECURITY_PII_ENCRYPTION_KEY: ${PII_ENCRYPTION_KEY}
  DATABASE_POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
  DATABASE_POSTGRES_URL: ${DATABASE_URL}
```

### **P1 - High Priority (Week 1, Day 3-5)**

```yaml
secrets:
  CACHE_REDIS_PASSWORD: ${REDIS_PASSWORD}
  CACHE_REDIS_URL: ${REDIS_URL}
  EVENTSTORE_ESDB_CONNECTION_STRING: ${ESDB_CONNECTION_STRING}
  DATABASE_POSTGRES_USER: ${DATABASE_USER}
```

### **P2 - Medium Priority (Week 2)**

```yaml
secrets:
  AUTH_KEYCLOAK_URL: ${KEYCLOAK_URL}
  SECURITY_OPA_URL: ${OPA_URL}
  APP_SERVER_PUBLIC_URL: ${PUBLIC_API_URL}
  AUTH_JWT_AUDIENCE: ${JWT_AUDIENCE}
  AUTH_KEYCLOAK_REALM: ${KEYCLOAK_REALM}
  AUTH_KEYCLOAK_CLIENT_ID: ${KEYCLOAK_CLIENT_ID}
  SECURITY_CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS}
  SECURITY_CORS_ALLOW_CREDENTIALS: ${CORS_ALLOW_CREDENTIALS}
  DATABASE_POSTGRES_HOST: ${DATABASE_HOST}
  DATABASE_POSTGRES_PORT: ${DATABASE_PORT}
  DATABASE_POSTGRES_NAME: ${DATABASE_NAME}
  LOGGING_LOKI_BASIC_AUTH: ${LOKI_BASIC_AUTH}
```

### **P3 - Standard Configuration (Week 3)**

```yaml
secrets:
  APP_RUNTIME_ENVIRONMENT: ${NODE_ENV}
  APP_SERVER_PORT: ${PORT}
  APP_SERVER_PROTOCOL: ${PROTOCOL}
  APP_SERVER_HOST: ${HOST}
  LOGGING_CORE_LEVEL: ${LOG_LEVEL}
  LOGGING_CORE_SINK: ${LOG_SINK}
  LOGGING_LOKI_URL: ${LOKI_URL}
  LOGGING_ELASTICSEARCH_NODE: ${ES_NODE}
  DATABASE_POSTGRES_SSL_ENABLED: ${DATABASE_SSL}
  DATABASE_POSTGRES_SSL_REJECT_UNAUTHORIZED: ${DATABASE_SSL_REJECT_UNAUTHORIZED}
```

### **P4 - Low Priority (Week 4+)**

```yaml
secrets:
  APP_CORE_NAME: ${APP_NAME}
  APP_CORE_VERSION: ${APP_VERSION}
  APP_SERVER_STAGING_URL: ${STAGING_API_URL}
  LOGGING_CORE_PRETTY_ENABLED: ${PRETTY_LOGS}
  LOGGING_ELASTICSEARCH_INDEX: ${ES_INDEX}
  AUTH_JWKS_CACHE_MAX_AGE: ${JWKS_CACHE_MAX_AGE}
  AUTH_JWKS_REQUESTS_PER_MINUTE: ${JWKS_REQUESTS_PER_MINUTE}
  AUTH_JWKS_TIMEOUT_MS: ${JWKS_TIMEOUT_MS}
  DATABASE_POSTGRES_POOL_MIN: ${DATABASE_POOL_MIN}
  DATABASE_POSTGRES_POOL_MAX: ${DATABASE_POOL_MAX}
  SECURITY_OPA_TIMEOUT_MS: ${OPA_TIMEOUT_MS}
  SECURITY_OPA_DECISION_LOGS_ENABLED: ${OPA_DECISION_LOGS}
  SECURITY_OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD: ${OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD}
  SECURITY_OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS: ${OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS}
  SECURITY_OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD: ${OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD}
  INFRA_CONTAINER_DOCKER_ENABLED: ${DOCKER_CONTAINER}
  INFRA_CONTAINER_HOST: ${CONTAINER_HOST}
  INFRA_SYSTEM_HOSTNAME: ${HOSTNAME}
  INFRA_KUBERNETES_SERVICE_HOST: ${KUBERNETES_SERVICE_HOST}
```

---

## 🔄 Backward Compatibility Strategy

### **Phase 1: Dual Loading (Doppler + .env)**

```typescript
// Load from Doppler first, fall back to process.env
const config = {
  databasePassword:
    doppler.get('DATABASE_POSTGRES_PASSWORD') ||
    process.env.DATABASE_PASSWORD ||
    undefined,
};
```

### **Phase 2: Doppler Primary**

```typescript
// Doppler as primary source with warning for .env usage
const config = {
  databasePassword: doppler.get('DATABASE_POSTGRES_PASSWORD'),
};
if (process.env.DATABASE_PASSWORD && !config.databasePassword) {
  logger.warn('Using deprecated .env variable DATABASE_PASSWORD');
}
```

### **Phase 3: Doppler Only**

```typescript
// Pure Doppler configuration
const config = {
  databasePassword: doppler.get('DATABASE_POSTGRES_PASSWORD'),
};
```

---

## 📋 Validation Rules

### **Required Secrets by Environment**

#### **Development**

- `AUTH_KEYCLOAK_CLIENT_SECRET` (optional, can use demo value)
- `SECURITY_PII_ENCRYPTION_KEY` (required)
- `DATABASE_POSTGRES_URL` or individual DB components (required)

#### **Staging**

- All authentication secrets (required)
- All database secrets (required)
- External service URLs (required)

#### **Production**

- All critical and high-risk secrets (required)
- No fallback values allowed
- All URLs must be HTTPS where applicable

---

## 🎯 Next Actions

1. **✅ Create base configuration schema** with new secret names
2. **🔧 Update AppConfigUtil** to support Doppler secret names
3. **🧪 Test dual-loading mechanism** in development
4. **📝 Update documentation** with new secret names
5. **🚀 Begin P0 secret migration** to Doppler

---

**📋 Migration mapping complete - Ready for Phase 1.4 implementation**
