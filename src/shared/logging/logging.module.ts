import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import { APP_LOGGER_PROVIDER } from './logger.factory';
import { appLoggerProvider } from './logging.providers';
import { randomUUID } from 'crypto';

function buildTransport() {
  const sink = process.env.LOG_SINK ?? 'stdout';
  const pretty = process.env.PRETTY_LOGS === 'true';

  if (sink === 'console' && pretty) {
    return { target: 'pino-pretty', options: { translateTime: 'UTC:isoTime' } };
  }
  if (sink === 'loki') {
    return {
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
  }
  if (sink === 'elasticsearch') {
    return {
      target: 'pino-elasticsearch',
      options: {
        node: process.env.ES_NODE,
        index: process.env.ES_INDEX ?? 'app-logs',
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
        level: process.env.LOG_LEVEL ?? 'info',
        transport: buildTransport(),
        genReqId: (req) =>
          (req.headers['x-request-id'] as string) || randomUUID(),
        customAttributeKeys: { reqId: 'traceId' },
        customProps: () => ({
          app: process.env.APP_NAME ?? 'app',
          environment: process.env.NODE_ENV ?? 'local',
          version: process.env.APP_VERSION ?? '0.0.1',
        }),
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
  providers: [APP_LOGGER_PROVIDER, appLoggerProvider],
  exports: [APP_LOGGER_PROVIDER, appLoggerProvider],
})
export class LoggingModule {}

// Log sink and batching are already handled in buildTransport()
// Example environment configuration:
//
// LOG_SINK=stdout|console|loki|elasticsearch
// LOG_LEVEL=info
// APP_NAME=gsnest-template
// APP_VERSION=0.0.1
// NODE_ENV=local|development|staging|production
//
// # Loki (if LOG_SINK=loki)
// LOKI_URL=http://loki:3100
// LOKI_BASIC_AUTH=username:password  # optional
//
// # Elasticsearch (if LOG_SINK=elasticsearch)
// ES_NODE=http://elasticsearch:9200
// ES_INDEX=app-logs
//
// # Local pretty printing (optional)
// PRETTY_LOGS=true
//
// Batching is enabled for Loki by default (interval: 2000ms)
//
// To avoid logging large objects, use truncateField() in serializers or log helpers.
