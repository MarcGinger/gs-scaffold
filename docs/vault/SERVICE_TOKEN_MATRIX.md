# Service Token Matrix

> **Phase 1.2 Deliverable**: Complete service token architecture for gs-scaffold Doppler implementation  
> **Owner**: Lead Developer  
> **Date**: August 15, 2025

---

## 🔑 Token Architecture Overview

This matrix defines all service tokens required for the gs-scaffold Doppler implementation, including their scope, permissions, lifecycle, and usage patterns.

---

## 📊 Primary Service Token Matrix

### gs-scaffold-api Project Tokens

| Token Name                         | Environment | Type    | Scope       | Expiry  | Rotation  | Usage                         |
| ---------------------------------- | ----------- | ------- | ----------- | ------- | --------- | ----------------------------- |
| `gs-scaffold-api_dev_readonly`     | dev         | Project | Read-only   | 90 days | Manual    | Local development, monitoring |
| `gs-scaffold-api_dev_service`      | dev         | Service | Full access | 90 days | Automated | CI/CD, development services   |
| `gs-scaffold-api_staging_readonly` | staging     | Project | Read-only   | 60 days | Manual    | Staging monitoring, debugging |
| `gs-scaffold-api_staging_service`  | staging     | Service | Full access | 60 days | Automated | CI/CD, staging deployment     |
| `gs-scaffold-api_prod_readonly`    | prod        | Project | Read-only   | 30 days | Automated | Production monitoring         |
| `gs-scaffold-api_prod_service`     | prod        | Service | Full access | 30 days | Automated | Production deployment         |

### Specialized Tokens

| Token Name                          | Environment | Type       | Scope      | Expiry   | Rotation  | Usage                             |
| ----------------------------------- | ----------- | ---------- | ---------- | -------- | --------- | --------------------------------- |
| `gs-scaffold-api_dev_ci`            | dev         | CI/CD      | Build/Test | 180 days | Quarterly | GitHub Actions, automated testing |
| `gs-scaffold-api_staging_ci`        | staging     | CI/CD      | Deploy     | 90 days  | Automated | Staging deployment pipeline       |
| `gs-scaffold-api_prod_ci`           | prod        | CI/CD      | Deploy     | 60 days  | Automated | Production deployment pipeline    |
| `gs-scaffold-api_all_monitoring`    | all         | Monitoring | Read-only  | 180 days | Quarterly | Grafana, alerting systems         |
| `gs-scaffold-api_dev_personal_john` | dev         | Personal   | Read-only  | 30 days  | Manual    | Developer personal environment    |

---

## 🏗️ Token Permissions & Capabilities

### Token Type Definitions

#### 🔵 **Project Tokens** (Read-Only)

**Capabilities:**

- Read secret values
- List secret names
- Download environment configurations
- View project metadata

**Restrictions:**

- Cannot create/update/delete secrets
- Cannot manage project settings
- Cannot access audit logs

**Use Cases:**

- Local development environment setup
- Monitoring and alerting systems
- Development tools and IDEs
- Documentation generation

#### 🟢 **Service Tokens** (Full Access)

**Capabilities:**

- All Project Token capabilities
- Create/update/delete secrets
- Manage environment configurations
- Access audit logs (read-only)

**Restrictions:**

- Cannot manage project-level settings
- Cannot create/delete environments
- Cannot manage other service tokens

**Use Cases:**

- CI/CD pipeline operations
- Application runtime secret access
- Automated secret rotation
- Service-to-service communication

#### 🟡 **CI/CD Tokens** (Build/Deploy)

**Capabilities:**

- Read secrets for builds
- Update deployment-related secrets
- Access to specific secret subsets
- Temporary secret creation for builds

**Restrictions:**

- Limited to CI/CD-related secrets
- Cannot access sensitive production secrets
- Time-limited access windows

**Use Cases:**

- GitHub Actions workflows
- Build pipeline configurations
- Deployment automation
- Testing environment setup

#### 🔴 **Monitoring Tokens** (Observability)

**Capabilities:**

- Read-only access across environments
- Access to operational metrics
- Secret loading health checks
- Audit log reading

**Restrictions:**

- Cannot modify any secrets
- Cannot access secret values (only metadata)
- Cannot trigger operations

**Use Cases:**

- Grafana dashboards
- Prometheus monitoring
- Health check systems
- Audit compliance reporting

---

## 🔐 Security Matrix by Environment

### Development Environment (`dev`)

```
Security Level: LOW
Token Expiry: 90 days
Access Control: Permissive
Rotation: Manual/Automated
```

| Role       | Token Type         | Permissions      | Justification           |
| ---------- | ------------------ | ---------------- | ----------------------- |
| Developer  | Project (readonly) | Read all secrets | Local development needs |
| CI/CD      | Service            | Full access      | Testing and validation  |
| Monitoring | Monitoring         | Read metadata    | Development metrics     |

### Staging Environment (`staging`)

```
Security Level: MEDIUM
Token Expiry: 60 days
Access Control: Controlled
Rotation: Automated
```

| Role       | Token Type         | Permissions                | Justification               |
| ---------- | ------------------ | -------------------------- | --------------------------- |
| Developer  | Project (readonly) | Read non-sensitive secrets | Debugging production issues |
| CI/CD      | Service            | Full access                | Pre-production testing      |
| Monitoring | Monitoring         | Read metadata              | Staging validation          |

### Production Environment (`prod`)

```
Security Level: HIGH
Token Expiry: 30 days
Access Control: Restrictive
Rotation: Automated
```

| Role       | Token Type            | Permissions             | Justification            |
| ---------- | --------------------- | ----------------------- | ------------------------ |
| Developer  | ❌ No Access          | None                    | Production security      |
| CI/CD      | Service (limited)     | Deploy-only access      | Automated deployment     |
| Monitoring | Monitoring            | Read metadata only      | Production observability |
| Emergency  | Service (break-glass) | Full access (temporary) | Incident response        |

---

## 🔄 Token Lifecycle Management

### Creation Process

#### 1. Token Naming

```bash
# Format: {project}_{environment}_{type}_{purpose}
gs-scaffold-api_dev_service_main
gs-scaffold-api_prod_readonly_monitoring
gs-scaffold-api_staging_ci_deploy
```

#### 2. Token Generation

```bash
# Create service token for development
doppler configs tokens create gs-scaffold-api_dev_service \
  --project gs-scaffold-api \
  --config dev \
  --access read-write \
  --max-age 90d

# Create readonly token for monitoring
doppler configs tokens create gs-scaffold-api_prod_readonly \
  --project gs-scaffold-api \
  --config prod \
  --access read \
  --max-age 30d
```

#### 3. GitHub Secrets Storage

```bash
# Store in GitHub repository secrets
API_DOPPLER_TOKEN_DEV=dp.ct.xxxx...     # Development service token
API_DOPPLER_TOKEN_STAGING=dp.ct.xxxx... # Staging service token
API_DOPPLER_TOKEN_PROD=dp.ct.xxxx...    # Production service token
```

### Rotation Schedule

#### Automated Rotation

| Environment | Frequency | Method         | Notification           |
| ----------- | --------- | -------------- | ---------------------- |
| Production  | 30 days   | GitHub Actions | Slack alert            |
| Staging     | 60 days   | GitHub Actions | Email notification     |
| Development | 90 days   | Manual prompt  | Developer notification |

#### Emergency Rotation

```bash
# Immediate token rotation script
#!/bin/bash
ENV=${1:-staging}
PROJECT="gs-scaffold-api"

# Revoke existing token
doppler configs tokens revoke OLD_TOKEN_NAME \
  --project $PROJECT \
  --config $ENV

# Create new token
NEW_TOKEN=$(doppler configs tokens create emergency_$(date +%s) \
  --project $PROJECT \
  --config $ENV \
  --access read-write \
  --max-age 1d \
  --plain)

echo "Emergency token: $NEW_TOKEN"
```

### Token Monitoring

#### Health Checks

```typescript
// Token health monitoring
export class TokenHealthMonitor {
  async checkTokenHealth(): Promise<TokenHealth[]> {
    const tokens = await this.getActiveTokens();
    return tokens.map((token) => ({
      name: token.name,
      environment: token.environment,
      expiresAt: token.expiresAt,
      daysUntilExpiry: this.calculateDaysUntilExpiry(token.expiresAt),
      usageCount: token.usageCount,
      lastUsed: token.lastUsed,
      status: this.getTokenStatus(token),
    }));
  }

  private getTokenStatus(token: Token): TokenStatus {
    const daysLeft = this.calculateDaysUntilExpiry(token.expiresAt);

    if (daysLeft <= 3) return 'CRITICAL';
    if (daysLeft <= 7) return 'WARNING';
    if (daysLeft <= 14) return 'NOTICE';
    return 'HEALTHY';
  }
}
```

---

## 🌐 GitHub Actions Integration

### Repository Secrets Matrix

#### Main Repository: `gs-scaffold`

```bash
# Service Tokens
API_DOPPLER_TOKEN_DEV        # Development environment access
API_DOPPLER_TOKEN_STAGING    # Staging environment access
API_DOPPLER_TOKEN_PROD       # Production environment access

# CI/CD Tokens
API_DOPPLER_CI_TOKEN         # CI/CD specific operations
DOPPLER_MONITORING_TOKEN     # Cross-environment monitoring

# Organization Tokens (if applicable)
DOPPLER_ORG_TOKEN           # Organization-level operations
```

#### Environment-Specific Secrets

```yaml
# Development Environment
development:
  secrets:
    DOPPLER_TOKEN: ${{ secrets.API_DOPPLER_TOKEN_DEV }}

# Staging Environment
staging:
  secrets:
    DOPPLER_TOKEN: ${{ secrets.API_DOPPLER_TOKEN_STAGING }}

# Production Environment
production:
  secrets:
    DOPPLER_TOKEN: ${{ secrets.API_DOPPLER_TOKEN_PROD }}
```

### Workflow Examples

#### CI/CD Pipeline Token Usage

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      - name: Deploy with secrets
        run: |
          doppler run --project gs-scaffold-api --config staging -- \
            ./deploy.sh
        env:
          DOPPLER_TOKEN: ${{ secrets.API_DOPPLER_TOKEN_STAGING }}
```

#### Monitoring Token Usage

```yaml
name: Secret Health Check

on:
  schedule:
    - cron: '0 6 * * *' # Daily at 6 AM

jobs:
  health-check:
    runs-on: ubuntu-latest

    steps:
      - name: Check token health
        run: |
          doppler secrets list --project gs-scaffold-api --config prod
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_MONITORING_TOKEN }}
```

---

## 🚨 Emergency Procedures

### Token Compromise Response

#### Immediate Actions (0-15 minutes)

1. **Revoke compromised token**

   ```bash
   doppler configs tokens revoke COMPROMISED_TOKEN_NAME \
     --project gs-scaffold-api \
     --config prod
   ```

2. **Generate emergency token**

   ```bash
   EMERGENCY_TOKEN=$(doppler configs tokens create emergency_$(date +%s) \
     --project gs-scaffold-api \
     --config prod \
     --max-age 24h \
     --plain)
   ```

3. **Update GitHub secrets**
   ```bash
   # Update GitHub repository secret
   gh secret set API_DOPPLER_TOKEN_PROD --body "$EMERGENCY_TOKEN"
   ```

#### Investigation Phase (15-60 minutes)

1. **Audit token usage**

   ```bash
   doppler activity --project gs-scaffold-api --config prod --limit 100
   ```

2. **Check for unauthorized changes**

   ```bash
   doppler secrets changelog --project gs-scaffold-api --config prod
   ```

3. **Verify secret integrity**
   ```bash
   doppler secrets compare --project gs-scaffold-api \
     --config-1 staging --config-2 prod
   ```

#### Recovery Phase (1-4 hours)

1. **Generate new long-term token**
2. **Update all systems using the compromised token**
3. **Conduct security review**
4. **Update incident documentation**

### Break-Glass Access

#### Production Emergency Access

```bash
# Create temporary admin token (1 hour expiry)
BREAK_GLASS_TOKEN=$(doppler configs tokens create break_glass_$(date +%s) \
  --project gs-scaffold-api \
  --config prod \
  --access read-write \
  --max-age 1h \
  --plain)

# Log emergency access
echo "$(date): Emergency access granted to $(whoami)" >> /var/log/doppler-emergency.log
```

---

## 📈 Monitoring & Alerting

### Token Usage Metrics

#### Prometheus Metrics

```prometheus
# Token usage frequency
doppler_token_usage_total{project="gs-scaffold-api", environment="prod"}

# Token expiry countdown
doppler_token_expiry_days{project="gs-scaffold-api", environment="prod"}

# Failed authentication attempts
doppler_token_auth_failures_total{project="gs-scaffold-api"}
```

#### Grafana Dashboard Panels

1. **Token Health Overview**
   - Token expiry timeline
   - Usage frequency
   - Authentication success rate

2. **Security Metrics**
   - Failed authentication attempts
   - Unusual access patterns
   - Emergency token usage

3. **Operational Metrics**
   - Secret retrieval latency
   - Configuration reload frequency
   - Environment consistency checks

### Alert Rules

#### Critical Alerts

```yaml
# Token expiring soon
alert: DopplerTokenExpiringCritical
expr: doppler_token_expiry_days < 3
severity: critical
summary: "Doppler token expires in {{ $value }} days"

# Authentication failures
alert: DopplerAuthFailures
expr: rate(doppler_token_auth_failures_total[5m]) > 0.1
severity: warning
summary: "High rate of Doppler authentication failures"
```

---

This service token matrix provides a comprehensive framework for managing all authentication and authorization aspects of the gs-scaffold Doppler implementation, ensuring security, operational efficiency, and emergency preparedness.
