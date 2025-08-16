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
import { ConfigModule } from '@nestjs/config';
import { SecurityModule } from './shared/security';
import { OpaModule } from './opa/opa.module';

// ✨ NEW: Import Doppler configuration
import { DopplerConfigModule } from './shared/config/doppler-config.module';

// Create service-specific logger factory for the main app
const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');

// ✨ NEW: Dynamic Doppler Configuration Factory
const createDopplerConfig = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Map environments to Doppler configs
  const configMap: Record<string, string> = {
    development: 'dev_main',
    staging: 'staging_main',
    production: 'prd_main',
    test: 'test_main',
  };

  const config = {
    project: process.env.DOPPLER_PROJECT || 'gs-scaffold-api',
    config: process.env.DOPPLER_CONFIG || configMap[nodeEnv] || 'dev_main',
    enableFallback: nodeEnv !== 'production',
    enableLogging: nodeEnv === 'development',
    strict: nodeEnv === 'production',
    isGlobal: true,
  };

  console.log(
    `🔧 Doppler Configuration: ${config.project}/${config.config} (${nodeEnv})`,
  );

  return config;
};

@Module({
  imports: [
    // ✨ UPDATED: Dynamic Doppler Configuration (replaces hardcoded .env)
    DopplerConfigModule.forRoot(createDopplerConfig()),

    // ✨ KEEP: Standard ConfigModule for compatibility with existing code
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // Fallback for non-Doppler secrets
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(EnhancedTraceMiddleware).forRoutes('*');
  }
}
