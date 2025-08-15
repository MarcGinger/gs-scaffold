# Secrets & Configuration Management (Doppler-first)

> **Goal**: All services read configuration from environment variables, injected by Doppler in every environment (dev/personal → staging → prod). No secrets in git. Config is validated at boot. Logs redact secrets.

## 🚀 Quick Start for New Developers

### Option 1: Without Doppler (Initial Setup)

```bash
# Copy example configuration
cp .env.example .env.local
# Edit .env.local with provided development values (get from team lead)
npm run dev:local
```

### Option 2: With Doppler (Production-like)

````bash
# Install and authenticate with Doppler
doppler login
# Configure project settings
doppler setup
# Run with Doppler-injected secrets
npm run dev
``### Immediate Priorities (Next Sprint)
- [ ] **Docker Strategy**: Decide Option A (runtime injection) vs Option B (in-image CLI) per service
- [ ] **Schema Implementation**: Add Zod validation schemas for all service contracts
- [ ] **History Decision**: Confirm if `core-email`, `core-slack`, `core-sms` need persistent delivery history

### Security & Compliance
- [ ] **RBAC Definition**: Document who can edit production secrets in Doppler
- [ ] **Incident Response**: Create runbooks for leaked secrets and emergency rotation
- [ ] **Compliance Audit**: Ensure configuration meets SOC2/GDPR requirements

### Developer Experience
- [ ] **CI Integration**: Add env diff checks - fail PR if config docs change without schema updates
- [ ] **Codespaces Support**: Evaluate Doppler → GitHub sync for cloud development environments
- [ ] **Local Fallbacks**: Implement graceful degradation when Doppler is unavailable

### Automation & Monitoring
- [ ] **Automated Rotation**: Implement scheduled rotation for non-critical secrets
- [ ] **Health Dashboards**: Create Grafana dashboards for secret loading metrics
- [ ] **Alerting Rules**: Define alert thresholds for secret access failures

---

## 📚 Additional Resources

### Documentation
- [Doppler CLI Reference](https://docs.doppler.com/docs/cli)
- [Kubernetes Secrets Operator](https://docs.doppler.com/docs/kubernetes-operator)
- [Docker Integration Guide](https://docs.doppler.com/docs/docker)

### Internal Links
- `/docs/runbooks/secrets-rotation.md` - Secret rotation procedures
- `/docs/runbooks/incident-response.md` - Security incident response
- `/docs/config/` - Per-service configuration documentation

### Contact & Support
- **DevOps Team**: devops@yourcompany.com
- **Security Team**: security@yourcompany.com
- **Doppler Support**: [support.doppler.com](https://support.doppler.com)**Recommendation**: Start with Option 1 for initial setup, then migrate to Option 2 for production-like development.

---

## ✅ Global Implementation Checklist

1. **Doppler Project Setup**
   - [ ] Create a Doppler project for each deployable service.
   - [ ] Define `dev`, `staging`, `prod` configs for each.
   - [ ] Create `dev_<name>` configs for personal dev if required.

2. **Naming Convention Enforcement**
   - [ ] All secret names in `UPPER_SNAKE_CASE`.
   - [ ] Prefix per domain (`DB_`, `REDIS_`, `ESDB_`, etc.).

3. **ConfigManager Integration**
   - [ ] Implement schema validation in bootstrap.
   - [ ] Fail fast if required variables are missing.

4. **Local Dev Flow**
   - [ ] Install Doppler CLI.
   - [ ] `doppler setup` per service.
   - [ ] Update npm scripts to use `doppler run --`.
   - [ ] Provide `.env.example` templates for initial developer setup.
   - [ ] Document fallback strategy for Doppler unavailability.

5. **Configuration Validation**
   - [ ] Implement Zod schemas for each service configuration.
   - [ ] Add boot-time validation with clear error messages.
   - [ ] Fail fast if required variables are missing or invalid.

6. **Docker Integration**
   - [ ] Decide on runtime injection vs in-image CLI.
   - [ ] Update compose files with correct env injection.

6. **Kubernetes Integration**
   - [ ] Install Doppler Secrets Operator.
   - [ ] Create Service Token secrets.
   - [ ] Add `DopplerSecret` CR per service.

7. **CI/CD**
   - [ ] Add Doppler CLI GitHub Action.
   - [ ] Use Service Tokens in CI.
   - [ ] Ensure secrets redaction in logs.

8. **Security & Monitoring**
   - [ ] Rotate tokens regularly (90-day cadence for high-risk credentials).
   - [ ] Enable Doppler audit logs and export to SIEM.
   - [ ] Add Jest tests to ensure no secrets leak to logs.
   - [ ] Implement secret access monitoring and alerting.
   - [ ] Document incident response for leaked secrets.

9. **Error Handling & Recovery**
   - [ ] Define fallback strategies when Doppler is unavailable.
   - [ ] Implement graceful degradation patterns.
   - [ ] Add secret rotation rollback procedures.
   - [ ] Create monitoring for secret loading failures.

9. **Documentation**
   - [ ] Create `docs/config/<service>.md` for each service.
   - [ ] Keep contracts updated with required vars.

---

## �️ Error Handling & Recovery Strategy

### When Doppler is Unavailable

**Local Development:**
- Fall back to `.env.local` (not in git, copy from `.env.example`)
- Display warning message about using fallback configuration
- Ensure `.env.local` is in `.gitignore`

**Staging Environment:**
- Use cached secrets with expiration warnings
- Alert DevOps team of Doppler connectivity issues
- Maintain 24h cached secret validity

**Production Environment:**
- Fail fast with clear error messages
- Trigger alerts for immediate DevOps response
- No fallback to prevent security compromise

### Secret Rotation & Rollback

**Zero-Downtime Rotation:**
1. Keep previous secret version active for 24h overlap period
2. Deploy new secrets to staging first
3. Use blue-green deployment pattern for production
4. Monitor authentication success rates post-rotation

**Automated Rollback Triggers:**
- Authentication failure rate > 5% within 5 minutes
- Service health check failures related to auth
- Manual rollback command for emergency situations

**Recovery Procedures:**
```bash
# Emergency rollback to previous secret version
doppler secrets set SECRET_NAME "previous_value" -p project -c prod

# Verify service recovery
kubectl rollout status deployment/service-name -n apps
````

---

## 📋 Configuration Schema Validation

### Example Zod Schema Implementation

```typescript
// src/config/api-config.schema.ts
import { z } from 'zod';

export const ApiConfigSchema = z.object({
  SERVICE_NAME: z.string().default('gs-scaffold-api'),
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().int().min(1000).max(65535).default(3000),

  // Event Store
  ESDB_CONNECTION_STRING: z.string().url(),
  REDIS_URL: z.string().url(),

  // Database
  TYPEORM_URL: z.string().url(),

  // Authentication
  KEYCLOAK_ISSUER_URL: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(8),

  // Authorization
  OPA_URL: z.string().url(),

  // Logging
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_REDACT: z.string().optional(),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

// Boot-time validation
export function validateConfig(): ApiConfig {
  try {
    return ApiConfigSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Configuration validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}
```

### Integration in Bootstrap

```typescript
// main.ts
import { validateConfig } from './config/api-config.schema';

async function bootstrap() {
  // Validate configuration first
  const config = validateConfig();
  console.log(`✅ Configuration validated for ${config.SERVICE_NAME}`);

  const app = await NestFactory.create(AppModule);
  // ... rest of bootstrap
}
```

---

## 🔌 Port Management Strategy

### Dynamic Port Allocation

```typescript
// config/port-manager.ts
export class PortManager {
  private static basePort = 3000;
  private static portMap = new Map<string, number>();

  static getPort(serviceName: string): number {
    if (!this.portMap.has(serviceName)) {
      const port = this.basePort + this.portMap.size;
      this.portMap.set(serviceName, port);
    }
    return this.portMap.get(serviceName)!;
  }
}

// Usage in service configuration
const PORT = process.env.PORT || PortManager.getPort(process.env.SERVICE_NAME);
```

### Recommended Port Ranges

```
Development (local):     3000-3099
Integration Testing:     3100-3199
Staging:                 3200-3299
Production:              Standard ports (80, 443, 8080, etc.)
```

---

## �📄 Per-Service Secrets Contracts

### API Service

```bash
# Core Service Identity
SERVICE_NAME=gs-scaffold-api
NODE_ENV=development|staging|production
PORT=3000                                               # Use PORT_RANGE=3000-3010 for dynamic allocation

# Event Store & Caching
ESDB_CONNECTION_STRING=esdb://<user>:<pass>@<host>:2113?tls=false
REDIS_URL=redis://<user>:<pass>@<host>:6379

# Persistent Storage
TYPEORM_URL=postgres://<user>:<pass>@<host>:5432/<db>

# Authentication & Authorization
KEYCLOAK_ISSUER_URL=https://<kc-host>/realms/<realm>
KEYCLOAK_CLIENT_ID=<client-id>
KEYCLOAK_CLIENT_SECRET=<client-secret>
OPA_URL=http://opa:8181/v1/data/...

# Observability
LOG_LEVEL=info|debug|warn|error
LOG_REDACT=KEYCLOAK_CLIENT_SECRET,TYPEORM_PASSWORD,REDIS_PASSWORD,SMTP_PASSWORD,SLACK_BOT_TOKEN,AZURE_STORAGE_CONNECTION_STRING

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000                               # milliseconds
HEALTH_CHECK_INTERVAL=30000                             # milliseconds
```

### Core-Email Service

```bash
# Core Service Identity
SERVICE_NAME=core-email
NODE_ENV=development|staging|production
PORT=3001

# Event Store & Caching (if message history is persisted)
ESDB_CONNECTION_STRING=esdb://<user>:<pass>@<host>:2113?tls=false
REDIS_URL=redis://<user>:<pass>@<host>:6379
TYPEORM_URL=postgres://<user>:<pass>@<host>:5432/<db>    # Optional: for delivery history

# SMTP Configuration
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false                                        # true for port 465
SMTP_USERNAME=<username>
SMTP_PASSWORD=<password>
SMTP_FROM_NAME=Your Application Name
SMTP_FROM_EMAIL=<noreply@example.com>

# Template Management
TEMPLATE_BASE_URL=https://yourdomain.blob.core.windows.net/templates/email
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...

# Delivery Settings
EMAIL_RETRY_ATTEMPTS=3
EMAIL_RETRY_DELAY=5000                                   # milliseconds
EMAIL_BATCH_SIZE=10                                      # concurrent sends

# Observability
LOG_LEVEL=info
LOG_REDACT=SMTP_PASSWORD,AZURE_STORAGE_CONNECTION_STRING
```

### Core-Slack Service

```
SERVICE_NAME=core-slack
NODE_ENV=development|staging|production
PORT=3002
SLACK_BOT_TOKEN=<bot-token>
SLACK_SIGNING_SECRET=<signing-secret>
LOG_LEVEL=info
```

### Core-Webhook Service

```
SERVICE_NAME=core-webhook
NODE_ENV=development|staging|production
PORT=3003
WEBHOOK_SECRET=<secret>
LOG_LEVEL=info
```

### Core-Storage Service

```
SERVICE_NAME=core-storage
NODE_ENV=development|staging|production
PORT=3004
AZURE_STORAGE_CONNECTION_STRING=<connection-string>
AZURE_CONTAINER_NAME=<container-name>
LOG_LEVEL=info
```

---

## � Monitoring & Alerting

### Secret Access Monitoring

```yaml
# Example Prometheus alert for secret loading failures
groups:
  - name: secrets.rules
    rules:
      - alert: SecretLoadingFailure
        expr: increase(secret_loading_failures_total[5m]) > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Service {{ $labels.service }} failed to load secrets'
          description: 'Secret loading failures detected for {{ $labels.service }}'

      - alert: DopplerConnectivityIssue
        expr: up{job="doppler-operator"} == 0
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: 'Doppler operator is down'
          description: 'Doppler secrets operator is not responding'
```

### Health Check Integration

```typescript
// health/secrets.health.ts
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

@Injectable()
export class SecretsHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const requiredSecrets = [
      'KEYCLOAK_CLIENT_SECRET',
      'TYPEORM_URL',
      'REDIS_URL',
    ];

    const missingSecrets = requiredSecrets.filter(
      (secret) => !process.env[secret],
    );

    const isHealthy = missingSecrets.length === 0;

    return this.getStatus(key, isHealthy, {
      missingSecrets: missingSecrets.length > 0 ? missingSecrets : undefined,
    });
  }
}
```

---

## �🔄 Iteration Notes

## 🔄 Implementation Status & Next Steps

- [ ] **Phase 1**: Core services (API, email, slack) - Target: Week 1-2
- [ ] **Phase 2**: Supporting services (storage, webhook, sms) - Target: Week 3-4
- [ ] **Phase 3**: Advanced services (workflow, document) - Target: Week 5-6
- [ ] Build automated `secrets-audit` script to compare Doppler configs vs contracts
- [ ] Document rotation schedules and owner responsibility for each secret
- [ ] Implement automated secret rotation for non-critical secrets
- [ ] Add Doppler → GitHub sync for Codespaces (optional)

---

## 📝 Per-Service Configuration Contracts (Required Environment Variables)

> **How to use:** Copy each block into `/docs/config/<service>.md`. Keep **descriptions** crisp, and mark whether runtime change requires **restart**.

### 16.1 API (Gateway / BFF)

```
SERVICE_NAME=gs-scaffold-api                        # Name used in logs/metrics (restart: no)
NODE_ENV=development|staging|production             # Environment (restart: no)
PORT=3000                                           # HTTP port (restart: yes)

# Event Store / Projections
ESDB_CONNECTION_STRING=esdb://user:pass@host:2113?tls=false   # (restart: yes)
REDIS_URL=redis://user:pass@host:6379                         # (restart: yes)

# Durable Read Store
TYPEORM_URL=postgres://user:pass@host:5432/db                 # (restart: yes)

# AuthN / AuthZ
KEYCLOAK_ISSUER_URL=https://kc/realms/main                    # (restart: yes)
KEYCLOAK_CLIENT_ID=gs-api                                     # (restart: yes)
KEYCLOAK_CLIENT_SECRET=xxxxx                                  # (restart: yes)
OPA_URL=http://opa:8181/v1/data                               # (restart: yes)

# Observability
LOG_LEVEL=info                                                # (restart: no)
LOG_REDACT=KEYCLOAK_CLIENT_SECRET,DB_PASSWORD,REDIS_PASSWORD,SMTP_PASSWORD,SLACK_BOT_TOKEN,AZURE_STORAGE_CONNECTION_STRING
```

### 16.2 core-email (SMTP delivery)

```
SERVICE_NAME=core-email
NODE_ENV=development|staging|production
PORT=3011

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...
TYPEORM_URL=postgres://... # if storing message history; else optional

# SMTP
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false            # true for 465
SMTP_USERNAME=apikey         # provider-specific
SMTP_PASSWORD=xxxxx          # secret
SMTP_FROM_NAME=Your App
SMTP_FROM_EMAIL=no-reply@yourapp.com

# Templates / Rendering
TEMPLATE_BASE_URL=https://gstudios.blob.core.windows.net/private/templates/email
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=...

LOG_LEVEL=info
LOG_REDACT=SMTP_PASSWORD,AZURE_STORAGE_CONNECTION_STRING
```

### 16.3 core-slack (Slack delivery)

```
SERVICE_NAME=core-slack
NODE_ENV=development|staging|production
PORT=3012

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...
TYPEORM_URL=postgres://...  # optional for delivery history

SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_DEFAULT_CHANNEL=#alerts

LOG_LEVEL=info
LOG_REDACT=SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET
```

### 16.4 core-sms (SMS delivery)

```
SERVICE_NAME=core-sms
NODE_ENV=development|staging|production
PORT=3013

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...
TYPEORM_URL=postgres://...  # optional

# Provider (Twilio or similar)
SMS_PROVIDER=twilio|other
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+100000000

LOG_LEVEL=info
LOG_REDACT=TWILIO_AUTH_TOKEN
```

### 16.5 core-webhook (Outgoing webhooks)

```
SERVICE_NAME=core-webhook
NODE_ENV=development|staging|production
PORT=3014

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...
TYPEORM_URL=postgres://...   # optional

# Security
WEBHOOK_DEFAULT_SECRET=...   # used to sign payloads if per-destination secret absent
WEBHOOK_RETRY_POLICY=exponential|linear

LOG_LEVEL=info
LOG_REDACT=WEBHOOK_DEFAULT_SECRET
```

### 16.6 core-storage (Documents & blobs)

```
SERVICE_NAME=core-storage
NODE_ENV=development|staging|production
PORT=3015

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...

# Azure Blob
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=...
AZURE_STORAGE_PUBLIC_CONTAINER=public
AZURE_STORAGE_PRIVATE_CONTAINER=private

LOG_LEVEL=info
LOG_REDACT=AZURE_STORAGE_CONNECTION_STRING
```

### 16.7 core-workflow (Camunda/n8n orchestration)

```
SERVICE_NAME=core-workflow
NODE_ENV=development|staging|production
PORT=3016

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...

# External Engines
N8N_BASE_URL=https://n8n...
N8N_API_TOKEN=...
CAMUNDA_BASE_URL=https://camunda...
CAMUNDA_CLIENT_ID=...
CAMUNDA_CLIENT_SECRET=...

LOG_LEVEL=info
LOG_REDACT=N8N_API_TOKEN,CAMUNDA_CLIENT_SECRET
```

### 16.8 core-websocket (Realtime)

```
SERVICE_NAME=core-websocket
NODE_ENV=development|staging|production
PORT=3017

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...        # for pub/sub adapter

WS_ALLOW_ORIGINS=https://app.example.com,https://admin.example.com

LOG_LEVEL=info
```

### 16.9 core-lookup (Reference data)

```
SERVICE_NAME=core-lookup
NODE_ENV=development|staging|production
PORT=3018

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...
TYPEORM_URL=postgres://...   # if durable cache/indexing is used

LOG_LEVEL=info
```

### 16.10 core-document (jsreport)

```
SERVICE_NAME=core-document
NODE_ENV=development|staging|production
PORT=3019

ESDB_CONNECTION_STRING=esdb://...
REDIS_URL=redis://...

JSREPORT_URL=http://jsreport:5488
JSREPORT_USER=...
JSREPORT_PASSWORD=...
ASSET_BASE_URL=https://gstudios.blob.core.windows.net/private/templates/document
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=...

LOG_LEVEL=info
LOG_REDACT=JSREPORT_PASSWORD,AZURE_STORAGE_CONNECTION_STRING
```

> **Note:** If a service also exposes HTTP APIs, ensure PORTs don’t clash across pods when running locally via compose.

---

## 17) Doppler Project & Token Matrix (Template)

| Service        | Doppler Project  | Configs                  | Tokens (GitHub/K8s)              |
| -------------- | ---------------- | ------------------------ | -------------------------------- |
| api            | `api`            | `dev`, `staging`, `prod` | `API_DOPPLER_TOKEN_*`            |
| core-email     | `core-email`     | `dev`, `staging`, `prod` | `CORE_EMAIL_DOPPLER_TOKEN_*`     |
| core-slack     | `core-slack`     | `dev`, `staging`, `prod` | `CORE_SLACK_DOPPLER_TOKEN_*`     |
| core-sms       | `core-sms`       | `dev`, `staging`, `prod` | `CORE_SMS_DOPPLER_TOKEN_*`       |
| core-webhook   | `core-webhook`   | `dev`, `staging`, `prod` | `CORE_WEBHOOK_DOPPLER_TOKEN_*`   |
| core-storage   | `core-storage`   | `dev`, `staging`, `prod` | `CORE_STORAGE_DOPPLER_TOKEN_*`   |
| core-workflow  | `core-workflow`  | `dev`, `staging`, `prod` | `CORE_WORKFLOW_DOPPLER_TOKEN_*`  |
| core-websocket | `core-websocket` | `dev`, `staging`, `prod` | `CORE_WEBSOCKET_DOPPLER_TOKEN_*` |
| core-lookup    | `core-lookup`    | `dev`, `staging`, `prod` | `CORE_LOOKUP_DOPPLER_TOKEN_*`    |
| core-document  | `core-document`  | `dev`, `staging`, `prod` | `CORE_DOCUMENT_DOPPLER_TOKEN_*`  |

> Replace `*` with `_DEV`, `_STAGING`, `_PROD` or use environment-scoped secrets in GitHub.

---

## 18) Kubernetes Manifests (Per Service Templates)

**Secret Sync (once per service/env):**

```yaml
apiVersion: secrets.doppler.com/v1alpha1
kind: DopplerSecret
metadata:
  name: api-config
  namespace: apps
spec:
  tokenSecret:
    name: doppler-token-secret
    namespace: doppler-operator-system
  project: api
  config: prod
  managedSecret:
    name: api-env
    namespace: apps
    type: Opaque
  resyncSeconds: 120
```

**Deployment env wiring:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: apps
spec:
  template:
    spec:
      containers:
        - name: api
          image: your-registry/api:<<tag>>
          envFrom:
            - secretRef:
                name: api-env
```

Duplicate the pattern for each service (`core-email-env`, `core-slack-env`, etc.).

## 📋 Migration Checklist (From .env to Doppler)

### Pre-Migration Assessment

- [ ] **Audit current secrets**: Document all `.env` files and their contents
- [ ] **Identify owners**: Assign responsibility for each service's secrets
- [ ] **Security review**: Identify high-risk credentials requiring immediate rotation
- [ ] **Dependency mapping**: Document which services depend on which secrets

### Migration Steps (Per Service)

- [ ] **Export & sanitize**: Export current `.env` and remove any test/dummy values
- [ ] **Normalize keys**: Align with standardized naming conventions (UPPER_SNAKE_CASE)
- [ ] **Create Doppler projects**: Set up `dev`, `staging`, `prod` configurations
- [ ] **Import secrets**: Bulk import normalized secrets into Doppler
- [ ] **Update application**: Add configuration validation and Doppler integration
- [ ] **Test locally**: Verify `doppler run --` works with existing functionality
- [ ] **Deploy staging**: Test staging deployment with Doppler integration
- [ ] **Deploy production**: Switch production to Doppler-managed secrets
- [ ] **Cleanup**: Remove `.env` files from repositories (keep `.env.example`)

### Post-Migration Validation

- [ ] **Health checks**: Verify all services start successfully
- [ ] **Integration tests**: Run full test suite against Doppler-managed environment
- [ ] **Monitoring**: Confirm secret loading metrics and alerts are working
- [ ] **Documentation**: Update runbooks and deployment procedures
- [ ] **Training**: Ensure team knows how to manage secrets via Doppler

### Rollback Plan

- [ ] **Backup strategy**: Keep previous `.env` configurations in secure backup
- [ ] **Rollback procedure**: Document steps to revert to `.env` if needed
- [ ] **Time limit**: Set 48h window for rollback decision
- [ ] **Success criteria**: Define metrics that indicate successful migration

---

## 20) Verification Commands (Copy/Paste)

```sh
# Confirm service sees secrets
cd services/api && doppler run -p api -c dev -- node -e "console.log(!!process.env.KEYCLOAK_CLIENT_SECRET)"

# Show effective env without writing to disk
doppler secrets download --no-file --format env | sed -n '1,40p'

# Generate a 1h ephemeral token (staging)
doppler configs tokens create ci-api -p api -c staging --max-age 1h --plain

# Run compose with secrets injected (runtime injection)
doppler run -- docker compose up --build
```

---

## 21) Open Items / Next Iteration Hooks

- [ ] Decide **Option A vs B** per service for Docker runtime secrets.
- [ ] Confirm whether `core-email`, `core-slack`, `core-sms` persist history (turn on `TYPEORM_URL` if yes).
- [ ] Add **per-service Zod schemas** mirroring the contracts in §16.
- [ ] Add **runbooks**: incident response for leaked secrets, rotation scripts, rollback.
- [ ] Add **env diffs CI check**: fail PR if `docs/config/<service>.md` changed but Zod schema wasn’t updated.
- [ ] Add **Doppler → GitHub sync** for Codespaces (optional), or rely solely on `doppler run`.
- [ ] Define **RBAC** for Doppler projects (who can edit prod secrets?).
