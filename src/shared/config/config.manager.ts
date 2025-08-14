import { AppConfigUtil } from './app-config.util';
import { validateProductionLogging } from '../logging/logging-validator';
import {
  createServiceLoggerFactory,
  createComponentLogger,
} from '../logging/logging.providers';
import { Log } from '../logging/structured-logger';
import type { Logger } from 'pino';

/**
 * Enhanced configuration manager with modular service name support.
 *
 * Key improvements over ConfigService:
 * - Immutable config snapshot to prevent accidental mutations
 * - Production-only strict logging validation
 * - Initialize-once API with explicit base logger requirement
 * - Returns validation results for caller branching
 * - Integrates with modular service name configuration
 * - Comprehensive pass-through methods for centralized config access
 */
export class ConfigManager {
  private static instance: ConfigManager | undefined;
  private readonly config: Readonly<
    ReturnType<typeof AppConfigUtil.getLoggingConfig>
  >;
  private logger?: Logger;

  private constructor() {
    // Snapshot config once and freeze to avoid accidental mutation
    this.config = Object.freeze(AppConfigUtil.getLoggingConfig());
  }

  /**
   * Access the singleton instance. You can call this anywhere,
   * but remember to call `validateAndLog(baseLogger, serviceName?)` once on startup.
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /** Initialize component logger only once with optional service name */
  private initializeLogger(baseLogger: Logger, serviceName?: string): void {
    if (!this.logger) {
      if (serviceName) {
        // Use modular service name configuration
        const serviceLoggerFactory = createServiceLoggerFactory(serviceName);
        this.logger = serviceLoggerFactory.createComponentLogger(
          baseLogger,
          'ConfigManager',
        );
      } else {
        // Fall back to default component logger
        this.logger = createComponentLogger(baseLogger, 'ConfigManager');
      }
    }
  }

  /**
   * Validate config and log summary. Call once during app bootstrap.
   * Throws on fatal config errors. Returns the validation payload for callers.
   *
   * @param baseLogger - The base logger instance
   * @param serviceName - Optional service name for modular logging
   * @returns Validation result for caller branching
   */
  validateAndLog(baseLogger: Logger, serviceName?: string) {
    this.initializeLogger(baseLogger, serviceName);

    const validation = AppConfigUtil.validateLoggingConfig();

    if (!validation.valid) {
      Log.minimal.error(
        this.logger!,
        new Error('Configuration validation failed'),
        'Configuration validation failed',
        {
          method: 'validateAndLog',
          configErrors: validation.errors,
          configWarnings: validation.warnings,
        },
      );
      throw new Error(
        `Configuration validation failed: ${validation.errors.join(', ')}`,
      );
    }

    if (validation.warnings.length > 0) {
      Log.minimal.warn(this.logger!, 'Configuration warnings detected', {
        method: 'validateAndLog',
        configWarnings: validation.warnings,
      });
    }

    // Only enforce production logging rules in production
    if (AppConfigUtil.isProduction()) {
      try {
        validateProductionLogging(this.logger!);
      } catch (error) {
        Log.minimal.error(
          this.logger!,
          error as Error,
          'Production logging validation failed',
          { method: 'validateAndLog' },
        );
        throw error;
      }
    }

    Log.minimal.info(
      this.logger!,
      'Configuration validated and loaded successfully',
      {
        method: 'validateAndLog',
        environment: AppConfigUtil.getEnvironment(),
        containerized: AppConfigUtil.isContainerized(),
        logConfig: {
          level: this.config.level,
          sink: this.config.sink,
          pretty: this.config.pretty,
        },
      },
    );

    return validation;
  }

  /** Accessors (centralize all config reads here) */
  getLoggingConfig() {
    return this.config;
  }

  getEnvironment() {
    return AppConfigUtil.getEnvironment();
  }

  isProduction() {
    return AppConfigUtil.isProduction();
  }

  isContainerized() {
    return AppConfigUtil.isContainerized();
  }

  getDatabaseConfig() {
    return AppConfigUtil.getDatabaseConfig();
  }

  /**
   * Generic environment variable getter with optional default
   * Centralizes all env var access through ConfigManager
   */
  get(key: string, defaultValue?: string): string | undefined {
    const value = process.env[key];
    return value ?? defaultValue;
  }

  buildUrl(port?: number, path?: string) {
    return AppConfigUtil.buildUrl(port, path);
  }

  getServerConfigurations(port?: number) {
    return AppConfigUtil.getServerConfigurations(port);
  }

  getLogLevel() {
    return this.config.level || 'info';
  }

  /** Convenience logging helpers (no-ops if not initialized) */
  logInfo(message: string, context: Record<string, any> = {}) {
    if (this.logger) {
      Log.minimal.info(this.logger, message, { method: 'logInfo', ...context });
    }
  }

  logWarning(message: string, context: Record<string, any> = {}) {
    if (this.logger) {
      Log.minimal.warn(this.logger, message, {
        method: 'logWarning',
        ...context,
      });
    }
  }

  logError(error: Error, message: string, context: Record<string, any> = {}) {
    if (this.logger) {
      Log.minimal.error(this.logger, error, message, {
        method: 'logError',
        ...context,
      });
    }
  }

  /** Advanced configuration queries */

  /**
   * Check if the current environment supports a specific feature
   */
  supportsFeature(
    feature: 'hot-reload' | 'debug-mode' | 'performance-monitoring',
  ): boolean {
    const env = this.getEnvironment();
    switch (feature) {
      case 'hot-reload':
        return env === 'development';
      case 'debug-mode':
        return env !== 'production';
      case 'performance-monitoring':
        return env === 'production' || env === 'staging';
      default:
        return false;
    }
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary() {
    return {
      environment: this.getEnvironment(),
      isProduction: this.isProduction(),
      isContainerized: this.isContainerized(),
      logging: {
        level: this.config.level,
        sink: this.config.sink,
        pretty: this.config.pretty,
      },
      features: {
        hotReload: this.supportsFeature('hot-reload'),
        debugMode: this.supportsFeature('debug-mode'),
        performanceMonitoring: this.supportsFeature('performance-monitoring'),
      },
    };
  }

  /**
   * Validate specific configuration aspect without full bootstrap
   */
  validateAspect(aspect: 'logging' | 'database' | 'server'): {
    valid: boolean;
    errors: string[];
  } {
    switch (aspect) {
      case 'logging':
        return AppConfigUtil.validateLoggingConfig();
      case 'database':
        try {
          const dbConfig = this.getDatabaseConfig();
          return {
            valid: !!(dbConfig.host && dbConfig.port && dbConfig.database),
            errors: dbConfig.host ? [] : ['Database host not configured'],
          };
        } catch (error) {
          return { valid: false, errors: [(error as Error).message] };
        }
      case 'server':
        try {
          const serverConfigs = this.getServerConfigurations();
          return {
            valid: serverConfigs.length > 0,
            errors:
              serverConfigs.length > 0
                ? []
                : ['Server configurations not available'],
          };
        } catch (error) {
          return { valid: false, errors: [(error as Error).message] };
        }
      default:
        // This should never happen with proper typing, but just in case
        return { valid: false, errors: ['Unknown aspect'] };
    }
  }
}
