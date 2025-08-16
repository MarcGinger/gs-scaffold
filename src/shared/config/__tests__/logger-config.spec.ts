import { AppConfigUtil } from '../app-config.util';
import { ConfigManager } from '../config.manager';

/**
 * Test logging configuration centralizat      // Test Elasticsearch configuration
      process.env.LOGGING_CORE_SINK = 'elasticsearch';
      process.env.LOGGING_ELASTICSEARCH_NODE = 'http://test-es:9200';
      process.env.LOGGING_ELASTICSEARCH_INDEX = 'test-logs';
 * This validates that logger factory configuration is properly centralized through AppConfigUtil
 */
describe('Logger Factory Configuration Centralization', () => {
  beforeAll(() => {
    // Set test environment variables (new format)
    process.env.LOGGING_CORE_SINK = 'loki';
    process.env.LOGGING_CORE_PRETTY_ENABLED = 'true';
    process.env.LOGGING_CORE_LEVEL = 'debug';
    process.env.APP_CORE_NAME = 'test-app';
    process.env.APP_CORE_VERSION = '1.0.0';
    process.env.LOGGING_LOKI_URL = 'http://localhost:3100';
    process.env.LOGGING_LOKI_BASIC_AUTH = 'user:pass';
    process.env.LOGGING_ELASTICSEARCH_NODE = 'http://localhost:9200';
    process.env.LOGGING_ELASTICSEARCH_INDEX = 'test-logs';
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.LOGGING_CORE_SINK;
    delete process.env.LOGGING_CORE_PRETTY_ENABLED;
    delete process.env.LOGGING_CORE_LEVEL;
    delete process.env.APP_CORE_NAME;
    delete process.env.APP_CORE_VERSION;
    delete process.env.LOGGING_LOKI_URL;
    delete process.env.LOGGING_LOKI_BASIC_AUTH;
    delete process.env.LOGGING_ELASTICSEARCH_NODE;
    delete process.env.LOGGING_ELASTICSEARCH_INDEX;
  });

  describe('AppConfigUtil.getLoggingConfig()', () => {
    it('should return centralized logging configuration', () => {
      const config = AppConfigUtil.getLoggingConfig();

      // Verify environment variable support
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
      delete process.env.LOGGING_CORE_SINK;
      delete process.env.APP_CORE_NAME;
      delete process.env.LOGGING_CORE_LEVEL;
      delete process.env.LOGGING_ELASTICSEARCH_INDEX; // Clear this too

      const config = AppConfigUtil.getLoggingConfig();

      // Verify defaults
      expect(config.sink).toBe('stdout');
      expect(config.level).toBe('info');
      expect(config.appName).toBe('gs-scaffold');
      expect(config.appVersion).toBe('1.0.0');
      expect(config.elasticsearch.index).toBe('app-logs');
    });
  });

  describe('ConfigManager logging validation', () => {
    beforeEach(() => {
      // Reset environment for validation tests
      process.env.LOGGING_CORE_SINK = 'loki';
      process.env.LOGGING_CORE_LEVEL = 'info';
      process.env.APP_CORE_NAME = 'test-app';
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
      process.env.LOGGING_CORE_SINK = 'console';
      process.env.LOGGING_CORE_PRETTY_ENABLED = 'true';
      process.env.LOGGING_CORE_LEVEL = 'debug';
      process.env.APP_CORE_NAME = 'logger-test';

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
      process.env.LOGGING_CORE_SINK = 'loki';
      process.env.LOGGING_LOKI_URL = 'http://test-loki:3100';
      process.env.LOGGING_LOKI_BASIC_AUTH = 'test:auth';

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
      process.env.LOGGING_CORE_SINK = 'elasticsearch';
      process.env.LOGGING_ELASTICSEARCH_NODE = 'http://test-es:9200';
      process.env.LOGGING_ELASTICSEARCH_INDEX = 'test-index';

      const config = AppConfigUtil.getLoggingConfig();

      expect(config.sink).toBe('elasticsearch');
      expect(config.elasticsearch.node).toBe('http://test-es:9200');
      expect(config.elasticsearch.index).toBe('test-index');
    });
  });
});
