/**
 * Configuration Loader with Doppler Support
 *
 * This module provides configuration loading with support for:
 * - Doppler secrets management
 * - Traditional environment variables (backward compatibility)
 * - Environment-specific validation
 * - Configuration schema validation
 */

import {
  AppConfigSchema,
  AppConfig,
  Environment,
  validateEnvironmentConfig,
} from './app-config.schema';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ConfigLoadOptions {
  /** Force loading from specific source */
  source?: 'doppler' | 'env' | 'auto';
  /** Environment to validate against */
  environment?: Environment;
  /** Enable strict validation (fail on warnings) */
  strict?: boolean;
  /** Doppler project name */
  dopplerProject?: string;
  /** Doppler config/environment name */
  dopplerConfig?: string;
}

export interface ConfigLoadResult {
  config: AppConfig;
  source: 'doppler' | 'env' | 'mixed';
  errors: string[];
  warnings: string[];
  dopplerAvailable: boolean;
}

/**
 * Configuration Loader Class
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private cachedConfig: AppConfig | null = null;
  private dopplerAvailable: boolean | null = null;

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Check if Doppler CLI is available and configured
   */
  async isDopplerAvailable(): Promise<boolean> {
    if (this.dopplerAvailable !== null) {
      return this.dopplerAvailable;
    }

    try {
      await execAsync('doppler me');
      this.dopplerAvailable = true;
      return true;
    } catch {
      this.dopplerAvailable = false;
      return false;
    }
  }

  /**
   * Load configuration from Doppler
   */
  async loadFromDoppler(
    options: ConfigLoadOptions = {},
  ): Promise<Record<string, string>> {
    const project = options.dopplerProject || 'gs-scaffold-api';
    const config = options.dopplerConfig || 'dev';

    try {
      // Use doppler secrets to get all secrets as JSON
      const command = `doppler secrets --project ${project} --config ${config} --format json`;
      const { stdout } = await execAsync(command);

      const secrets = JSON.parse(stdout) as Record<string, unknown>;

      // Convert to flat key-value pairs
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(secrets)) {
        result[key] = String(value);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to load configuration from Doppler: ${error}`);
    }
  }

  /**
   * Load configuration from process.env
   */
  loadFromEnv(): Record<string, string> {
    const result: Record<string, string> = {};
    
    // Get all environment variables that match our schema
    for (const key of Object.keys(process.env)) {
      const value = process.env[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Map legacy environment variable names to new Doppler secret names
   */
  mapLegacyVariables(env: Record<string, string>): Record<string, string> {
    const mapped = { ...env };

    // Legacy mappings from current .env files to new Doppler names
    const legacyMappings: Record<string, string> = {
      // Core Application
      NODE_ENV: 'APP_RUNTIME_ENVIRONMENT',
      APP_NAME: 'APP_CORE_NAME',
      APP_VERSION: 'APP_CORE_VERSION',
      PORT: 'APP_SERVER_PORT',
      PROTOCOL: 'APP_SERVER_PROTOCOL',
      HOST: 'APP_SERVER_HOST',
      PUBLIC_API_URL: 'APP_SERVER_PUBLIC_URL',
      STAGING_API_URL: 'APP_SERVER_STAGING_URL',

      // Database
      DATABASE_URL: 'DATABASE_POSTGRES_URL',
      DATABASE_HOST: 'DATABASE_POSTGRES_HOST',
      DATABASE_PORT: 'DATABASE_POSTGRES_PORT',
      DATABASE_NAME: 'DATABASE_POSTGRES_NAME',
      DATABASE_USER: 'DATABASE_POSTGRES_USER',
      DATABASE_PASSWORD: 'DATABASE_POSTGRES_PASSWORD',
      DATABASE_SSL: 'DATABASE_POSTGRES_SSL_ENABLED',
      DATABASE_SSL_REJECT_UNAUTHORIZED:
        'DATABASE_POSTGRES_SSL_REJECT_UNAUTHORIZED',
      DATABASE_POOL_MIN: 'DATABASE_POSTGRES_POOL_MIN',
      DATABASE_POOL_MAX: 'DATABASE_POSTGRES_POOL_MAX',

      // Cache/Redis
      REDIS_URL: 'CACHE_REDIS_URL',
      REDIS_PASSWORD: 'CACHE_REDIS_PASSWORD',

      // EventStore
      ESDB_CONNECTION_STRING: 'EVENTSTORE_ESDB_CONNECTION_STRING',

      // Authentication
      KEYCLOAK_URL: 'AUTH_KEYCLOAK_URL',
      KEYCLOAK_REALM: 'AUTH_KEYCLOAK_REALM',
      KEYCLOAK_CLIENT_ID: 'AUTH_KEYCLOAK_CLIENT_ID',
      KEYCLOAK_CLIENT_SECRET: 'AUTH_KEYCLOAK_CLIENT_SECRET',
      JWT_AUDIENCE: 'AUTH_JWT_AUDIENCE',
      JWKS_CACHE_MAX_AGE: 'AUTH_JWKS_CACHE_MAX_AGE',
      JWKS_REQUESTS_PER_MINUTE: 'AUTH_JWKS_REQUESTS_PER_MINUTE',
      JWKS_TIMEOUT_MS: 'AUTH_JWKS_TIMEOUT_MS',

      // Security
      PII_ENCRYPTION_KEY: 'SECURITY_PII_ENCRYPTION_KEY',
      OPA_URL: 'SECURITY_OPA_URL',
      OPA_TIMEOUT_MS: 'SECURITY_OPA_TIMEOUT_MS',
      OPA_DECISION_LOGS: 'SECURITY_OPA_DECISION_LOGS_ENABLED',
      OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD:
        'SECURITY_OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS:
        'SECURITY_OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS',
      OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD:
        'SECURITY_OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD',
      CORS_ALLOWED_ORIGINS: 'SECURITY_CORS_ALLOWED_ORIGINS',
      CORS_ALLOW_CREDENTIALS: 'SECURITY_CORS_ALLOW_CREDENTIALS',

      // Logging
      LOG_LEVEL: 'LOGGING_CORE_LEVEL',
      LOGGER_LEVEL: 'LOGGING_CORE_LEVEL',
      PINO_LOG_LEVEL: 'LOGGING_CORE_LEVEL',
      LOG_SINK: 'LOGGING_CORE_SINK',
      PRETTY_LOGS: 'LOGGING_CORE_PRETTY_ENABLED',
      LOKI_URL: 'LOGGING_LOKI_URL',
      LOKI_BASIC_AUTH: 'LOGGING_LOKI_BASIC_AUTH',
      ES_NODE: 'LOGGING_ELASTICSEARCH_NODE',
      ES_INDEX: 'LOGGING_ELASTICSEARCH_INDEX',

      // Infrastructure
      DOCKER_CONTAINER: 'INFRA_CONTAINER_DOCKER_ENABLED',
      CONTAINER_HOST: 'INFRA_CONTAINER_HOST',
      HOSTNAME: 'INFRA_SYSTEM_HOSTNAME',
      KUBERNETES_SERVICE_HOST: 'INFRA_KUBERNETES_SERVICE_HOST',
    };

    // Apply legacy mappings
    for (const [legacyKey, newKey] of Object.entries(legacyMappings)) {
      if (env[legacyKey] && !mapped[newKey]) {
        mapped[newKey] = env[legacyKey];
      }
    }

    return mapped;
  }

  /**
   * Load and validate configuration from available sources
   */
  async loadConfig(options: ConfigLoadOptions = {}): Promise<ConfigLoadResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let source: 'doppler' | 'env' | 'mixed' = 'env';
    let rawConfig: Record<string, string> = {};

    // Determine source strategy
    const dopplerAvailable = await this.isDopplerAvailable();
    const useSource = options.source || 'auto';

    if (useSource === 'doppler' || (useSource === 'auto' && dopplerAvailable)) {
      try {
        rawConfig = await this.loadFromDoppler(options);
        source = 'doppler';
      } catch (error) {
        warnings.push(`Failed to load from Doppler: ${error}`);
        if (useSource === 'doppler') {
          errors.push('Doppler loading failed and was explicitly requested');
        } else {
          // Fall back to environment variables
          rawConfig = this.loadFromEnv();
          source = 'mixed';
          warnings.push('Falling back to environment variables');
        }
      }
    } else {
      rawConfig = this.loadFromEnv();
      source = 'env';
    }

    // Apply legacy variable mapping
    const mappedConfig = this.mapLegacyVariables(rawConfig);

    // Add warning for legacy variable usage
    for (const legacyKey of Object.keys(rawConfig)) {
      const isLegacy =
        legacyKey in
        {
          NODE_ENV: true,
          APP_NAME: true,
          PORT: true,
          DATABASE_PASSWORD: true,
          KEYCLOAK_CLIENT_SECRET: true,
          REDIS_URL: true,
          LOG_LEVEL: true,
        };
      if (isLegacy && source === 'env') {
        warnings.push(`Using legacy environment variable: ${legacyKey}`);
      }
    }

    // Validate and parse configuration
    try {
      const config = AppConfigSchema.parse(mappedConfig);

      // Environment-specific validation
      const environment = options.environment || config.APP_RUNTIME_ENVIRONMENT;
      const validation = validateEnvironmentConfig(config, environment);

      errors.push(...validation.errors);
      warnings.push(...validation.warnings);

      // Cache successful configuration
      if (errors.length === 0) {
        this.cachedConfig = config;
      }

      return {
        config,
        source,
        errors,
        warnings,
        dopplerAvailable,
      };
    } catch (zodError: unknown) {
      const parseErrors: string[] = [];
      if (zodError && typeof zodError === 'object' && 'errors' in zodError) {
        const zodErrorObj = zodError as {
          errors?: Array<{ path: string[]; message: string }>;
        };
        if (zodErrorObj.errors) {
          parseErrors.push(
            ...zodErrorObj.errors.map(
              (e) => `${e.path.join('.')}: ${e.message}`,
            ),
          );
        }
      } else {
        parseErrors.push(String(zodError));
      }
      errors.push(...parseErrors);

      // Return partial config with errors
      return {
        config: {} as AppConfig,
        source,
        errors,
        warnings,
        dopplerAvailable,
      };
    }
  }

  /**
   * Get cached configuration (load if not cached)
   */
  async getConfig(options: ConfigLoadOptions = {}): Promise<AppConfig> {
    if (this.cachedConfig && !options.source) {
      return this.cachedConfig;
    }

    const result = await this.loadConfig(options);

    if (result.errors.length > 0) {
      throw new Error(
        `Configuration validation failed:\n${result.errors.join('\n')}`,
      );
    }

    return result.config;
  }

  /**
   * Clear cached configuration (useful for testing)
   */
  clearCache(): void {
    this.cachedConfig = null;
    this.dopplerAvailable = null;
  }
}

/**
 * Convenience function to load configuration
 */
export async function loadConfig(
  options: ConfigLoadOptions = {},
): Promise<ConfigLoadResult> {
  const loader = ConfigLoader.getInstance();
  return loader.loadConfig(options);
}

/**
 * Convenience function to get validated configuration
 */
export async function getConfig(
  options: ConfigLoadOptions = {},
): Promise<AppConfig> {
  const loader = ConfigLoader.getInstance();
  return loader.getConfig(options);
}
