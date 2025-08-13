import { Test, TestingModule } from '@nestjs/testing';
import { Injectable, Module, Inject } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { LoggingModule } from '../logging/logging.module';
import { ConfigManager } from './config.manager';
import { ConfigService } from './config.service';
import {
  createServiceLoggerFactory,
  APP_LOGGER,
} from '../logging/logging.providers';
import { Log } from '../logging/structured-logger';
import type { Logger } from 'pino';

/**
 * Test suite demonstrating ConfigManager vs ConfigService usage patterns
 * and integration with modular service name configuration
 */

// Example service using ConfigManager with modular service names
const configTestLoggerFactory = createServiceLoggerFactory(
  'config-test-service',
);

@Injectable()
class ConfigTestService {
  private readonly log: Logger;
  private readonly configManager = ConfigManager.getInstance();

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = configTestLoggerFactory.createComponentLogger(
      baseLogger,
      'ConfigTestService',
    );
  }

  async initializeConfiguration() {
    Log.minimal.info(this.log, 'Initializing configuration test service', {
      method: 'initializeConfiguration',
    });

    // Initialize ConfigManager with service-specific logging
    const validation = this.configManager.validateAndLog(
      this.log,
      'config-test-service',
    );

    Log.minimal.info(this.log, 'Configuration validation completed', {
      method: 'initializeConfiguration',
      validationResult: validation,
    });

    return validation;
  }

  demonstrateConfigManagerFeatures() {
    const configSummary = this.configManager.getConfigSummary();

    Log.minimal.info(this.log, 'Configuration summary retrieved', {
      method: 'demonstrateConfigManagerFeatures',
      summary: configSummary,
    });

    // Test aspect validation
    const loggingValidation = this.configManager.validateAspect('logging');
    const databaseValidation = this.configManager.validateAspect('database');
    const serverValidation = this.configManager.validateAspect('server');

    Log.minimal.info(this.log, 'Configuration aspects validated', {
      method: 'demonstrateConfigManagerFeatures',
      aspects: {
        logging: loggingValidation,
        database: databaseValidation,
        server: serverValidation,
      },
    });

    // Test feature flags
    const features = {
      hotReload: this.configManager.supportsFeature('hot-reload'),
      debugMode: this.configManager.supportsFeature('debug-mode'),
      performanceMonitoring: this.configManager.supportsFeature(
        'performance-monitoring',
      ),
    };

    Log.minimal.info(this.log, 'Feature flags evaluated', {
      method: 'demonstrateConfigManagerFeatures',
      features,
    });

    return {
      summary: configSummary,
      aspects: {
        logging: loggingValidation,
        database: databaseValidation,
        server: serverValidation,
      },
      features,
    };
  }

  testConvenienceLogging() {
    // Test ConfigManager's convenience logging methods
    this.configManager.logInfo('Testing ConfigManager info logging', {
      component: 'ConfigTestService',
      operation: 'convenience-logging-test',
    });

    this.configManager.logWarning('Testing ConfigManager warning logging', {
      component: 'ConfigTestService',
      operation: 'convenience-logging-test',
    });

    try {
      throw new Error('Test error for ConfigManager');
    } catch (error) {
      this.configManager.logError(
        error as Error,
        'Testing ConfigManager error logging',
        {
          component: 'ConfigTestService',
          operation: 'convenience-logging-test',
        },
      );
    }
  }
}

// Example module demonstrating both ConfigService and ConfigManager
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    LoggingModule,
  ],
  providers: [
    ConfigTestService,
    // Register service-specific logger provider
    configTestLoggerFactory.createAppLoggerProvider(),
  ],
})
class ConfigTestModule {}

describe('ConfigManager vs ConfigService Integration', () => {
  let module: TestingModule;
  let configTestService: ConfigTestService;
  let baseLogger: Logger;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigTestModule],
    }).compile();

    configTestService = module.get<ConfigTestService>(ConfigTestService);
    baseLogger = module.get<Logger>(APP_LOGGER);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('ConfigManager Features', () => {
    it('should initialize with service-specific logging', async () => {
      const validation = await configTestService.initializeConfiguration();

      expect(validation).toBeDefined();
      expect(validation.valid).toBe(true);
    });

    it('should provide comprehensive configuration summary', () => {
      const result = configTestService.demonstrateConfigManagerFeatures();

      expect(result.summary).toBeDefined();
      expect(result.summary.environment).toBeDefined();
      expect(result.summary.logging).toBeDefined();
      expect(result.summary.features).toBeDefined();

      expect(result.aspects.logging.valid).toBe(true);
      expect(result.features).toHaveProperty('hotReload');
      expect(result.features).toHaveProperty('debugMode');
      expect(result.features).toHaveProperty('performanceMonitoring');
    });

    it('should handle convenience logging methods', () => {
      expect(() => {
        configTestService.testConvenienceLogging();
      }).not.toThrow();
    });

    it('should provide immutable config access', () => {
      const configManager = ConfigManager.getInstance();
      const config = configManager.getLoggingConfig();

      // Attempt to mutate should not affect the internal config
      expect(() => {
        (config as any).level = 'debug';
      }).toThrow(); // Should throw because it's frozen
    });
  });

  describe('ConfigService Compatibility', () => {
    it('should work alongside ConfigManager', () => {
      const configService = ConfigService.getInstance();

      expect(() => {
        configService.validateAndLog(baseLogger);
      }).not.toThrow();

      expect(configService.getEnvironment()).toBeDefined();
      expect(configService.getLoggingConfig()).toBeDefined();
    });
  });

  describe('Service Name Integration', () => {
    it('should log with correct service name from factory', async () => {
      // Create a spy to capture logs
      const originalWrite = process.stdout.write;
      const logOutputs: string[] = [];

      process.stdout.write = jest.fn((chunk: string) => {
        logOutputs.push(chunk);
        return true;
      }) as any;

      try {
        await configTestService.initializeConfiguration();
        configTestService.demonstrateConfigManagerFeatures();

        // Check that logs contain the correct service name
        const hasCorrectServiceName = logOutputs.some(
          (output) =>
            output.includes('"service":"config-test-service"') &&
            output.includes('"component":"ConfigTestService"'),
        );

        expect(hasCorrectServiceName).toBe(true);
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });
});

/**
 * Example usage patterns for different scenarios
 */
export class ConfigurationExamples {
  /**
   * Basic ConfigManager usage - singleton pattern
   */
  static basicUsage(baseLogger: Logger) {
    const configManager = ConfigManager.getInstance();

    // Initialize once with service name
    const validation = configManager.validateAndLog(baseLogger, 'my-service');

    // Use throughout application
    const environment = configManager.getEnvironment();
    const isProduction = configManager.isProduction();
    const logConfig = configManager.getLoggingConfig();

    return { validation, environment, isProduction, logConfig };
  }

  /**
   * Advanced ConfigManager usage - feature flags and validation
   */
  static advancedUsage() {
    const configManager = ConfigManager.getInstance();

    // Check feature support
    const canUseHotReload = configManager.supportsFeature('hot-reload');
    const hasDebugMode = configManager.supportsFeature('debug-mode');

    // Validate specific aspects
    const loggingValid = configManager.validateAspect('logging');
    const databaseValid = configManager.validateAspect('database');

    // Get comprehensive summary
    const summary = configManager.getConfigSummary();

    return {
      features: { canUseHotReload, hasDebugMode },
      validation: { loggingValid, databaseValid },
      summary,
    };
  }

  /**
   * Using ConfigManager with different service names
   */
  static multiServiceUsage(baseLogger: Logger) {
    const configManager = ConfigManager.getInstance();

    // Each service can initialize with its own name
    configManager.validateAndLog(baseLogger, 'user-service');
    // Later calls will reuse the same logger instance

    // Service-specific logging
    configManager.logInfo('Service started', {
      serviceType: 'user-management',
    });

    return configManager.getConfigSummary();
  }

  /**
   * Migrating from ConfigService to ConfigManager
   */
  static migrationExample(baseLogger: Logger) {
    // Old way (ConfigService)
    const configService = ConfigService.getInstance();
    configService.validateAndLog(baseLogger);
    const oldConfig = configService.getLoggingConfig();

    // New way (ConfigManager)
    const configManager = ConfigManager.getInstance();
    const validation = configManager.validateAndLog(
      baseLogger,
      'migrated-service',
    );
    const newConfig = configManager.getLoggingConfig();
    const summary = configManager.getConfigSummary();

    return {
      migration: {
        oldConfig,
        newConfig,
        validation,
        summary,
        improved: true,
      },
    };
  }
}
