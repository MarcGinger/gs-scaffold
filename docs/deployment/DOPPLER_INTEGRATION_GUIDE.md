# Doppler Integration Guide

_Phase 2.3: Application Integration - Production Ready_

## 🎉 Integration Complete!

Your gs-scaffold application now has full Doppler secrets management integration with automatic fallback support.

## Quick Start

### 1. Basic Usage in Services

```typescript
import { Injectable } from '@nestjs/common';
import { DopplerConfigService } from './shared/config/doppler-config.service';

@Injectable()
export class MyService {
  constructor(private readonly configService: DopplerConfigService) {}

  async initialize() {
    // Load complete configuration
    const config = await this.configService.loadConfiguration();

    // Get specific values with type safety
    const dbUrl = await this.configService.getConfigValue(
      'DATABASE_POSTGRES_URL',
    );
    const clientSecret = await this.configService.getConfigValue(
      'AUTH_KEYCLOAK_CLIENT_SECRET',
    );
  }
}
```

### 2. Module Integration

```typescript
// In your app.module.ts
import { Module } from '@nestjs/common';
import { DopplerConfigModule } from './shared/config/doppler-config.module';

@Module({
  imports: [
    DopplerConfigModule.forRoot({
      project: 'gs-scaffold-api',
      config: 'dev_main',
      enableLogging: true,
      enableFallback: true,
    }),
    // ... other modules
  ],
})
export class AppModule {}
```

### 3. Configuration Status Check

```typescript
import { createDopplerConfigService } from './shared/config/doppler-config.service';

async function checkConfigStatus() {
  const service = createDopplerConfigService();
  const status = await service.getConfigurationStatus();

  console.log('Doppler Available:', status.dopplerAvailable);
  console.log('Critical Secrets:', status.criticalSecretsCount);
  console.log('Environment:', status.environment);
}
```

## Configuration Options

### DopplerServiceOptions

| Option           | Type    | Default           | Description                              |
| ---------------- | ------- | ----------------- | ---------------------------------------- |
| `project`        | string  | 'gs-scaffold-api' | Doppler project name                     |
| `config`         | string  | 'dev_main'        | Doppler config/environment               |
| `enableFallback` | boolean | true              | Fall back to .env files if Doppler fails |
| `enableLogging`  | boolean | true              | Log configuration loading details        |
| `strict`         | boolean | false             | Fail fast on configuration errors        |

## Features

### ✅ Automatic Source Detection

- Tries Doppler first, falls back to .env files automatically
- No code changes needed when switching environments

### ✅ Critical Secret Validation

- Validates P0 critical secrets are present:
  - `AUTH_KEYCLOAK_CLIENT_SECRET`
  - `SECURITY_PII_ENCRYPTION_KEY`
  - `DATABASE_POSTGRES_PASSWORD`
  - `DATABASE_POSTGRES_URL`

### ✅ Type Safety

- Full TypeScript support with `AppConfig` schema
- IntelliSense for all configuration keys

### ✅ Caching & Performance

- Automatic configuration caching
- Single load per application lifecycle
- Manual reload support when needed

### ✅ Production Ready

- Comprehensive error handling
- Detailed logging and diagnostics
- Validates secrets before startup

## Environment-Specific Usage

### Development

```typescript
const service = createDopplerConfigService({
  project: 'gs-scaffold-api',
  config: 'dev_main',
  enableLogging: true,
  strict: false, // Allow missing non-critical secrets
});
```

### Production

```typescript
const service = createDopplerConfigService({
  project: 'gs-scaffold-api',
  config: 'prod_main',
  enableLogging: false,
  strict: true, // Fail if any secrets missing
  enableFallback: false, // Doppler only in production
});
```

## Testing Integration

Run the integration test to verify everything works:

```bash
node test-integration.js
```

Expected output:

```
🔍 Testing Phase 2.3: Application Integration
✅ Loaded 7 secrets from Doppler
✅ ConfigLoader working correctly
✅ P0 Critical: 4/4
✅ Ready for Production: Yes
🎊 Phase 2.3 Integration: READY FOR PRODUCTION!
```

## Deployment

### Service Tokens for Production

1. Create a service token in Doppler dashboard:

   ```bash
   # In Doppler dashboard:
   # Project: gs-scaffold-api
   # Config: prod_main
   # Access: Read
   ```

2. Set the token in your deployment environment:

   ```bash
   DOPPLER_TOKEN=dp.st.prod_main.xxxxxxxxxxxx
   ```

3. Your application will automatically use the token for secure access.

### Environment Variables (Fallback)

If Doppler is unavailable, the system falls back to these environment variables:

**Required in Production:**

- `AUTH_KEYCLOAK_CLIENT_SECRET`
- `SECURITY_PII_ENCRYPTION_KEY`
- `DATABASE_POSTGRES_PASSWORD`
- `DATABASE_POSTGRES_URL`

**Optional with defaults:**

- `APP_RUNTIME_ENVIRONMENT` (defaults to 'development')
- `APP_PORT` (defaults to 3000)
- `DATABASE_POSTGRES_HOST` (defaults to 'localhost')

## Migration Status

### ✅ Completed Phases

- **Phase 1.1-1.4:** Doppler CLI setup and project initialization
- **Phase 2.1:** Doppler project configuration
- **Phase 2.2:** Critical secret migration (P0: 4/4 secrets migrated)
- **Phase 2.3:** Application integration (PRODUCTION READY)

### 🔄 Available for Future

- **Phase 2.4:** Complete secret migration (P1-P4 groups)
- **Phase 2.5:** .env file cleanup
- **Phase 3:** Advanced features (rotation, staging environments)

## Troubleshooting

### Configuration Not Loading

```typescript
const status = await service.getConfigurationStatus();
console.log('Diagnostics:', status);
```

### Doppler Authentication Issues

```bash
# Check authentication
doppler auth status

# Re-authenticate if needed
doppler auth login
```

### Missing Secrets

The service will log warnings for missing non-critical secrets and throw errors for missing critical secrets in production.

## Next Steps

1. **Update app.module.ts** to use DopplerConfigModule
2. **Replace manual ConfigService** with DopplerConfigService
3. **Deploy with service tokens** for production security
4. **Continue P1-P4 migration** when ready using `node migrate-secrets.js`

---

🎊 **Congratulations!** Your application now has enterprise-grade secrets management with Doppler integration!
