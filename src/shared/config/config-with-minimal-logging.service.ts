import { AppConfigUtil } from './app-config.util';
import { validateProductionLogging } from '../logging/logging-validator';
import { createComponentLogger } from '../logging/logging.providers';
import { Log } from '../logging/structured-logger';
import { Logger } from 'pino';

/**
 * Configuration service that integrates AppConfigUtil with your logging system
 * Demonstrates proper use of component logger pattern
 */
export class ConfigService {
  private static instance: ConfigService;
  private readonly config: ReturnType<typeof AppConfigUtil.getLoggingConfig>;

  private constructor() {
    this.config = AppConfigUtil.getLoggingConfig();
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Validates and logs configuration on startup
   * Uses component logger for automatic component name inclusion
   */
  validateAndLog(logger: Logger): void {
    // Create a component-specific logger that automatically includes component name
    const componentLogger = createComponentLogger(logger, 'ConfigService');

    const validation = AppConfigUtil.validateLoggingConfig();

    if (!validation.valid) {
      // Using Log.minimal.error since component is already set by componentLogger
      Log.minimal.error(
        componentLogger,
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
      Log.minimal.warn(componentLogger, 'Configuration warnings detected', {
        method: 'validateAndLog',
        configWarnings: validation.warnings,
      });
    }

    // Also run the logging-specific validation
    try {
      validateProductionLogging(componentLogger);
    } catch (error) {
      Log.minimal.error(
        componentLogger,
        error,
        'Production logging validation failed',
        {
          method: 'validateAndLog',
        },
      );
      throw error;
    }

    Log.minimal.info(
      componentLogger,
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
  }

  getLoggingConfig() {
    return this.config;
  }

  getEnvironment() {
    return AppConfigUtil.getEnvironment();
  }

  getDatabaseConfig() {
    return AppConfigUtil.getDatabaseConfig();
  }

  buildUrl(port?: number, path?: string): string {
    return AppConfigUtil.buildUrl(port, path);
  }

  isProduction(): boolean {
    return AppConfigUtil.isProduction();
  }

  isContainerized(): boolean {
    return AppConfigUtil.isContainerized();
  }
}
