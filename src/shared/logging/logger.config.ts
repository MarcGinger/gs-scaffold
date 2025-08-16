/**
 * Centralized Logger Configuration
 *
 * Implements Phase 1 Task 2.2: Secret Redaction & Logging
 *
 * Features:
 * - Configurable secret redaction via LOGGING_CORE_REDACT_KEYS
 * - Default redaction patterns for common secret patterns
 * - Integration with AppConfigUtil for centralized configuration
 * - Support for multiple log sinks (console, loki, elasticsearch)
 */

import pino from 'pino';
import { AppConfigUtil } from '../config/app-config.util';

/**
 * Default redaction keys to prevent common secrets from appearing in logs
 * These patterns match the implementation plan requirements
 */
const DEFAULT_REDACT_KEYS = [
  // Generic secret patterns (wildcards handled by pino)
  'password',
  'secret',
  'token',
  'key',
  'auth',
  'credential',

  // Specific environment variable patterns
  '*_SECRET',
  '*_TOKEN',
  '*_PASSWORD',
  '*_KEY',
  'AZURE_*_KEY',
  'AZURE_STORAGE_CONNECTION_STRING',
  'AUTH_KEYCLOAK_CLIENT_SECRET',
  'DATABASE_POSTGRES_PASSWORD',
  'CACHE_REDIS_PASSWORD',
  'SECURITY_PII_ENCRYPTION_KEY',

  // HTTP headers and request fields
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'connectionString',
  'card',
  'cardNumber',
  'cvv',
  'ssn',

  // Nested object paths that might contain secrets
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'body.password',
  'body.token',
  'query.secret',
  'params.key',
];

/**
 * Create application logger with secret redaction
 *
 * @param config Optional configuration override (uses AppConfigUtil if not provided)
 * @returns Configured pino logger instance
 */
export const createAppLogger = (config?: Record<string, unknown>) => {
  const loggingConfig = AppConfigUtil.getLoggingConfig();
  const configToUse = config || loggingConfig;

  // Build redaction keys from defaults + configured additions
  let redactKeys = [...DEFAULT_REDACT_KEYS];

  // Add additional redaction keys from configuration
  const additionalKeys = process.env.LOGGING_CORE_REDACT_KEYS;
  if (additionalKeys) {
    const customKeys = additionalKeys
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    redactKeys = [...redactKeys, ...customKeys];
  }

  // Remove duplicates
  redactKeys = [...new Set(redactKeys)];

  const pinoConfig: pino.LoggerOptions = {
    level: (configToUse.level as string) || 'info',

    // Secret redaction configuration
    redact: {
      paths: redactKeys,
      censor: '[REDACTED]',
      remove: false, // Keep the property but redact the value
    },

    // Pretty printing for development
    ...(configToUse.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
              singleLine: false,
            },
          },
        }
      : {}),

    // Base logging context
    base: {
      service: (configToUse.appName as string) || 'gs-scaffold',
      version: (configToUse.appVersion as string) || '0.0.1',
      environment: (configToUse.environment as string) || 'development',
    },

    // Timestamp configuration
    timestamp: pino.stdTimeFunctions.isoTime,

    // Error serialization
    serializers: {
      err: pino.stdSerializers.err,
      req: (req: unknown) => {
        // Custom request serializer with enhanced redaction
        const serialized = pino.stdSerializers.req(req as any);

        // Additional redaction for request objects
        if (serialized.headers) {
          if (serialized.headers.authorization)
            serialized.headers.authorization = '[REDACTED]';
          if (serialized.headers.cookie)
            serialized.headers.cookie = '[REDACTED]';
          if (serialized.headers['x-api-key'])
            serialized.headers['x-api-key'] = '[REDACTED]';
        }

        return serialized;
      },
      res: pino.stdSerializers.res,
    },
  };

  return pino(pinoConfig);
};

/**
 * Get the current redaction configuration for testing/debugging
 *
 * @returns Object containing current redaction settings
 */
export const getRedactionConfig = () => {
  let redactKeys = [...DEFAULT_REDACT_KEYS];

  const additionalKeys = process.env.LOGGING_CORE_REDACT_KEYS;
  if (additionalKeys) {
    const customKeys = additionalKeys
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    redactKeys = [...redactKeys, ...customKeys];
  }

  return {
    defaultKeys: DEFAULT_REDACT_KEYS,
    additionalKeys:
      additionalKeys
        ?.split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0) || [],
    allKeys: [...new Set(redactKeys)],
    totalCount: redactKeys.length,
  };
};

/**
 * Validate that no secrets are present in a log entry
 * Used primarily for testing purposes
 *
 * @param logEntry The log entry to validate
 * @param secretValues Array of actual secret values to check for
 * @returns True if no secrets found, false otherwise
 */
export const validateLogSecurity = (
  logEntry: string,
  secretValues: string[] = [],
): boolean => {
  const logLower = logEntry.toLowerCase();

  // Check for common secret patterns in the actual log output
  const dangerousPatterns = [
    /password['":\s]*[^[\]]+/i,
    /secret['":\s]*[^[\]]+/i,
    /token['":\s]*[^[\]]+/i,
    /key['":\s]*[^[\]]+/i,
    /"authorization"[:\s]*"[^[\]]+"/i,
    /"cookie"[:\s]*"[^[\]]+"/i,
  ];

  // Check patterns
  for (const pattern of dangerousPatterns) {
    if (pattern.test(logEntry) && !logEntry.includes('[REDACTED]')) {
      return false;
    }
  }

  // Check specific secret values if provided
  for (const secret of secretValues) {
    if (
      secret &&
      secret.length > 3 &&
      logLower.includes(secret.toLowerCase())
    ) {
      return false;
    }
  }

  return true;
};

export { DEFAULT_REDACT_KEYS };
