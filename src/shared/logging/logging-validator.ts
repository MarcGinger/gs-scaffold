import { Logger } from 'pino';
import { AppConfigUtil } from '../config/app-config.util';

/**
 * Validates production logging configuration on startup
 */
export function validateProductionLogging(logger: Logger): void {
  const env = AppConfigUtil.getEnvironment();
  const config = AppConfigUtil.getLoggingConfig();

  const warnings: string[] = [];
  const errors: string[] = [];

  // Production environment checks
  if (env === 'production') {
    if (config.sink !== 'stdout') {
      warnings.push(
        `Production LOGGING_CORE_SINK is '${config.sink}', recommended: 'stdout' for better resilience`,
      );
    }

    if (config.pretty) {
      warnings.push(
        'LOGGING_CORE_PRETTY_ENABLED=true in production will impact performance, set to false',
      );
    }

    if (config.level === 'debug') {
      errors.push(
        'LOGGING_CORE_LEVEL=debug in production will generate excessive logs and impact performance',
      );
    }

    if (!config.appName || config.appName === 'gs-scaffold') {
      errors.push(
        'APP_CORE_NAME environment variable is required for production',
      );
    }

    if (!config.appVersion || config.appVersion === '1.0.0') {
      warnings.push(
        'APP_CORE_VERSION environment variable not set, using default value',
      );
    }
  }

  // Log validation results
  if (warnings.length > 0) {
    logger.warn(
      {
        service: 'gs-scaffold',
        component: 'LoggingValidator',
        method: 'validateProductionLogging',
        validationWarnings: warnings,
        environment: env,
      },
      'Logging configuration warnings detected',
    );
  }

  if (errors.length > 0) {
    logger.error(
      {
        service: 'gs-scaffold',
        component: 'LoggingValidator',
        method: 'validateProductionLogging',
        validationErrors: errors,
        environment: env,
      },
      'Critical logging configuration errors detected',
    );
    throw new Error(
      `Production logging validation failed: ${errors.join(', ')}`,
    );
  }

  // Success log
  logger.info(
    {
      service: 'gs-scaffold',
      component: 'LoggingValidator',
      method: 'validateProductionLogging',
      config: {
        sink: config.sink,
        level: config.level,
        pretty: config.pretty,
        environment: env,
      },
    },
    'Logging configuration validated successfully',
  );
}

/**
 * Validates that required CLS context is available
 */
export function validateClsContext(
  logger: Logger,
  expectedFields: string[] = ['traceId'],
): void {
  const missingFields: string[] = [];

  // This would be called within a CLS context
  // Implementation depends on your CLS service injection pattern
  expectedFields.forEach(() => {
    // This is a placeholder - you'd inject ClsService to check actual values
    // if (!cls.get(field)) missingFields.push(field);
  });

  if (missingFields.length > 0) {
    logger.warn(
      {
        service: 'gs-scaffold',
        component: 'LoggingValidator',
        method: 'validateClsContext',
        missingFields,
      },
      'CLS context validation failed - some required fields are missing',
    );
  }
}
