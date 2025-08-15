/**
 * Base Configuration Schema
 * 
 * Defines the foundational configuration schema using Zod validation.
 * This schema supports both traditional process.env and Doppler secret management.
 */

import { z } from 'zod';

// Environment enumeration
export const Environment = z.enum(['development', 'staging', 'production', 'test']);
export type Environment = z.infer<typeof Environment>;

// Log level enumeration
export const LogLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
export type LogLevel = z.infer<typeof LogLevel>;

// Log sink enumeration
export const LogSink = z.enum(['stdout', 'console', 'loki', 'elasticsearch']);
export type LogSink = z.infer<typeof LogSink>;

/**
 * Core Application Configuration Schema
 */
export const CoreConfigSchema = z.object({
  // Application Identification
  APP_CORE_NAME: z.string().min(1).default('gs-scaffold'),
  APP_CORE_VERSION: z.string().min(1).default('0.0.1'),
  APP_RUNTIME_ENVIRONMENT: Environment.default('development'),

  // Server Configuration
  APP_SERVER_PORT: z.coerce.number().int().min(1000).max(65535).default(3000),
  APP_SERVER_PROTOCOL: z.enum(['http', 'https']).default('http'),
  APP_SERVER_HOST: z.string().min(1).default('localhost'),
  APP_SERVER_PUBLIC_URL: z.string().url().optional(),
  APP_SERVER_STAGING_URL: z.string().url().optional(),
});

/**
 * Database Configuration Schema
 */
export const DatabaseConfigSchema = z.object({
  // Primary connection options (URL takes precedence)
  DATABASE_POSTGRES_URL: z.string().url().optional(),
  
  // Individual connection components
  DATABASE_POSTGRES_HOST: z.string().min(1).default('localhost'),
  DATABASE_POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_POSTGRES_NAME: z.string().min(1).default('postgres'),
  DATABASE_POSTGRES_USER: z.string().min(1).default('postgres'),
  DATABASE_POSTGRES_PASSWORD: z.string().min(1),

  // SSL Configuration
  DATABASE_POSTGRES_SSL_ENABLED: z.coerce.boolean().default(false),
  DATABASE_POSTGRES_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),

  // Connection Pool
  DATABASE_POSTGRES_POOL_MIN: z.coerce.number().int().min(0).default(0),
  DATABASE_POSTGRES_POOL_MAX: z.coerce.number().int().min(1).default(10),
});

/**
 * Cache/Redis Configuration Schema
 */
export const CacheConfigSchema = z.object({
  CACHE_REDIS_URL: z.string().url(),
  CACHE_REDIS_PASSWORD: z.string().optional(),
});

/**
 * EventStore Configuration Schema
 */
export const EventStoreConfigSchema = z.object({
  EVENTSTORE_ESDB_CONNECTION_STRING: z.string().url(),
});

/**
 * Authentication Configuration Schema
 */
export const AuthConfigSchema = z.object({
  // Keycloak Configuration
  AUTH_KEYCLOAK_URL: z.string().url().default('http://localhost:8080'),
  AUTH_KEYCLOAK_REALM: z.string().min(1).default('gs-scaffold'),
  AUTH_KEYCLOAK_CLIENT_ID: z.string().min(1).default('gs-scaffold-api'),
  AUTH_KEYCLOAK_CLIENT_SECRET: z.string().min(8),

  // JWT Configuration
  AUTH_JWT_AUDIENCE: z.string().min(1).default('gs-scaffold-api'),
  AUTH_JWKS_CACHE_MAX_AGE: z.coerce.number().int().min(60000).default(3600000), // 1 hour
  AUTH_JWKS_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_JWKS_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
});

/**
 * Security Configuration Schema
 */
export const SecurityConfigSchema = z.object({
  // PII Protection
  SECURITY_PII_ENCRYPTION_KEY: z.string().min(32), // Require minimum 32 characters for security

  // OPA Policy Service
  SECURITY_OPA_URL: z.string().url().default('http://localhost:8181'),
  SECURITY_OPA_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),
  SECURITY_OPA_DECISION_LOGS_ENABLED: z.coerce.boolean().default(true),
  SECURITY_OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(5),
  SECURITY_OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  SECURITY_OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD: z.coerce.number().int().min(1).default(3),

  // CORS Configuration
  SECURITY_CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  SECURITY_CORS_ALLOW_CREDENTIALS: z.coerce.boolean().default(true),
});

/**
 * Logging Configuration Schema
 */
export const LoggingConfigSchema = z.object({
  // Core Logging
  LOGGING_CORE_LEVEL: LogLevel.default('info'),
  LOGGING_CORE_SINK: LogSink.default('stdout'),
  LOGGING_CORE_PRETTY_ENABLED: z.coerce.boolean().default(false),

  // Loki Configuration (when sink=loki)
  LOGGING_LOKI_URL: z.string().url().optional(),
  LOGGING_LOKI_BASIC_AUTH: z.string().optional(),

  // Elasticsearch Configuration (when sink=elasticsearch)
  LOGGING_ELASTICSEARCH_NODE: z.string().url().optional(),
  LOGGING_ELASTICSEARCH_INDEX: z.string().min(1).default('app-logs'),
});

/**
 * Infrastructure Configuration Schema
 */
export const InfrastructureConfigSchema = z.object({
  INFRA_CONTAINER_DOCKER_ENABLED: z.coerce.boolean().optional(),
  INFRA_CONTAINER_HOST: z.string().optional(),
  INFRA_SYSTEM_HOSTNAME: z.string().optional(),
  INFRA_KUBERNETES_SERVICE_HOST: z.string().optional(),
});

/**
 * Complete Application Configuration Schema
 * Combines all configuration schemas
 */
export const AppConfigSchema = CoreConfigSchema
  .merge(DatabaseConfigSchema)
  .merge(CacheConfigSchema)
  .merge(EventStoreConfigSchema)
  .merge(AuthConfigSchema)
  .merge(SecurityConfigSchema)
  .merge(LoggingConfigSchema)
  .merge(InfrastructureConfigSchema);

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Environment-specific validation rules
 */
export const EnvironmentValidationRules = {
  development: {
    requiredSecrets: [
      'SECURITY_PII_ENCRYPTION_KEY',
      'DATABASE_POSTGRES_PASSWORD',
    ],
    optionalSecrets: [
      'AUTH_KEYCLOAK_CLIENT_SECRET',
    ],
  },
  staging: {
    requiredSecrets: [
      'SECURITY_PII_ENCRYPTION_KEY',
      'DATABASE_POSTGRES_PASSWORD',
      'AUTH_KEYCLOAK_CLIENT_SECRET',
      'CACHE_REDIS_URL',
      'EVENTSTORE_ESDB_CONNECTION_STRING',
    ],
  },
  production: {
    requiredSecrets: [
      'SECURITY_PII_ENCRYPTION_KEY',
      'DATABASE_POSTGRES_PASSWORD',
      'AUTH_KEYCLOAK_CLIENT_SECRET',
      'CACHE_REDIS_URL',
      'EVENTSTORE_ESDB_CONNECTION_STRING',
    ],
    securityRules: {
      // Production must use HTTPS for external URLs
      httpsRequired: true,
      // No hardcoded fallbacks allowed
      fallbacksDisallowed: true,
      // Logging optimizations required
      prettyLogsDisallowed: true,
    },
  },
  test: {
    requiredSecrets: [
      'SECURITY_PII_ENCRYPTION_KEY',
    ],
  },
};

/**
 * Validate configuration for environment-specific requirements
 */
export function validateEnvironmentConfig(
  config: AppConfig,
  environment: Environment,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rules = EnvironmentValidationRules[environment];

  // Check required secrets
  if (rules.requiredSecrets) {
    for (const secret of rules.requiredSecrets) {
      const value = (config as any)[secret];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`Required secret ${secret} is missing for ${environment} environment`);
      }
    }
  }

  // Production-specific security rules
  if (environment === 'production') {
    const productionRules = EnvironmentValidationRules.production;
    if (productionRules.securityRules) {
      if (productionRules.securityRules.httpsRequired) {
        if (config.AUTH_KEYCLOAK_URL.startsWith('http://')) {
          errors.push('HTTPS required for AUTH_KEYCLOAK_URL in production');
        }
        if (config.APP_SERVER_PROTOCOL === 'http') {
          warnings.push('Consider using HTTPS for APP_SERVER_PROTOCOL in production');
        }
      }

      if (productionRules.securityRules.prettyLogsDisallowed && config.LOGGING_CORE_PRETTY_ENABLED) {
        errors.push('LOGGING_CORE_PRETTY_ENABLED must be false in production for performance');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
