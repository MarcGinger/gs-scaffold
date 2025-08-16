import { Injectable, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pino from 'pino';
import type { Logger, LoggerOptions, DestinationStream } from 'pino';
import { randomUUID } from 'crypto';
import * as os from 'os';
import { ILogger } from 'src/shared/logger';

@Injectable()
export class PinoLogger implements ILogger {
  private readonly logger: Logger;

  constructor(
    @Optional() @Inject(ConfigService) private configService?: ConfigService,
  ) {
    // Get config values from ConfigService if available, otherwise from process.env
    const getConfigValue = (key: string, defaultValue: string): string => {
      if (this.configService) {
        return this.configService.get<string>(key) ?? defaultValue;
      }
      return process.env[key] ?? defaultValue;
    };

    // Base options for all logging configurations
    const options: LoggerOptions = {
      level: getConfigValue('LOG_LEVEL', 'info'),
      timestamp: pino.stdTimeFunctions.isoTime, // ISO 8601 timestamps
      formatters: {
        level(label) {
          return { level: label }; // emit "level":"info" instead of "level":30
        },
      },
      serializers: {
        err: pino.stdSerializers.err, // structured error reporting
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'password',
          'secret',
          'creditCard',
        ], // remove sensitive fields
        censor: '[REDACTED]',
      },
      base: {
        app: getConfigValue('APP_NAME', 'gsnest-template'),
        environment: getConfigValue('NODE_ENV', 'development'),
        version: getConfigValue('APP_VERSION', '0.0.1'),
        hostname: getConfigValue('HOSTNAME', os.hostname()),
      },
    };

    // Add pretty printing in development
    const nodeEnv = getConfigValue('NODE_ENV', 'development');
    if (nodeEnv !== 'production') {
      options.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      };
    }

    // Configure the destination based on environment
    let destination: DestinationStream | undefined;

    // Use file logging if configured, otherwise use stdout
    const logFilePath = getConfigValue('LOG_FILE_PATH', '');
    if (logFilePath) {
      try {
        destination = pino.destination({
          dest: logFilePath,
          sync: false, // asynchronous for high throughput
          // Log rotation configuration would need pino-roll
          mkdir: true,
        });
      } catch (error) {
        console.error('Failed to create log file destination:', error);
        // Fall back to stdout
        destination = pino.destination({ dest: 1, sync: false });
      }
    } else {
      // Default to stdout
      destination = pino.destination({ dest: 1, sync: false });
    }

    // Initialize logger with configured destination
    this.logger = pino(options, destination);
  }

  /**
   * Standard log method for info level messages
   */
  log(
    message: string | object,
    context?: string | Record<string, unknown>,
  ): void {
    const contextObj = this.normalizeContext(context);
    this.logger.info(contextObj, message as string);
  }

  /**
   * Error level logging with optional stack trace
   */
  error(
    message: string | object | Error,
    trace?: string,
    context?: string | Record<string, unknown>,
  ): void {
    const contextObj = this.normalizeContext(context);

    if (trace) {
      contextObj.trace = trace;
    }

    if (message instanceof Error) {
      contextObj.err = message;
      this.logger.error(contextObj, message.message);
    } else {
      this.logger.error(contextObj, message as string);
    }
  }

  /**
   * Warning level logging
   */
  warn(
    message: string | object,
    context?: string | Record<string, unknown>,
  ): void {
    const contextObj = this.normalizeContext(context);
    this.logger.warn(contextObj, message as string);
  }

  /**
   * Debug level logging
   */
  debug(
    message: string | object,
    context?: string | Record<string, unknown>,
  ): void {
    const contextObj = this.normalizeContext(context);
    this.logger.debug(contextObj, message as string);
  }

  /**
   * Verbose level logging (maps to trace in pino)
   */
  verbose(
    message: string | object,
    context?: string | Record<string, unknown>,
  ): void {
    const contextObj = this.normalizeContext(context);
    this.logger.trace(contextObj, message as string);
  }

  /**
   * Create a child logger with bound context
   */
  child(bindings: Record<string, unknown>): Logger {
    return this.logger.child(bindings);
  }

  /**
   * Create a request-scoped logger with trace ID
   * @param req Request object with headers
   * @returns Logger instance with request context
   */
  createRequestLogger(req: { headers?: Record<string, unknown> }): Logger {
    // Extract request ID from headers or generate one
    const requestId = (req.headers?.['x-request-id'] as string) || randomUUID();
    return this.logger.child({ requestId });
  }

  /**
   * Set correlation ID for tracking related logs across services
   * @param correlationId Unique correlation identifier
   * @returns Logger instance with correlation context
   */
  setCorrelationId(correlationId: string): Logger {
    return this.logger.child({ correlationId });
  }

  /**
   * Create a context-specific logger with component name
   * @param component Component name for context
   * @returns Logger instance with component context
   */
  forComponent(component: string): Logger {
    return this.logger.child({ component });
  }

  /**
   * Log structured event data
   * @param eventName Name of the event
   * @param payload Additional event data
   */
  logEvent(eventName: string, payload: Record<string, unknown>): void {
    this.logger.info(
      {
        event: eventName,
        ...payload,
      },
      `Event: ${eventName}`,
    );
  }

  /**
   * Log periodic health metrics
   */
  logHealthMetrics(): void {
    const memoryUsage = process.memoryUsage();
    this.logger.info(
      {
        type: 'metrics',
        heap: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        uptime: process.uptime(),
      },
      'System health metrics',
    );
  }

  /**
   * Helper to normalize context parameter
   */
  private normalizeContext(
    context?: string | Record<string, unknown>,
  ): Record<string, unknown> {
    if (!context) {
      return {};
    }

    if (typeof context === 'string') {
      return { context };
    }

    return context;
  }
}
