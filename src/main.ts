import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import { Logger as PinoLogger } from 'pino';
import helmet from 'helmet';
import { AppConfigUtil } from './shared/config/app-config.util';
import { ConfigManager } from './shared/config/config.manager';
import { APP_LOGGER } from './shared/logging/logging.providers';
import { Log } from './shared/logging/structured-logger';
import { ResultInterceptor } from './shared/errors/result.interceptor';
import { SecurityConfigService } from './shared/security/config/security-config.service';
import { INestApplication } from '@nestjs/common';

async function bootstrap() {
  let baseLogger: PinoLogger | undefined;

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

    console.log('✅ Configuration validation passed');

    // Create the NestJS application with buffered logs
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
    });

    // CRITICAL FIX #1: Get the raw Pino logger (not the NestJS wrapper)
    baseLogger = app.get<PinoLogger>(APP_LOGGER);

    // CRITICAL FIX #2: Use the NestJS Pino logger wrapper for app.useLogger
    const nestPinoLogger = app.get(NestPinoLogger);
    app.useLogger(nestPinoLogger);

    // CRITICAL FIX #3: Initialize ConfigManager immediately after logger setup
    const configManager = ConfigManager.getInstance();

    // CRITICAL FIX #4: ConfigManager with gs-scaffold service name
    const validation = configManager.validateAndLog(baseLogger, 'gs-scaffold');

    // Early bootstrap logging with base logger
    Log.minimal.info(baseLogger, 'Application bootstrap initiated', {
      method: 'bootstrap',
      phase: 'post-logger-init',
      validation: validation.valid,
    });

    // CRITICAL FIX #5: Ensure port is number type
    const port: number = AppConfigUtil.getPort(3010);
    const serverUrl = AppConfigUtil.buildUrl(port);

    // Enable graceful shutdown hooks
    app.enableShutdownHooks();

    // Register global Result Interceptor for automatic Result<T,E> → HTTP conversion
    app.useGlobalInterceptors(new ResultInterceptor());

    Log.minimal.info(baseLogger, 'Result Interceptor registered globally', {
      method: 'bootstrap',
      feature: 'error_management',
      description: 'Automatic Result<T,E> to HTTP response conversion enabled',
    });

    // Configure security headers and CORS
    configureApplicationSecurity(app, baseLogger);

    await app.listen(port);

    // Log successful startup
    Log.minimal.info(baseLogger, 'Application started successfully', {
      method: 'bootstrap',
      port,
      serverUrl,
      environment: configManager.getEnvironment(),
      nodeEnv: process.env.NODE_ENV,
      processId: process.pid,
    });

    // Log configuration summary for operations
    const configSummary = configManager.getConfigSummary();
    Log.minimal.info(baseLogger, 'Application configuration summary', {
      method: 'bootstrap',
      environment: configSummary.environment,
      isProduction: configSummary.isProduction,
      isContainerized: configSummary.isContainerized,
      logLevel: configSummary.logging.level,
      features: configSummary.features,
    });

    // Log server configurations for documentation/debugging
    const serverConfigs = configManager.getServerConfigurations(port);
    Log.minimal.info(baseLogger, 'Server endpoints available', {
      method: 'bootstrap',
      endpoints: serverConfigs,
    });

    // Set up graceful shutdown handlers
    setupGracefulShutdown(app, baseLogger);
  } catch (err) {
    // CRITICAL FIX #6: Enhanced error handling with proper fallbacks
    const error = err as Error;

    if (baseLogger) {
      // Use structured logging if logger is available
      try {
        const configManager = ConfigManager.getInstance();
        configManager.logError(error, 'Application failed to start', {
          method: 'bootstrap',
          environment: AppConfigUtil.getEnvironment(),
          nodeEnv: process.env.NODE_ENV,
          errorStack: error.stack,
        });
      } catch {
        // Fallback to base logger
        Log.minimal.error(baseLogger, error, 'Application startup failed', {
          method: 'bootstrap',
          fallback: 'config-manager-unavailable',
        });
      }
    } else {
      // Fallback to console logging if no logger available
      console.error('❌ Application failed to start:', error.message);
      console.error('Stack trace:', error.stack);
    }

    process.exit(1);
  }
}

/**
 * Set up graceful shutdown handling for production deployment
 */
function setupGracefulShutdown(app: any, logger: PinoLogger) {
  const shutdown = async (signal: string) => {
    Log.minimal.info(logger, `Received ${signal}, shutting down gracefully`, {
      method: 'shutdown',
      signal,
      processId: process.pid,
    });

    try {
      await app.close();
      Log.minimal.info(logger, 'Application closed successfully', {
        method: 'shutdown',
        signal,
      });
      process.exit(0);
    } catch (error) {
      Log.minimal.error(logger, error as Error, 'Error during shutdown', {
        method: 'shutdown',
        signal,
      });
      process.exit(1);
    }
  };

  // Handle common shutdown signals
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Handle uncaught exceptions and rejections
  process.on('uncaughtException', (error) => {
    Log.minimal.error(logger, error, 'Uncaught exception', {
      method: 'error-handler',
      type: 'uncaughtException',
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    Log.minimal.error(logger, reason as Error, 'Unhandled rejection', {
      method: 'error-handler',
      type: 'unhandledRejection',
      promiseInfo: 'Promise details omitted for security',
    });
    process.exit(1);
  });
}

/**
 * Configure application security headers and CORS
 */
function configureApplicationSecurity(
  app: INestApplication,
  logger: PinoLogger,
): void {
  try {
    // Get security configuration
    const securityConfigService = app.get(SecurityConfigService);
    const corsConfig = securityConfigService.getValidatedCorsConfig();
    const environment = ConfigManager.getInstance().getEnvironment();
    const isProduction = environment === 'production';

    // Configure Helmet security headers
    app.use(
      helmet({
        // Content Security Policy - strict for production
        contentSecurityPolicy: isProduction
          ? {
              directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
              },
            }
          : false, // Disable in development for easier debugging

        // Cross Origin Embedder Policy
        crossOriginEmbedderPolicy: isProduction,

        // Cross Origin Opener Policy
        crossOriginOpenerPolicy: { policy: 'same-origin' },

        // Cross Origin Resource Policy
        crossOriginResourcePolicy: { policy: 'cross-origin' },

        // DNS Prefetch Control
        dnsPrefetchControl: { allow: false },

        // Frame guard
        frameguard: { action: 'deny' },

        // Hide powered by header
        hidePoweredBy: true,

        // HSTS - only in production with HTTPS
        hsts: isProduction
          ? {
              maxAge: 31536000, // 1 year
              includeSubDomains: true,
              preload: true,
            }
          : false,

        // IE No Open
        ieNoOpen: true,

        // No Sniff
        noSniff: true,

        // Origin Agent Cluster
        originAgentCluster: true,

        // Permitted Cross Domain Policies
        permittedCrossDomainPolicies: false,

        // Referrer Policy
        referrerPolicy: { policy: 'no-referrer' },

        // X-XSS-Protection
        xssFilter: true,
      }),
    );

    // Configure CORS
    app.enableCors({
      origin: corsConfig.allowedOrigins,
      credentials: corsConfig.allowCredentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Correlation-ID',
        'X-Tenant-ID',
      ],
      exposedHeaders: ['X-Correlation-ID', 'X-Rate-Limit-*'],
      maxAge: 86400, // 24 hours
    });

    Log.minimal.info(logger, 'Security configuration applied', {
      method: 'configureApplicationSecurity',
      corsOrigins: corsConfig.allowedOrigins.length,
      corsCredentials: corsConfig.allowCredentials,
      environment,
      isProduction,
      securityFeatures: {
        helmet: true,
        cors: true,
        csp: isProduction,
        hsts: isProduction,
      },
    });
  } catch (error) {
    Log.minimal.error(
      logger,
      error as Error,
      'Failed to configure application security',
      {
        method: 'configureApplicationSecurity',
        error: (error as Error).message,
      },
    );
    throw error;
  }
}

void bootstrap();
