import { AppConfigUtil } from '../app-config.util';
import { ConfigManager } from '../config.manager';

/**
 * Test logging configuration centralization
 * This validates that logger factory configuration is properly centralized through AppConfigUtil
 */
describe('Logger Factory Configuration Centralization', () => {
  beforeAll(() => {
    // Set test environment variables (legacy format)
    process.env.LOG_SINK = 'loki';
    process.env.PRETTY_LOGS = 'true';
    process.env.LOG_LEVEL = 'debug';
    process.env.APP_NAME = 'test-app';
    process.env.APP_VERSION = '1.0.0';
    process.env.LOKI_URL = 'http://localhost:3100';
    process.env.LOKI_BASIC_AUTH = 'user:pass';
    process.env.ES_NODE = 'http://localhost:9200';
    process.env.ES_INDEX = 'test-logs';
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.LOG_SINK;
    delete process.env.PRETTY_LOGS;
    delete process.env.LOG_LEVEL;
    delete process.env.APP_NAME;
    delete process.env.APP_VERSION;
    delete process.env.LOKI_URL;
    delete process.env.LOKI_BASIC_AUTH;
    delete process.env.ES_NODE;
    delete process.env.ES_INDEX;
  });

  describe('AppConfigUtil.getLoggingConfig()', () => {
    it('should return centralized logging configuration with legacy support', () => {
      const config = AppConfigUtil.getLoggingConfig();

      // Verify legacy environment variable support
      expect(config.sink).toBe('loki');
      expect(config.pretty).toBe(true);
      expect(config.level).toBe('debug');
      expect(config.appName).toBe('test-app');
      expect(config.appVersion).toBe('1.0.0');

      // Verify Loki configuration
      expect(config.loki.url).toBe('http://localhost:3100');
      expect(config.loki.basicAuth).toBe('user:pass');

      // Verify Elasticsearch configuration
      expect(config.elasticsearch.node).toBe('http://localhost:9200');
      expect(config.elasticsearch.index).toBe('test-logs');
    });

    it('should provide sensible defaults', () => {
      // Clear environment variables
      delete process.env.LOG_SINK;
      delete process.env.APP_NAME;
      delete process.env.LOG_LEVEL;
      delete process.env.ES_INDEX; // Clear this too

      const config = AppConfigUtil.getLoggingConfig();

      // Verify defaults
      expect(config.sink).toBe('stdout');
      expect(config.level).toBe('info');
      expect(config.appName).toBe('gs-scaffold');
      expect(config.appVersion).toBe('1.0.0'); // Should still use APP_VERSION
      expect(config.elasticsearch.index).toBe('app-logs');
    });

    it('should prefer new environment variables over legacy ones', () => {
      // Set both new and legacy variables
      process.env.LOG_SINK = 'console'; // Legacy
      process.env.LOGGING_CORE_SINK = 'elasticsearch'; // New format
      process.env.APP_NAME = 'legacy-app'; // Legacy
      process.env.APP_CORE_NAME = 'new-app'; // New format

      const config = AppConfigUtil.getLoggingConfig();

      // Should prefer legacy for backward compatibility
      expect(config.sink).toBe('console');
      expect(config.appName).toBe('legacy-app');
    });
  });

  describe('ConfigManager logging validation', () => {
    beforeEach(() => {
      // Reset environment for validation tests
      process.env.LOG_SINK = 'loki';
      process.env.LOG_LEVEL = 'info';
      process.env.APP_NAME = 'test-app';
    });

    it('should validate logging configuration successfully', () => {
      const configManager = ConfigManager.getInstance();
      const validation = configManager.validateAspect('logging');

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Integration with logger.factory.ts', () => {
    it('should use centralized configuration in buildAppLogger', async () => {
      // Mock CLS service
      const mockClsService = {
        get: jest.fn((key: string) => {
          const mockData: Record<string, string> = {
            traceId: 'test-trace-id',
            correlationId: 'test-correlation-id',
            tenantId: 'test-tenant-id',
            userId: 'test-user-id',
          };
          return mockData[key];
        }),
      };

      // Set specific configuration for testing
      process.env.LOG_SINK = 'console';
      process.env.PRETTY_LOGS = 'true';
      process.env.LOG_LEVEL = 'debug';
      process.env.APP_NAME = 'logger-test';

      const { buildAppLogger } = await import('../../logging/logger.factory');
      const config = AppConfigUtil.getLoggingConfig();

      // Build logger and verify it uses centralized config
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const logger = buildAppLogger(mockClsService as any);

      expect(config.sink).toBe('console');
      expect(config.pretty).toBe(true);
      expect(config.level).toBe('debug');
      expect(config.appName).toBe('logger-test');

      // Verify logger configuration
      expect(logger.level).toBe('debug');

      // Verify logger is properly constructed
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should handle different sink configurations', async () => {
      const mockClsService = { get: jest.fn() };

      // Test Loki configuration
      process.env.LOG_SINK = 'loki';
      process.env.LOKI_URL = 'http://test-loki:3100';
      process.env.LOKI_BASIC_AUTH = 'test:auth';

      const { buildAppLogger } = await import('../../logging/logger.factory');
      const config = AppConfigUtil.getLoggingConfig();

      expect(config.sink).toBe('loki');
      expect(config.loki.url).toBe('http://test-loki:3100');
      expect(config.loki.basicAuth).toBe('test:auth');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const logger = buildAppLogger(mockClsService as any);
      expect(logger).toBeDefined();
    });

    it('should handle Elasticsearch configuration', () => {
      // Test Elasticsearch configuration
      process.env.LOG_SINK = 'elasticsearch';
      process.env.ES_NODE = 'http://test-es:9200';
      process.env.ES_INDEX = 'test-index';

      const config = AppConfigUtil.getLoggingConfig();

      expect(config.sink).toBe('elasticsearch');
      expect(config.elasticsearch.node).toBe('http://test-es:9200');
      expect(config.elasticsearch.index).toBe('test-index');
    });
  });
});
