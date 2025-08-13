#!/usr/bin/env node

/**
 * ConfigManager vs ConfigService Demonstration
 *
 * This script shows the differences and improvements of ConfigManager
 * over the existing ConfigService, including modular service name support.
 */

import { NestFactory } from '@nestjs/core';
import { Module, Injectable, Inject } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { LoggingModule } from './src/shared/logging/logging.module';
import { ConfigManager } from './src/shared/config/config.manager';
import { ConfigService } from './src/shared/config/config.service';
import {
  createServiceLoggerFactory,
  APP_LOGGER,
} from './src/shared/logging/logging.providers';
import { Log } from './src/shared/logging/structured-logger';
import type { Logger } from 'pino';

/* ================================================================
 * DEMO SERVICE USING CONFIGMANAGER
 * ================================================================ */

const demoLoggerFactory = createServiceLoggerFactory('config-demo-service');

@Injectable()
class ConfigDemoService {
  private readonly log: Logger;
  private readonly configManager = ConfigManager.getInstance();
  private readonly configService = ConfigService.getInstance();

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = demoLoggerFactory.createComponentLogger(
      baseLogger,
      'ConfigDemoService',
    );
  }

  demonstrateConfigManager() {
    Log.minimal.info(this.log, 'Starting ConfigManager demonstration', {
      method: 'demonstrateConfigManager',
    });

    console.log('\n🔧 ConfigManager Features Demo\n');

    // 1. Initialize with service-specific logging
    console.log('1. Initializing ConfigManager with service name...');
    const validation = this.configManager.validateAndLog(
      this.log,
      'config-demo-service',
    );
    console.log(
      `   ✅ Validation result: ${validation.valid ? 'PASSED' : 'FAILED'}`,
    );

    // 2. Immutable config access
    console.log('\n2. Testing immutable config access...');
    const config = this.configManager.getLoggingConfig();
    console.log('   📋 Logging config:', JSON.stringify(config, null, 2));
    try {
      (config as any).level = 'debug'; // This should fail
      console.log('   ❌ Config is not properly frozen!');
    } catch (error) {
      console.log('   ✅ Config is properly frozen and immutable');
    }

    // 3. Feature flags
    console.log('\n3. Testing feature flags...');
    const features = [
      'hot-reload',
      'debug-mode',
      'performance-monitoring',
    ] as const;

    features.forEach((feature) => {
      const supported = this.configManager.supportsFeature(feature);
      console.log(`   ${supported ? '✅' : '❌'} ${feature}: ${supported}`);
    });

    // 4. Aspect validation
    console.log('\n4. Testing aspect validation...');
    const aspects = ['logging', 'database', 'server'] as const;

    aspects.forEach((aspect) => {
      const result = this.configManager.validateAspect(aspect);
      console.log(
        `   ${result.valid ? '✅' : '❌'} ${aspect}: ${result.valid ? 'VALID' : 'INVALID'}`,
      );
      if (!result.valid && result.errors.length > 0) {
        console.log(`     Errors: ${result.errors.join(', ')}`);
      }
    });

    // 5. Configuration summary
    console.log('\n5. Getting configuration summary...');
    const summary = this.configManager.getConfigSummary();
    console.log('   📊 Config Summary:');
    console.log(`     Environment: ${summary.environment}`);
    console.log(`     Production: ${summary.isProduction}`);
    console.log(`     Containerized: ${summary.isContainerized}`);
    console.log(`     Log Level: ${summary.logging.level}`);
    console.log(`     Features: ${JSON.stringify(summary.features, null, 6)}`);

    // 6. Convenience logging
    console.log('\n6. Testing convenience logging methods...');
    this.configManager.logInfo('ConfigManager info logging test', {
      demo: true,
      timestamp: new Date().toISOString(),
    });

    this.configManager.logWarning('ConfigManager warning logging test', {
      demo: true,
      level: 'warning',
    });

    try {
      throw new Error('Demo error for ConfigManager');
    } catch (error) {
      this.configManager.logError(
        error as Error,
        'ConfigManager error logging test',
        { demo: true, errorType: 'intentional' },
      );
    }

    console.log('   ✅ Convenience logging methods completed');

    return {
      validation,
      config,
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  compareWithConfigService() {
    console.log('\n⚖️  ConfigService vs ConfigManager Comparison\n');

    // Initialize ConfigService
    console.log('1. Initializing legacy ConfigService...');
    this.configService.validateAndLog(this.log);
    console.log('   ✅ ConfigService initialized');

    // Compare basic functionality
    console.log('\n2. Comparing basic functionality...');

    const configServiceData = {
      environment: this.configService.getEnvironment(),
      isProduction: this.configService.isProduction(),
      isContainerized: this.configService.isContainerized(),
      loggingConfig: this.configService.getLoggingConfig(),
    };

    const configManagerData = {
      environment: this.configManager.getEnvironment(),
      isProduction: this.configManager.isProduction(),
      isContainerized: this.configManager.isContainerized(),
      loggingConfig: this.configManager.getLoggingConfig(),
    };

    console.log(
      '   📊 ConfigService data:',
      JSON.stringify(configServiceData, null, 2),
    );
    console.log(
      '   📊 ConfigManager data:',
      JSON.stringify(configManagerData, null, 2),
    );

    // Test exclusive ConfigManager features
    console.log('\n3. ConfigManager exclusive features...');
    console.log('   🚀 Feature flags: Available in ConfigManager only');
    console.log('   🔒 Immutable config: Available in ConfigManager only');
    console.log('   ✅ Aspect validation: Available in ConfigManager only');
    console.log('   📋 Config summary: Available in ConfigManager only');
    console.log('   🏷️  Service name support: Enhanced in ConfigManager');

    return {
      configService: configServiceData,
      configManager: configManagerData,
      comparison: {
        basicFunctionality: 'equivalent',
        advancedFeatures: 'configManager superior',
        immutability: 'configManager only',
        serviceNameSupport: 'configManager enhanced',
      },
    };
  }
}

/* ================================================================
 * DEMO MODULE
 * ================================================================ */

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    LoggingModule,
  ],
  providers: [ConfigDemoService, demoLoggerFactory.createAppLoggerProvider()],
})
class ConfigDemoModule {}

/* ================================================================
 * DEMONSTRATION RUNNER
 * ================================================================ */

async function runConfigDemo() {
  console.log('\n🚀 Starting ConfigManager vs ConfigService Demo\n');

  const app = await NestFactory.createApplicationContext(ConfigDemoModule, {
    logger: false, // Disable default logger for cleaner output
  });

  const demoService = app.get(ConfigDemoService);

  console.log('🔧 Testing ConfigManager...');
  const configManagerResult = demoService.demonstrateConfigManager();

  console.log('\n⚖️  Comparing with ConfigService...');
  const comparisonResult = demoService.compareWithConfigService();

  console.log('\n📋 Summary of Improvements:\n');
  console.log('✅ ConfigManager provides:');
  console.log('   • Immutable configuration snapshots');
  console.log('   • Production-only validation gating');
  console.log('   • Feature flag support based on environment');
  console.log('   • Aspect-specific validation methods');
  console.log('   • Comprehensive configuration summaries');
  console.log('   • Enhanced service name integration');
  console.log('   • Initialize-once API with explicit base logger');
  console.log('   • Returned validation results for caller branching');
  console.log('   • Centralized configuration access patterns');

  console.log('\n🔄 Migration Path:');
  console.log('   • ConfigService remains available for compatibility');
  console.log('   • ConfigManager can be adopted incrementally');
  console.log('   • Both can coexist in the same application');
  console.log('   • ConfigManager is recommended for new development');

  await app.close();

  return {
    configManager: configManagerResult,
    comparison: comparisonResult,
    timestamp: new Date().toISOString(),
  };
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runConfigDemo()
    .then((result) => {
      console.log('\n✅ Demo completed successfully!');
      console.log('\n📊 Results saved to demo results:', {
        timestamp: result.timestamp,
        configManagerFeatures: Object.keys(result.configManager),
        comparisonResults: Object.keys(result.comparison),
      });
    })
    .catch((error) => {
      console.error('\n❌ Demo failed:', error);
      process.exit(1);
    });
}

export { runConfigDemo, ConfigDemoService };
