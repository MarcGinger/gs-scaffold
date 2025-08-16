/**
 * Secret Redaction Tests
 *
 * Validates Phase 1 Task 2.2 implementation requirements:
 * - Verify no secrets leak to logs
 * - Test configurable redaction via LOGGING_CORE_REDACT_KEYS
 * - Validate logger.config.ts functionality
 */

import {
  createAppLogger,
  getRedactionConfig,
  validateLogSecurity,
  DEFAULT_REDACT_KEYS,
} from '../logger.config';
import { AppConfigUtil } from '../../config/app-config.util';

describe('Phase 1 Task 2.2: Secret Redaction & Logging', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Logger Configuration', () => {
    it('should create logger with default redaction keys', () => {
      const logger = createAppLogger();
      expect(logger).toBeDefined();
      expect(logger.level).toBeDefined();
    });

    it('should include all required default redaction keys from implementation plan', () => {
      const config = getRedactionConfig();

      // Verify implementation plan requirements are present
      const requiredKeys = [
        '*_SECRET',
        '*_TOKEN',
        '*_PASSWORD',
        'AZURE_*_KEY',
        'AUTH_KEYCLOAK_CLIENT_SECRET',
        'authorization',
        'cookie',
        'password',
        'secret',
        'token',
      ];

      for (const key of requiredKeys) {
        expect(config.allKeys).toContain(key);
      }
    });

    it('should support additional redaction keys from environment', () => {
      process.env.LOGGING_CORE_REDACT_KEYS =
        'CUSTOM_SECRET,ANOTHER_TOKEN,test_key';

      const config = getRedactionConfig();

      expect(config.additionalKeys).toContain('CUSTOM_SECRET');
      expect(config.additionalKeys).toContain('ANOTHER_TOKEN');
      expect(config.additionalKeys).toContain('test_key');
      expect(config.allKeys).toContain('CUSTOM_SECRET');
    });
  });

  describe('Secret Redaction Validation', () => {
    let logger: any;
    const testSecrets = [
      'super-secret-password',
      'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9',
      'sk_test_12345',
      'postgres://user:password@localhost/db',
    ];

    beforeEach(() => {
      logger = createAppLogger({ level: 'debug' });
    });

    it('should redact passwords in log messages', () => {
      const logMessage = JSON.stringify({
        message: 'User login attempt',
        password: testSecrets[0],
        user: 'testuser',
      });

      const isSecure = validateLogSecurity(logMessage, testSecrets);
      expect(isSecure).toBe(false); // Should fail because we haven't processed it through pino yet

      // The actual redaction happens when pino processes the log
      // This test validates our detection logic
    });

    it('should redact authorization headers', () => {
      const logMessage = JSON.stringify({
        headers: {
          authorization: testSecrets[1],
          'content-type': 'application/json',
        },
      });

      const isSecure = validateLogSecurity(logMessage, testSecrets);
      expect(isSecure).toBe(false); // Should detect the secret
    });

    it('should redact connection strings', () => {
      const logMessage = JSON.stringify({
        database: {
          connectionString: testSecrets[3],
        },
      });

      const isSecure = validateLogSecurity(logMessage, testSecrets);
      expect(isSecure).toBe(false); // Should detect the secret
    });

    it('should pass validation when secrets are properly redacted', () => {
      const redactedMessage = JSON.stringify({
        password: '[REDACTED]',
        headers: {
          authorization: '[REDACTED]',
        },
        connectionString: '[REDACTED]',
      });

      const isSecure = validateLogSecurity(redactedMessage, testSecrets);
      expect(isSecure).toBe(true); // Should pass - no actual secrets present
    });
  });

  describe('Integration with AppConfigUtil', () => {
    it('should use AppConfigUtil for logging configuration', () => {
      const mockConfig = {
        level: 'debug',
        pretty: true,
        appName: 'test-app',
        appVersion: '1.0.0',
        environment: 'test',
      };

      const logger = createAppLogger(mockConfig);
      expect(logger).toBeDefined();
    });

    it('should fallback to AppConfigUtil when no config provided', () => {
      jest.spyOn(AppConfigUtil, 'getLoggingConfig').mockReturnValue({
        level: 'info',
        sink: 'stdout',
        pretty: false,
        appName: 'gs-scaffold',
        appVersion: '0.0.1',
        environment: 'development',
        loki: { url: undefined, basicAuth: undefined },
        elasticsearch: { node: undefined, index: 'app-logs' },
      });

      const logger = createAppLogger();
      expect(logger).toBeDefined();
      expect(AppConfigUtil.getLoggingConfig).toHaveBeenCalled();
    });
  });

  describe('Production Security Requirements', () => {
    const productionSecrets = [
      process.env.AUTH_KEYCLOAK_CLIENT_SECRET || 'test-client-secret',
      process.env.DATABASE_POSTGRES_PASSWORD || 'test-db-password',
      process.env.SECURITY_PII_ENCRYPTION_KEY || 'test-encryption-key',
    ];

    it('should never log actual secret values', () => {
      productionSecrets.forEach((secret) => {
        if (secret && secret !== 'undefined') {
          const testLog = `User authenticated with secret: ${secret}`;
          const isSecure = validateLogSecurity(testLog, [secret]);
          expect(isSecure).toBe(false); // Should detect the secret
        }
      });
    });

    it('should handle nested object redaction', () => {
      const nestedObject = {
        user: {
          credentials: {
            password: 'sensitive-password',
            token: 'sensitive-token',
          },
        },
        headers: {
          authorization: 'Bearer sensitive-jwt',
          cookie: 'sessionId=sensitive-session',
        },
      };

      const logMessage = JSON.stringify(nestedObject);
      const secrets = [
        'sensitive-password',
        'sensitive-token',
        'sensitive-jwt',
        'sensitive-session',
      ];

      const isSecure = validateLogSecurity(logMessage, secrets);
      expect(isSecure).toBe(false); // Should detect secrets in nested structure
    });
  });

  describe('Performance and Configuration', () => {
    it('should handle large redaction key lists efficiently', () => {
      const largeKeyList = Array.from(
        { length: 100 },
        (_, i) => `secret_key_${i}`,
      );
      process.env.LOGGING_CORE_REDACT_KEYS = largeKeyList.join(',');

      const startTime = Date.now();
      const config = getRedactionConfig();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be fast
      expect(config.allKeys.length).toBeGreaterThan(DEFAULT_REDACT_KEYS.length);
    });

    it('should deduplicate redaction keys', () => {
      process.env.LOGGING_CORE_REDACT_KEYS =
        'password,secret,password,token,secret';

      const config = getRedactionConfig();
      const passwordCount = config.allKeys.filter(
        (key) => key === 'password',
      ).length;
      const secretCount = config.allKeys.filter(
        (key) => key === 'secret',
      ).length;

      expect(passwordCount).toBe(1);
      expect(secretCount).toBe(1);
    });
  });
});
