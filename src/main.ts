import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { Logger as PinoLogger } from 'pino';
import { AppConfigUtil } from './shared/config/app-config.util';
import { ConfigManager } from './shared/config/config.manager';
import { APP_LOGGER } from './shared/logging/logging.providers';
import { Log } from './shared/logging/structured-logger';

async function bootstrap() {
  try {
    // Pre-validate configuration before creating the app
    console.log('🔧 Validating application configuration...');
    const configValidation = AppConfigUtil.validateLoggingConfig();

    if (!configValidation.valid) {
      console.error(
        '❌ Configuration validation failed:',
        configValidation.errors,
      );
      process.exit(1);
    }

    if (configValidation.warnings.length > 0) {
      console.warn('⚠️ Configuration warnings:', configValidation.warnings);
    }

    // Create the NestJS application
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
    });

    // Get the structured logger and initialize ConfigManager
    const baseLogger = app.get<PinoLogger>(APP_LOGGER);
    app.useLogger(app.get(Logger));

    // Initialize ConfigManager with application service name
    const configManager = ConfigManager.getInstance();
    const validation = configManager.validateAndLog(baseLogger, 'gs-scaffold');

    // Log application configuration summary
    const configSummary = configManager.getConfigSummary();
    Log.minimal.info(baseLogger, 'Application configuration loaded', {
      method: 'bootstrap',
      validation: validation.valid,
      environment: configSummary.environment,
      isProduction: configSummary.isProduction,
      isContainerized: configSummary.isContainerized,
      features: configSummary.features,
    });

    // Get port from configuration utility
    const port = AppConfigUtil.getPort(3010);
    const serverUrl = AppConfigUtil.buildUrl(port);

    await app.listen(port);

    Log.minimal.info(baseLogger, 'Application started successfully', {
      method: 'bootstrap',
      port,
      serverUrl,
      environment: configManager.getEnvironment(),
      nodeEnv: process.env.NODE_ENV,
      processId: process.pid,
    });

    // Log server configurations for documentation/debugging
    const serverConfigs = configManager.getServerConfigurations(port);
    Log.minimal.info(baseLogger, 'Server configurations available', {
      method: 'bootstrap',
      servers: serverConfigs,
    });
  } catch (err) {
    // Enhanced error handling with ConfigManager if available
    try {
      const configManager = ConfigManager.getInstance();
      configManager.logError(err as Error, 'Application failed to start', {
        method: 'bootstrap',
        environment: AppConfigUtil.getEnvironment(),
        nodeEnv: process.env.NODE_ENV,
      });
    } catch {
      // Fallback to console logging
      console.error('Application failed to start', err);
    }
    process.exit(1);
  }
}

void bootstrap();
