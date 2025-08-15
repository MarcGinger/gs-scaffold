/**
 * Doppler Configuration Service
 * Phase 2.3: Application Integration
 *
 * This service provides a high-level interface for loading configuration
 * from Doppler with automatic fallback to environment variables.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ConfigLoader,
  ConfigLoadOptions,
  ConfigLoadResult,
} from './config-loader';
import { AppConfig } from './app-config.schema';

export interface DopplerServiceOptions {
  /** Doppler project name */
  project?: string;
  /** Doppler config/environment name */
  config?: string;
  /** Enable automatic fallback to .env files */
  enableFallback?: boolean;
  /** Log configuration loading details */
  enableLogging?: boolean;
  /** Fail fast on configuration errors */
  strict?: boolean;
}

@Injectable()
export class DopplerConfigService {
  private readonly logger = new Logger(DopplerConfigService.name);
  private readonly configLoader: ConfigLoader;
  private cachedConfig: AppConfig | null = null;
  private loadAttempted = false;

  constructor(private readonly options: DopplerServiceOptions = {}) {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * Load application configuration with Doppler integration
   */
  async loadConfiguration(): Promise<AppConfig> {
    if (this.cachedConfig && this.loadAttempted) {
      return this.cachedConfig;
    }

    this.loadAttempted = true;

    const loadOptions: ConfigLoadOptions = {
      source: 'auto', // Automatic source detection
      dopplerProject: this.options.project || 'gs-scaffold-api',
      dopplerConfig: this.options.config || 'dev_main',
      strict: this.options.strict || false,
    };

    if (this.options.enableLogging) {
      this.logger.log('Loading application configuration...');
    }

    try {
      const result: ConfigLoadResult =
        await this.configLoader.loadConfig(loadOptions);

      // Log configuration source and status
      if (this.options.enableLogging) {
        this.logger.log(`Configuration loaded from: ${result.source}`);
        this.logger.log(`Doppler available: ${result.dopplerAvailable}`);

        if (result.warnings.length > 0) {
          this.logger.warn(`Configuration warnings: ${result.warnings.length}`);
          result.warnings.forEach((warning) => this.logger.warn(warning));
        }
      }

      // Handle errors
      if (result.errors.length > 0) {
        const errorMessage = `Configuration validation failed:\n${result.errors.join('\n')}`;

        if (this.options.strict) {
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        } else {
          this.logger.warn(errorMessage);
        }
      }

      // Validate critical secrets for production
      this.validateCriticalSecrets(result.config);

      this.cachedConfig = result.config;

      if (this.options.enableLogging) {
        this.logger.log('✅ Configuration loaded successfully');
        this.logger.log(
          `Environment: ${result.config.APP_RUNTIME_ENVIRONMENT}`,
        );
        this.logger.log(
          `Application: ${result.config.APP_CORE_NAME || 'gs-scaffold'}`,
        );
      }

      return result.config;
    } catch (error) {
      this.logger.error('❌ Failed to load configuration', error);

      if (!this.options.enableFallback) {
        throw error;
      }

      // Attempt fallback to environment variables
      this.logger.warn('🔄 Attempting fallback to environment variables...');

      try {
        const fallbackResult = await this.configLoader.loadConfig({
          ...loadOptions,
          source: 'env',
        });

        if (fallbackResult.errors.length > 0 && this.options.strict) {
          throw new Error(
            `Fallback configuration failed: ${fallbackResult.errors.join(', ')}`,
          );
        }

        this.cachedConfig = fallbackResult.config;
        this.logger.warn(
          '⚠️  Using fallback configuration from environment variables',
        );

        return fallbackResult.config;
      } catch (fallbackError) {
        this.logger.error(
          '❌ Fallback configuration also failed',
          fallbackError,
        );
        throw new Error(
          `Configuration loading failed: ${error.message}. Fallback also failed: ${fallbackError.message}`,
        );
      }
    }
  }

  /**
   * Validate that critical secrets are available
   */
  private validateCriticalSecrets(config: AppConfig): void {
    const criticalSecrets = [
      'AUTH_KEYCLOAK_CLIENT_SECRET',
      'SECURITY_PII_ENCRYPTION_KEY',
      'DATABASE_POSTGRES_PASSWORD',
    ];

    const missing = criticalSecrets.filter((secret) => !config[secret]);

    if (missing.length > 0) {
      const message = `Critical secrets missing: ${missing.join(', ')}`;

      if (config.APP_RUNTIME_ENVIRONMENT === 'production') {
        throw new Error(`Production deployment blocked: ${message}`);
      } else {
        this.logger.warn(`⚠️  Development warning: ${message}`);
      }
    } else if (this.options.enableLogging) {
      this.logger.log('🔒 All critical secrets validated');
    }
  }

  /**
   * Get specific configuration value with type safety
   */
  async getConfigValue<K extends keyof AppConfig>(
    key: K,
  ): Promise<AppConfig[K]> {
    const config = await this.loadConfiguration();
    return config[key];
  }

  /**
   * Check if Doppler is available and working
   */
  async isDopplerAvailable(): Promise<boolean> {
    try {
      return await this.configLoader.isDopplerAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Get configuration status and diagnostics
   */
  async getConfigurationStatus(): Promise<{
    dopplerAvailable: boolean;
    configLoaded: boolean;
    source: string;
    environment: string;
    criticalSecretsCount: number;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const result = await this.configLoader.loadConfig({
        dopplerProject: this.options.project || 'gs-scaffold-api',
        dopplerConfig: this.options.config || 'dev_main',
      });

      const criticalSecrets = [
        'AUTH_KEYCLOAK_CLIENT_SECRET',
        'SECURITY_PII_ENCRYPTION_KEY',
        'DATABASE_POSTGRES_PASSWORD',
        'DATABASE_POSTGRES_URL',
      ];

      const criticalSecretsCount = criticalSecrets.filter(
        (secret) => result.config[secret],
      ).length;

      return {
        dopplerAvailable: result.dopplerAvailable,
        configLoaded: true,
        source: result.source,
        environment: result.config.APP_RUNTIME_ENVIRONMENT || 'unknown',
        criticalSecretsCount,
        errors: result.errors,
        warnings: result.warnings,
      };
    } catch (error) {
      return {
        dopplerAvailable: false,
        configLoaded: false,
        source: 'error',
        environment: 'unknown',
        criticalSecretsCount: 0,
        errors: [error.message],
        warnings: [],
      };
    }
  }

  /**
   * Reload configuration (clear cache and reload)
   */
  async reloadConfiguration(): Promise<AppConfig> {
    this.configLoader.clearCache();
    this.cachedConfig = null;
    this.loadAttempted = false;
    return this.loadConfiguration();
  }
}

/**
 * Factory function for creating DopplerConfigService
 */
export function createDopplerConfigService(
  options: DopplerServiceOptions = {},
): DopplerConfigService {
  return new DopplerConfigService({
    enableFallback: true,
    enableLogging: true,
    strict: false,
    ...options,
  });
}

/**
 * Convenience function for one-time configuration loading
 */
export async function loadDopplerConfig(
  options: DopplerServiceOptions = {},
): Promise<AppConfig> {
  const service = createDopplerConfigService(options);
  return service.loadConfiguration();
}
