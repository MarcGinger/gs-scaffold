import { AppConfigUtil } from './app-config.util';
import { validateProductionLogging } from '../logging/logging-validator';
import { Logger } from 'pino';

/**
 * Configuration service that integrates AppConfigUtil with your logging system
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
   */
  validateAndLog(logger: Logger): void {
    const validation = AppConfigUtil.validateLoggingConfig();

    if (!validation.valid) {
      logger.error(
        {
          service: 'gs-scaffold',
          component: 'ConfigService',
          method: 'validateAndLog',
          configErrors: validation.errors,
          configWarnings: validation.warnings,
        },
        'Configuration validation failed',
      );
      throw new Error(
        `Configuration validation failed: ${validation.errors.join(', ')}`,
      );
    }

    if (validation.warnings.length > 0) {
      logger.warn(
        {
          service: 'gs-scaffold',
          component: 'ConfigService',
          method: 'validateAndLog',
          configWarnings: validation.warnings,
        },
        'Configuration warnings detected',
      );
    }

    // Also run the logging-specific validation
    try {
      validateProductionLogging(logger);
    } catch (error) {
      logger.error(
        {
          service: 'gs-scaffold',
          component: 'ConfigService',
          method: 'validateAndLog',
          err: error,
        },
        'Production logging validation failed',
      );
      throw error;
    }

    logger.info(
      {
        service: 'gs-scaffold',
        component: 'ConfigService',
        method: 'validateAndLog',
        environment: AppConfigUtil.getEnvironment(),
        containerized: AppConfigUtil.isContainerized(),
        logConfig: {
          level: this.config.level,
          sink: this.config.sink,
          pretty: this.config.pretty,
        },
      },
      'Configuration validated and loaded successfully',
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
