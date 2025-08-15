/**
 * Enhanced Configuration Validator
 *
 * Integrates with existing AppConfigUtil while adding Doppler support
 * and comprehensive validation capabilities.
 */

import { AppConfigUtil } from './app-config.util';
import { AppConfig, Environment } from './app-config.schema';
import { getConfig, loadConfig } from './config-loader';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  environment: Environment;
  source: 'doppler' | 'env' | 'mixed';
}

export interface ValidationOptions {
  /** Force validation against specific environment */
  environment?: Environment;
  /** Enable strict mode (treat warnings as errors) */
  strict?: boolean;
  /** Source preference for configuration loading */
  source?: 'doppler' | 'env' | 'auto';
}

/**
 * Enhanced Configuration Validator
 */
export class ConfigValidator {
  private static instance: ConfigValidator;
  private validatedConfig: AppConfig | null = null;

  static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }

  /**
   * Validate configuration and provide comprehensive feedback
   */
  async validateConfiguration(
    options: ValidationOptions = {},
  ): Promise<ValidationResult> {
    try {
      // Load configuration using new schema-based loader
      const loadResult = await loadConfig({
        source: options.source,
        environment: options.environment,
        strict: options.strict,
      });

      const errors = [...loadResult.errors];
      const warnings = [...loadResult.warnings];
      const environment =
        options.environment || loadResult.config.APP_RUNTIME_ENVIRONMENT;

      // Additional legacy compatibility checks
      this.addLegacyCompatibilityChecks(loadResult.config, warnings, errors);

      // Production-specific validations
      if (environment === 'production') {
        this.addProductionValidations(loadResult.config, errors, warnings);
      }

      // Development-specific warnings
      if (environment === 'development') {
        this.addDevelopmentWarnings(loadResult.config, warnings);
      }

      // Service connectivity validations
      this.addServiceConnectivityChecks(loadResult.config, warnings);

      // Check if configuration is valid
      const valid = errors.length === 0 && (!options.strict || warnings.length === 0);

      if (valid) {
        this.validatedConfig = loadResult.config;
      }

      return {
        valid,
        errors,
        warnings,
        environment,
        source: loadResult.source,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Configuration loading failed: ${error}`],
        warnings: [],
        environment: 'development',
        source: 'env',
      };
    }
  }

  /**
   * Check for dangerous legacy patterns
   */
  private addLegacyCompatibilityChecks(
    config: AppConfig,
    warnings: string[],
    errors: string[],
  ): void {
    // Check for hardcoded fallback usage in PII encryption
    if (config.SECURITY_PII_ENCRYPTION_KEY === 'default-key-change-in-production') {
      errors.push(
        'SECURITY_PII_ENCRYPTION_KEY is using dangerous hardcoded fallback - this is a critical security risk',
      );
    }

    // Check for localhost URLs in non-development environments
    if (config.APP_RUNTIME_ENVIRONMENT !== 'development') {
      const localhostUrls = [
        { key: 'AUTH_KEYCLOAK_URL', value: config.AUTH_KEYCLOAK_URL },
        { key: 'SECURITY_OPA_URL', value: config.SECURITY_OPA_URL },
        { key: 'LOGGING_LOKI_URL', value: config.LOGGING_LOKI_URL },
        { key: 'LOGGING_ELASTICSEARCH_NODE', value: config.LOGGING_ELASTICSEARCH_NODE },
      ].filter(({ value }) => value?.includes('localhost'));

      for (const { key } of localhostUrls) {
        warnings.push(`${key} uses localhost in ${config.APP_RUNTIME_ENVIRONMENT} environment`);
      }
    }
  }

  /**
   * Production-specific security validations
   */
  private addProductionValidations(
    config: AppConfig,
    errors: string[],
    warnings: string[],
  ): void {
    // Security requirements
    if (config.LOGGING_CORE_PRETTY_ENABLED) {
      errors.push('LOGGING_CORE_PRETTY_ENABLED must be false in production for performance');
    }

    if (config.LOGGING_CORE_LEVEL === 'debug' || config.LOGGING_CORE_LEVEL === 'trace') {
      errors.push(`LOGGING_CORE_LEVEL=${config.LOGGING_CORE_LEVEL} will generate excessive logs in production`);
    }

    // HTTPS requirements
    if (config.APP_SERVER_PROTOCOL === 'http' && config.APP_SERVER_PUBLIC_URL) {
      warnings.push('Consider using HTTPS for public endpoints in production');
    }

    // Connection string security
    if (config.DATABASE_POSTGRES_URL?.includes('password=')) {
      warnings.push('Database URL contains embedded password - consider using separate credentials');
    }

    // SSL requirements
    if (!config.DATABASE_POSTGRES_SSL_ENABLED) {
      warnings.push('Database SSL is disabled in production');
    }
  }

  /**
   * Development environment recommendations
   */
  private addDevelopmentWarnings(
    config: AppConfig,
    warnings: string[],
  ): void {
    if (config.LOGGING_CORE_SINK !== 'console' && config.LOGGING_CORE_SINK !== 'loki') {
      warnings.push('Consider using console or loki logging sink for development');
    }

    if (!config.LOGGING_CORE_PRETTY_ENABLED) {
      warnings.push('Enable LOGGING_CORE_PRETTY_ENABLED for better development experience');
    }
  }

  /**
   * Service connectivity and configuration checks
   */
  private addServiceConnectivityChecks(
    config: AppConfig,
    warnings: string[],
  ): void {
    // JWT configuration consistency
    const expectedIssuer = `${config.AUTH_KEYCLOAK_URL}/realms/${config.AUTH_KEYCLOAK_REALM}`;
    // Note: We don't have direct access to the computed issuer from existing code,
    // but we can validate the components

    // Cache configuration recommendations
    if (config.AUTH_JWKS_CACHE_MAX_AGE < 300000) { // 5 minutes
      warnings.push('AUTH_JWKS_CACHE_MAX_AGE is very low, may impact performance');
    }

    // Circuit breaker configuration
    if (config.SECURITY_OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD > 10) {
      warnings.push('SECURITY_OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD is very high, may not protect against failures');
    }

    // Connection pool validation
    if (config.DATABASE_POSTGRES_POOL_MAX < 5) {
      warnings.push('DATABASE_POSTGRES_POOL_MAX is very low, may limit concurrency');
    }

    if (config.DATABASE_POSTGRES_POOL_MIN >= config.DATABASE_POSTGRES_POOL_MAX) {
      warnings.push('DATABASE_POSTGRES_POOL_MIN should be less than DATABASE_POSTGRES_POOL_MAX');
    }
  }

  /**
   * Get validated configuration (validate if not cached)
   */
  async getValidatedConfig(options: ValidationOptions = {}): Promise<AppConfig> {
    if (this.validatedConfig && !options.source && !options.environment) {
      return this.validatedConfig;
    }

    const validation = await this.validateConfiguration(options);

    if (!validation.valid) {
      const errorMessage = [
        'Configuration validation failed:',
        ...validation.errors,
        ...(options.strict ? validation.warnings : []),
      ].join('\n  - ');

      throw new Error(errorMessage);
    }

    return this.validatedConfig!;
  }

  /**
   * Integration with existing AppConfigUtil for backward compatibility
   */
  static async migrateFromLegacyConfig(): Promise<{
    legacy: any;
    migrated: AppConfig;
    differences: string[];
  }> {
    const differences: string[] = [];

    // Get legacy configuration
    const legacyConfig = {
      environment: AppConfigUtil.getEnvironment(),
      port: AppConfigUtil.getPort(),
      host: AppConfigUtil.getHost(),
      protocol: AppConfigUtil.getProtocol(),
      publicUrl: AppConfigUtil.getPublicBaseUrl(),
      database: AppConfigUtil.getDatabaseConfig(),
      logging: AppConfigUtil.getLoggingConfig(),
      security: AppConfigUtil.getSecurityConfig(),
    };

    // Get new configuration
    const validator = ConfigValidator.getInstance();
    const migratedConfig = await validator.getValidatedConfig();

    // Compare and note differences
    if (legacyConfig.environment !== migratedConfig.APP_RUNTIME_ENVIRONMENT) {
      differences.push(`Environment: ${legacyConfig.environment} → ${migratedConfig.APP_RUNTIME_ENVIRONMENT}`);
    }

    if (legacyConfig.port !== migratedConfig.APP_SERVER_PORT) {
      differences.push(`Port: ${legacyConfig.port} → ${migratedConfig.APP_SERVER_PORT}`);
    }

    return {
      legacy: legacyConfig,
      migrated: migratedConfig,
      differences,
    };
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validatedConfig = null;
  }
}

/**
 * Convenience function for configuration validation
 */
export async function validateConfig(
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const validator = ConfigValidator.getInstance();
  return validator.validateConfiguration(options);
}

/**
 * Convenience function to get validated configuration
 */
export async function getValidatedConfig(
  options: ValidationOptions = {},
): Promise<AppConfig> {
  const validator = ConfigValidator.getInstance();
  return validator.getValidatedConfig(options);
}
