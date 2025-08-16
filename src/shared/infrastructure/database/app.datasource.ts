import { DataSource } from 'typeorm';
import { AppConfigUtil } from '../../config/app-config.util';

/**
 * TypeORM DataSource Configuration
 *
 * Following the COPILOT_FRAMEWORK_TYPEORM guidelines:
 * - ESDB is authoritative; SQL is derivative
 * - One DB/schema per service
 * - synchronize: false for production safety
 * - Explicit entity and migration paths
 * - Performance monitoring enabled
 * - Centralized configuration management
 */

// Get centralized database configuration
const dbConfig = AppConfigUtil.getDatabaseConfig();

export const AppDataSource = new DataSource({
  type: 'postgres',

  // Connection from centralized configuration
  url: dbConfig.url,
  host: !dbConfig.url ? dbConfig.host : undefined,
  port: !dbConfig.url ? dbConfig.port : undefined,
  database: !dbConfig.url ? dbConfig.database : undefined,
  username: !dbConfig.url ? dbConfig.username : undefined,
  password: !dbConfig.url ? dbConfig.password : undefined,

  // Schema isolation - each service gets its own schema
  schema: dbConfig.schema,

  // Production safety - NEVER enable synchronize in shared environments
  synchronize: false,

  // Selective logging - 'query' only for debugging
  logging:
    AppConfigUtil.getEnvironment() === 'development'
      ? ['warn', 'error', 'migration']
      : ['warn', 'error'],

  // Performance monitoring
  maxQueryExecutionTime: dbConfig.maxQueryExecutionTime, // ms

  // Entity and migration discovery
  entities: [
    __dirname + '/../entities/*.entity.{ts,js}',
    __dirname +
      '/../../../catelog/product/infrastructure/typeorm/entities/*.entity.{ts,js}',
  ],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],

  // PostgreSQL specific optimizations
  extra: {
    // Query timeout
    statement_timeout: dbConfig.statementTimeout,

    // Application identification in PostgreSQL logs
    application_name: AppConfigUtil.getLoggingConfig().appName,

    // Connection pool settings (will be overridden by NestJS module)
    max: dbConfig.pool.max,
    min: dbConfig.pool.min,

    // SSL configuration
    ssl: dbConfig.ssl,
  },

  // Connection pool configuration
  // These can be overridden by the TypeORM module
  connectTimeoutMS: dbConfig.connectTimeoutMS,
  // acquireTimeoutMillis: Number(process.env.DB_ACQUIRE_TIMEOUT) || 10000, // Not supported in PostgreSQL driver
});
