import { Logger } from 'pino';

/**
 * Validates production logging configuration on startup
 */
export function validateProductionLogging(logger: Logger): void {
  const env = process.env.NODE_ENV;
  const sink = process.env.LOG_SINK;
  const level = process.env.LOG_LEVEL;
  const pretty = process.env.PRETTY_LOGS;

  const warnings: string[] = [];
  const errors: string[] = [];

  // Production environment checks
  if (env === 'production') {
    if (sink !== 'stdout') {
      warnings.push(
        `Production LOG_SINK is '${sink}', recommended: 'stdout' for better resilience`,
      );
    }

    if (pretty === 'true') {
      warnings.push(
        'PRETTY_LOGS=true in production will impact performance, set to false',
      );
    }

    if (level === 'debug') {
      errors.push(
        'LOG_LEVEL=debug in production will generate excessive logs and impact performance',
      );
    }

    if (!process.env.APP_NAME) {
      errors.push('APP_NAME environment variable is required for production');
    }

    if (!process.env.APP_VERSION) {
      warnings.push(
        'APP_VERSION environment variable not set, using default value',
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
        sink,
        level,
        pretty: pretty === 'true',
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
  expectedFields.forEach((field) => {
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
