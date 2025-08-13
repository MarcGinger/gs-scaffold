import { Provider } from '@nestjs/common';
import pino, { Logger } from 'pino';
import { ClsService } from 'nestjs-cls';

export const APP_LOGGER = 'APP_LOGGER';

/**
 * Creates a CLS-aware logger provider that automatically enriches logs with:
 * - Base metadata (app, environment, version, service)
 * - CLS context (traceId, correlationId, tenantId, userId)
 *
 * This means services only need to pass method-specific context.
 */
export const appLoggerProvider: Provider = {
  provide: APP_LOGGER,
  inject: [ClsService],
  useFactory: (cls: ClsService): Logger => {
    const sink = process.env.LOG_SINK ?? 'stdout';
    const pretty = process.env.PRETTY_LOGS === 'true';

    let transport: pino.TransportSingleOptions | undefined;
    if (sink === 'console' && pretty) {
      transport = {
        target: 'pino-pretty',
        options: {
          translateTime: 'UTC:isoTime',
          colorize: true,
          ignore: 'pid,hostname',
        },
      };
    } else if (sink === 'loki') {
      transport = {
        target: 'pino-loki',
        options: {
          host: process.env.LOKI_URL,
          basicAuth: process.env.LOKI_BASIC_AUTH,
          batching: true,
          interval: 2000,
          labels: {
            app: process.env.APP_NAME ?? 'app',
            env: process.env.NODE_ENV ?? 'local',
          },
        },
      };
    } else if (sink === 'elasticsearch') {
      transport = {
        target: 'pino-elasticsearch',
        options: {
          node: process.env.ES_NODE,
          index: process.env.ES_INDEX ?? 'app-logs',
          esVersion: 8,
        },
      };
    }

    return pino({
      level: process.env.LOG_LEVEL ?? 'info',
      transport,
      base: {
        app: process.env.APP_NAME ?? 'app',
        environment: process.env.NODE_ENV ?? 'local',
        version: process.env.APP_VERSION ?? '0.0.1',
        service: process.env.APP_NAME ?? 'app', // default service name
      },
      mixin() {
        return {
          traceId: cls.get<string>('traceId'),
          correlationId: cls.get<string>('correlationId'),
          tenantId: cls.get<string>('tenantId'),
          userId: cls.get<string>('userId'),
        };
      },
      serializers: {
        err(err: Error) {
          return {
            type: err?.name,
            message: err?.message,
            stack: err?.stack,
          };
        },
      },
    });
  },
};

/**
 * Helper function to create component-specific loggers.
 * Returns a child logger that always includes the component name.
 *
 * @param baseLogger - The base APP_LOGGER instance
 * @param component - Component name (usually class name)
 * @returns Child logger with component context
 */
export function createComponentLogger(
  baseLogger: Logger,
  component: string,
): Logger {
  return baseLogger.child({ component });
}
