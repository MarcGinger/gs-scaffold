import { AppConfigUtil } from '../app-config.util';

describe('AppConfigUtil', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env for each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Environment Detection', () => {
    it('should detect production environment', () => {
      process.env.NODE_ENV = 'production';
      expect(AppConfigUtil.getEnvironment()).toBe('production');
      expect(AppConfigUtil.isProduction()).toBe(true);
      expect(AppConfigUtil.isDevelopment()).toBe(false);
    });

    it('should default to development', () => {
      delete process.env.NODE_ENV;
      expect(AppConfigUtil.getEnvironment()).toBe('development');
      expect(AppConfigUtil.isDevelopment()).toBe(true);
    });
  });

  describe('Logging Configuration', () => {
    it('should return proper log level with fallback', () => {
      delete process.env.LOG_LEVEL;
      delete process.env.LOGGER_LEVEL;
      delete process.env.PINO_LOG_LEVEL;
      expect(AppConfigUtil.getLogLevel()).toBe('info');
    });

    it('should validate log levels', () => {
      process.env.LOG_LEVEL = 'invalid';
      expect(AppConfigUtil.getLogLevel()).toBe('info');

      process.env.LOG_LEVEL = 'DEBUG'; // uppercase
      expect(AppConfigUtil.getLogLevel()).toBe('debug');
    });

    it('should return proper log sink with fallback', () => {
      delete process.env.LOG_SINK;
      expect(AppConfigUtil.getLogSink()).toBe('stdout');

      process.env.LOG_SINK = 'loki';
      expect(AppConfigUtil.getLogSink()).toBe('loki');

      process.env.LOG_SINK = 'invalid';
      expect(AppConfigUtil.getLogSink()).toBe('stdout');
    });

    it('should build complete logging configuration', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.LOG_SINK = 'loki';
      process.env.PRETTY_LOGS = 'true';
      process.env.APP_NAME = 'test-app';
      process.env.APP_VERSION = '1.2.3';
      process.env.NODE_ENV = 'development';
      process.env.LOKI_URL = 'http://loki:3100';

      const config = AppConfigUtil.getLoggingConfig();

      expect(config).toEqual({
        level: 'debug',
        sink: 'loki',
        pretty: true,
        appName: 'test-app',
        appVersion: '1.2.3',
        environment: 'development',
        loki: {
          url: 'http://loki:3100',
          basicAuth: undefined,
        },
        elasticsearch: {
          node: undefined,
          index: 'app-logs',
        },
      });
    });
  });

  describe('Production Validation', () => {
    it('should validate production logging config', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_SINK = 'stdout';
      process.env.LOG_LEVEL = 'info';
      process.env.PRETTY_LOGS = 'false';
      process.env.APP_NAME = 'production-app';
      process.env.APP_VERSION = '1.0.0';

      const validation = AppConfigUtil.validateLoggingConfig();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings).toHaveLength(0);
    });

    it('should detect production configuration issues', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_SINK = 'loki'; // Not recommended for production
      process.env.LOG_LEVEL = 'debug'; // Too verbose for production
      process.env.PRETTY_LOGS = 'true'; // Performance impact
      delete process.env.APP_NAME; // Missing required field

      const validation = AppConfigUtil.validateLoggingConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.warnings.length).toBeGreaterThan(0);

      expect(validation.errors).toContain(
        'LOG_LEVEL=debug in production will generate excessive logs and impact performance',
      );
      expect(validation.warnings).toContain(
        "Production LOG_SINK is 'loki', recommended: 'stdout' for better resilience",
      );
    });

    it('should validate sink-specific requirements', () => {
      process.env.LOG_SINK = 'loki';
      delete process.env.LOKI_URL;

      const validation = AppConfigUtil.validateLoggingConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'LOKI_URL is required when LOG_SINK=loki',
      );
    });
  });

  describe('URL Building', () => {
    it('should build URLs correctly', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.PUBLIC_API_URL;

      const url = AppConfigUtil.buildUrl(3000, '/api/health');
      expect(url).toMatch(/^http:\/\/.*:3000\/api\/health$/);
    });

    it('should use public URL in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.PUBLIC_API_URL = 'https://api.example.com';

      const url = AppConfigUtil.buildUrl(3000, '/api/health');
      expect(url).toBe('https://api.example.com/api/health');
    });
  });

  describe('Container Detection', () => {
    it('should detect container environment', () => {
      process.env.KUBERNETES_SERVICE_HOST = 'kubernetes.default.svc';
      expect(AppConfigUtil.isContainerized()).toBe(true);
    });

    it('should detect non-container environment', () => {
      delete process.env.KUBERNETES_SERVICE_HOST;
      delete process.env.CONTAINER_HOST;
      delete process.env.DOCKER_CONTAINER;

      // Mock fs.existsSync to return false for /.dockerenv
      const originalExistsSync = require('fs').existsSync;
      require('fs').existsSync = jest.fn().mockReturnValue(false);

      expect(AppConfigUtil.isContainerized()).toBe(false);

      // Restore original method
      require('fs').existsSync = originalExistsSync;
    });
  });
});
