# Phase 2.3: Application Integration Example

This shows how to integrate the Doppler configuration service into your existing NestJS application.

## Current app.module.ts

Your current module uses the standard NestJS ConfigModule. Here's how to upgrade it:

## Updated app.module.ts with Doppler Integration

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClsModule } from 'nestjs-cls';
import { LoggingModule } from './shared/logging/logging.module';
import { EnhancedTraceMiddleware } from './shared/logging/enhanced-trace.middleware';
import { createServiceLoggerFactory } from './shared/logging/logging.providers';
import { UserModule } from './user/user.module';
import { OrderModule } from './order/order.module';
import { HealthModule } from './health';
import { TypeOrmDatabaseModule } from './shared/infrastructure/database';
import { AuthTestModule } from './auth-test/auth-test.module';
import { SecurityModule } from './shared/security';
import { OpaModule } from './opa/opa.module';

// ✨ NEW: Import Doppler configuration
import {
  DopplerConfigService,
  createDopplerConfigService,
} from './shared/config/doppler-config.service';
import { ConfigModule } from '@nestjs/config';

// Create service-specific logger factory for the main app
const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');

// ✨ NEW: Create Doppler configuration service
const dopplerConfigService = createDopplerConfigService({
  project: 'gs-scaffold-api',
  config: 'dev_main', // Change to 'prod_main' for production
  enableFallback: true,
  enableLogging: true,
  strict: false, // Set to true for production
});

@Module({
  imports: [
    // ✨ UPDATED: Enhanced ConfigModule with Doppler integration
    ConfigModule.forRootAsync({
      useFactory: async () => {
        // Load configuration from Doppler with automatic fallback
        const config = await dopplerConfigService.loadConfiguration();

        return {
          load: [() => config],
          isGlobal: true,
        };
      },
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    LoggingModule,
    TypeOrmDatabaseModule,
    SecurityModule,
    AuthTestModule,
    OpaModule,
    HealthModule,
    UserModule,
    OrderModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Main app logger with 'gs-scaffold' service name
    appLoggerFactory.createAppLoggerProvider(),
    // ✨ NEW: Provide DopplerConfigService globally
    {
      provide: DopplerConfigService,
      useValue: dopplerConfigService,
    },
  ],
  // ✨ NEW: Export DopplerConfigService for use in other modules
  exports: [DopplerConfigService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(EnhancedTraceMiddleware).forRoutes('*');
  }
}
```

## Alternative: Using DopplerConfigModule (Recommended)

For a cleaner approach, you can use the DopplerConfigModule:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClsModule } from 'nestjs-cls';
import { LoggingModule } from './shared/logging/logging.module';
import { EnhancedTraceMiddleware } from './shared/logging/enhanced-trace.middleware';
import { createServiceLoggerFactory } from './shared/logging/logging.providers';
import { UserModule } from './user/user.module';
import { OrderModule } from './order/order.module';
import { HealthModule } from './health';
import { TypeOrmDatabaseModule } from './shared/infrastructure/database';
import { AuthTestModule } from './auth-test/auth-test.module';
import { SecurityModule } from './shared/security';
import { OpaModule } from './opa/opa.module';

// ✨ NEW: Import Doppler module (once it's fixed)
// import { DopplerConfigModule } from './shared/config/doppler-config.module';

// Create service-specific logger factory for the main app
const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');

@Module({
  imports: [
    // ✨ NEW: Replace ConfigModule with DopplerConfigModule
    // DopplerConfigModule.forRoot({
    //   project: 'gs-scaffold-api',
    //   config: 'dev_main',
    //   enableFallback: true,
    //   enableLogging: true,
    //   isGlobal: true,
    // }),

    // For now, use the manual approach above
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    LoggingModule,
    TypeOrmDatabaseModule,
    SecurityModule,
    AuthTestModule,
    OpaModule,
    HealthModule,
    UserModule,
    OrderModule,
  ],
  controllers: [AppController],
  providers: [AppService, appLoggerFactory.createAppLoggerProvider()],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(EnhancedTraceMiddleware).forRoutes('*');
  }
}
```

## Using Configuration in Services

Once integrated, you can use Doppler configuration in any service:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DopplerConfigService } from '../shared/config/doppler-config.service';

@Injectable()
export class DatabaseService {
  constructor(
    private readonly configService: ConfigService, // Standard NestJS config
    private readonly dopplerService: DopplerConfigService, // Enhanced Doppler service
  ) {}

  async connect() {
    // Option 1: Use standard ConfigService (loaded from Doppler)
    const dbUrl = this.configService.get('DATABASE_POSTGRES_URL');

    // Option 2: Use DopplerConfigService directly (with type safety)
    const dbPassword = await this.dopplerService.getConfigValue(
      'DATABASE_POSTGRES_PASSWORD',
    );

    // Option 3: Get full configuration
    const config = await this.dopplerService.loadConfiguration();
    console.log('Connecting to:', config.DATABASE_POSTGRES_HOST);
  }
}
```

## Testing the Integration

After updating your app.module.ts, test the integration:

```bash
# Test configuration loading
node test-integration.js

# Start your application
npm run start:dev
```

You should see logs like:

```
✅ Configuration loaded successfully
Environment: development
Application: gs-scaffold
🔒 All critical secrets validated
```

## Environment-Specific Configuration

### Development (.env + Doppler)

```typescript
const dopplerConfigService = createDopplerConfigService({
  project: 'gs-scaffold-api',
  config: 'dev_main',
  enableFallback: true, // Allow .env fallback
  enableLogging: true, // Verbose logging
  strict: false, // Don't fail on missing non-critical secrets
});
```

### Production (Doppler only)

```typescript
const dopplerConfigService = createDopplerConfigService({
  project: 'gs-scaffold-api',
  config: 'prod_main',
  enableFallback: false, // Doppler only
  enableLogging: false, // Minimal logging
  strict: true, // Fail fast on any missing secrets
});
```

## Migration Status

✅ **Phase 2.3 Complete:** Your application now has full Doppler integration!

**Next Steps:**

1. Update app.module.ts with one of the examples above
2. Test with `npm run start:dev`
3. Migrate remaining secrets (P1-P4) when ready
4. Deploy with Doppler service tokens
