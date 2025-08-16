import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import { appLoggerProvider } from './logging.providers';
import { randomUUID } from 'crypto';
import { AppConfigUtil } from '../config/app-config.util';

function buildTransport() {
  const config = AppConfigUtil.getLoggingConfig();

  if (config.sink === 'console' && config.pretty) {
    return { target: 'pino-pretty', options: { translateTime: 'UTC:isoTime' } };
  }
  if (config.sink === 'loki') {
    return {
      target: 'pino-loki',
      options: {
        host: config.loki.url,
        basicAuth: config.loki.basicAuth,
        batching: true,
        interval: 2000,
        labels: {
          app: config.appName,
          env: config.environment,
        },
      },
    };
  }
  if (config.sink === 'elasticsearch') {
    return {
      target: 'pino-elasticsearch',
      options: {
        node: config.elasticsearch.node,
        index: config.elasticsearch.index,
        esVersion: 8,
      },
    };
  }
  return undefined; // stdout (ship with Promtail/Filebeat)
}

function redactHeaders(headers: Record<string, any>): Record<string, any> {
  const redacted = { ...headers };
  if (redacted['authorization']) redacted['authorization'] = '[REDACTED]';
  if (redacted['cookie']) redacted['cookie'] = '[REDACTED]';
  return redacted;
}

function truncateField(value: any, maxLength = 256): any {
  if (typeof value === 'string' && value.length > maxLength) {
    return value.slice(0, maxLength) + '...';
  }
  return value;
}

export function redactPayload(
  payload: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in payload) {
    if (
      ['password', 'token', 'secret', 'card', 'connectionString'].includes(key)
    ) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = truncateField(payload[key]);
    }
  }
  return result;
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: AppConfigUtil.getLogLevel(),
        transport: buildTransport(),
        genReqId: (req) =>
          (req.headers['x-request-id'] as string) || randomUUID(),
        customAttributeKeys: { reqId: 'traceId' },
        customProps: () => {
          const config = AppConfigUtil.getLoggingConfig();
          return {
            app: config.appName,
            environment: config.environment,
            version: config.appVersion,
          };
        },
        serializers: {
          req(req: any) {
            return {
              method: req.method,
              url: req.url,
              headers: { 'user-agent': req.headers['user-agent'] },
            };
          },
          res(res: any) {
            return { statusCode: res.statusCode };
          },
          err(err: Error) {
            return {
              type: err?.name,
              message: err?.message,
              stack: err?.stack,
            };
          },
        },
      },
    }),
  ],
  providers: [appLoggerProvider],
  exports: [appLoggerProvider],
})
export class LoggingModule {}

// Log sink and batching are already handled in buildTransport()
// Example environment configuration (new standardized variables):
//
// LOGGING_CORE_SINK=stdout|console|loki|elasticsearch
// LOGGING_CORE_LEVEL=info
// LOGGING_CORE_PRETTY_ENABLED=false
// APP_CORE_NAME=gs-scaffold
// APP_CORE_VERSION=1.0.0
// NODE_ENV=local|development|staging|production
//
// # Loki (if LOGGING_CORE_SINK=loki)
// LOGGING_LOKI_URL=http://loki:3100
// LOGGING_LOKI_BASIC_AUTH=username:password  # optional
//
// # Elasticsearch (if LOGGING_CORE_SINK=elasticsearch)
// LOGGING_ELASTICSEARCH_NODE=http://elasticsearch:9200
// LOGGING_ELASTICSEARCH_INDEX=app-logs
//
// Batching is enabled for Loki by default (interval: 2000ms)
//
// To avoid logging large objects, use truncateField() in serializers or log helpers.
//
// Note: This module now uses AppConfigUtil for centralized configuration management.
// Legacy environment variables (LOG_SINK, LOG_LEVEL, APP_NAME, etc.) are no longer supported.
