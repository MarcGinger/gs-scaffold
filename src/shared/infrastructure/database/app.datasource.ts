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
 */
export const AppDataSource = new DataSource({
  type: 'postgres',

  // Connection from environment or fallback to local development
  url: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  host:
    !process.env.POSTGRES_URL && !process.env.DATABASE_URL
      ? AppConfigUtil.getDatabaseConfig().host
      : undefined,
  port:
    !process.env.POSTGRES_URL && !process.env.DATABASE_URL
      ? AppConfigUtil.getDatabaseConfig().port
      : undefined,
  database:
    !process.env.POSTGRES_URL && !process.env.DATABASE_URL
      ? AppConfigUtil.getDatabaseConfig().database
      : undefined,
  username:
    !process.env.POSTGRES_URL && !process.env.DATABASE_URL
      ? AppConfigUtil.getDatabaseConfig().username
      : undefined,
  password:
    !process.env.POSTGRES_URL && !process.env.DATABASE_URL
      ? AppConfigUtil.getDatabaseConfig().password
      : undefined,

  // Schema isolation - each service gets its own schema
  schema: process.env.DB_SCHEMA ?? 'gs_scaffold_read',

  // Production safety - NEVER enable synchronize in shared environments
  synchronize: false,

  // Selective logging - 'query' only for debugging
  logging:
    process.env.NODE_ENV === 'development'
      ? ['warn', 'error', 'migration']
      : ['warn', 'error'],

  // Performance monitoring
  maxQueryExecutionTime: Number(process.env.DB_SLOW_QUERY_THRESHOLD) || 500, // ms

  // Entity and migration discovery
  entities: [__dirname + '/../entities/*.entity.{ts,js}'],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],

  // PostgreSQL specific optimizations
  extra: {
    // Query timeout
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT) || 15000,

    // Application identification in PostgreSQL logs
    application_name: process.env.APP_NAME ?? 'gs-scaffold',

    // Connection pool settings (will be overridden by NestJS module)
    max: Number(process.env.DATABASE_POOL_MAX) || 10,
    min: Number(process.env.DATABASE_POOL_MIN) || 0,

    // SSL configuration
    ssl: AppConfigUtil.getDatabaseConfig().ssl,
  },

  // Connection pool configuration
  // These can be overridden by the TypeORM module
  connectTimeoutMS: Number(process.env.DB_CONNECT_TIMEOUT) || 10000,
  // acquireTimeoutMillis: Number(process.env.DB_ACQUIRE_TIMEOUT) || 10000, // Not supported in PostgreSQL driver
});
