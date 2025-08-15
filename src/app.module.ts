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

// Create service-specific logger factory for the main app
const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // makes config available app-wide
      envFilePath: '.env', // can be array for multiple files
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    LoggingModule,
    TypeOrmDatabaseModule,
    SecurityModule,
    AuthTestModule,
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
