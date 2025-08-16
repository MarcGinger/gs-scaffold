import pino from 'pino';
import { ClsService } from 'nestjs-cls';
import { AppConfigUtil } from '../config/app-config.util';

/**
 * Builds an application logger with CLS context integration.
 * This logger automatically includes traceId, correlationId, tenantId, and userId
 * from CLS context in every log entry.
 * Uses centralized configuration from AppConfigUtil.
 */
export function buildAppLogger(cls: ClsService) {
  const loggingConfig = AppConfigUtil.getLoggingConfig();

  let transport: pino.TransportSingleOptions | undefined;
  if (loggingConfig.sink === 'console' && loggingConfig.pretty) {
    transport = {
      target: 'pino-pretty',
      options: { translateTime: 'UTC:isoTime' },
    };
  } else if (loggingConfig.sink === 'loki') {
    transport = {
      target: 'pino-loki',
      options: {
        host: loggingConfig.loki.url,
        basicAuth: loggingConfig.loki.basicAuth,
        batching: true,
        interval: 2000,
        labels: {
          app: loggingConfig.appName,
          env: loggingConfig.environment,
        },
      },
    };
  } else if (loggingConfig.sink === 'elasticsearch') {
    transport = {
      target: 'pino-elasticsearch',
      options: {
        node: loggingConfig.elasticsearch.node,
        index: loggingConfig.elasticsearch.index,
        esVersion: 8,
      },
    };
  }

  return pino({
    level: loggingConfig.level,
    transport,
    base: {
      app: loggingConfig.appName,
      environment: loggingConfig.environment,
      version: loggingConfig.appVersion,
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
