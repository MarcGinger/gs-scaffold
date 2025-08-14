import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppDataSource } from './app.datasource';
import { ConfigModule } from '@nestjs/config';
import { DatabaseHealthService } from './database-health.service';

/**
 * TypeORM Database Module
 *
 * Provides PostgreSQL connectivity for read models and projections.
 * Following COPILOT_FRAMEWORK_TYPEORM principles:
 * - ESDB is source of truth, SQL is derivative
 * - One schema per service for isolation
 * - Health checks and observability
 * - Production-ready connection management
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => AppDataSource.options,
      dataSourceFactory: async () => {
        if (!AppDataSource.isInitialized) {
          await AppDataSource.initialize();
        }
        return AppDataSource;
      },
    }),
  ],
  providers: [
    {
      provide: 'DATA_SOURCE',
      useFactory: async (): Promise<DataSource> => {
        if (!AppDataSource.isInitialized) {
          await AppDataSource.initialize();
        }
        return AppDataSource;
      },
    },
    DatabaseHealthService,
  ],
  exports: ['DATA_SOURCE', DatabaseHealthService, TypeOrmModule],
})
export class TypeOrmDatabaseModule {}
