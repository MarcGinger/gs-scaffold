import pino from 'pino';
import { ClsService } from 'nestjs-cls';

/**
 * Builds an application logger with CLS context integration.
 * This logger automatically includes traceId, correlationId, tenantId, and userId
 * from CLS context in every log entry.
 */
export function buildAppLogger(cls: ClsService) {
  const sink = process.env.LOG_SINK ?? 'stdout';
  const pretty = process.env.PRETTY_LOGS === 'true';

  let transport: pino.TransportSingleOptions | undefined;
  if (sink === 'console' && pretty) {
    transport = {
      target: 'pino-pretty',
      options: { translateTime: 'UTC:isoTime' },
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
}

/**
 * Creates a logger service provider for dependency injection.
 * This allows injecting a logger that automatically includes CLS context.
 */
export const APP_LOGGER_PROVIDER = {
  provide: 'APP_LOGGER',
  useFactory: (cls: ClsService) => buildAppLogger(cls),
  inject: [ClsService],
};
