# GS-Scaffold Logging API Reference

> **Complete API documentation for the centralized logging system components.**

## Table of Contents

1. [Structured Logger API](#structured-logger-api)
2. [Logger Factory API](#logger-factory-api)
3. [Middleware APIs](#middleware-apis)
4. [Integration Helpers](#integration-helpers)
5. [Type Definitions](#type-definitions)
6. [Configuration Options](#configuration-options)

---

## Structured Logger API

### `Log` Object

Central logging utility providing typed, structured logging methods.

#### `Log.info(logger, message, context)`

Logs informational messages.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `message: string` - Human-readable log message
- `context: BaseCtx & Record<string, any>` - Structured context

**Example:**

```typescript
Log.info(logger, 'User login successful', {
  service: 'auth-service',
  component: 'LoginController',
  method: 'login',
  userId: '123',
  timingMs: 45,
});
```

#### `Log.warn(logger, message, context)`

Logs warning messages with optional retry context.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `message: string` - Human-readable warning message
- `context: BaseCtx & RetryCtx & Record<string, any>` - Structured context with retry info

**Example:**

```typescript
Log.warn(logger, 'API rate limit approaching', {
  service: 'api-gateway',
  component: 'RateLimiter',
  method: 'checkLimit',
  currentRequests: 85,
  limit: 100,
  retry: { attempt: 1, backoffMs: 1000 },
});
```

#### `Log.error(logger, error, message, context)`

Logs error messages with exception details.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `error: unknown` - Error object or exception
- `message: string` - Human-readable error message
- `context: BaseCtx & RetryCtx & Record<string, any>` - Structured context

**Example:**

```typescript
Log.error(logger, error, 'Database connection failed', {
  service: 'user-service',
  component: 'UserRepository',
  method: 'findById',
  userId: '123',
  retry: { attempt: 2, backoffMs: 2000 },
});
```

#### `Log.debug(logger, message, context)`

Logs debug messages (typically filtered in production).

**Parameters:**

- `logger: Logger` - Pino logger instance
- `message: string` - Debug message
- `context: BaseCtx & Record<string, any>` - Structured context

**Example:**

```typescript
Log.debug(logger, 'Cache lookup performed', {
  service: 'cache-service',
  component: 'RedisCache',
  method: 'get',
  cacheKey: 'user:123',
  cacheHit: true,
});
```

### HTTP-Specific Methods

#### `Log.httpRequest(logger, context)`

Logs successful HTTP requests.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `context: BaseCtx & HttpRequestContext` - HTTP-specific context

**Context Type:**

```typescript
type HttpRequestContext = {
  method: string; // HTTP method (GET, POST, etc.)
  url: string; // Request URL
  statusCode: number; // HTTP status code
  timingMs: number; // Request duration
};
```

**Example:**

```typescript
Log.httpRequest(logger, {
  service: 'user-service',
  component: 'UserController',
  method: 'getUser',
  method: 'GET',
  url: '/users/123',
  statusCode: 200,
  timingMs: 45,
});
```

#### `Log.httpError(logger, error, context)`

Logs failed HTTP requests.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `error: unknown` - Error that occurred
- `context: BaseCtx & HttpErrorContext` - HTTP error context

**Example:**

```typescript
Log.httpError(logger, error, {
  service: 'user-service',
  component: 'UserController',
  method: 'getUser',
  method: 'GET',
  url: '/users/123',
  statusCode: 500,
});
```

### EventStore-Specific Methods

#### `Log.esdbProjectionStarted(logger, context)`

Logs EventStore projection startup.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `context: EsdbCtx` - EventStore context

**Example:**

```typescript
Log.esdbProjectionStarted(logger, {
  service: 'order-service',
  component: 'OrderProjectionManager',
  method: 'startProjection',
  esdb: {
    category: 'order.v1',
    stream: '$ce-order.v1',
    subscription: 'order-catchup',
  },
});
```

#### `Log.esdbCatchupNotFound(logger, context)`

Logs when EventStore category stream is not found (benign condition).

**Parameters:**

- `logger: Logger` - Pino logger instance
- `context: EsdbCtx` - EventStore context

**Example:**

```typescript
Log.esdbCatchupNotFound(logger, {
  service: 'order-service',
  component: 'OrderProjectionManager',
  method: 'startProjection',
  esdb: {
    category: 'order.v1',
    stream: '$ce-order.v1',
  },
});
```

### BullMQ-Specific Methods

#### `Log.bullQueued(logger, context)`

Logs when a job is queued in BullMQ.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `context: BullCtx` - BullMQ context

**Example:**

```typescript
Log.bullQueued(logger, {
  service: 'notification-service',
  component: 'EmailService',
  method: 'sendEmail',
  bull: {
    queue: 'email-queue',
    jobId: 'email-123',
    attempt: 1,
  },
});
```

#### `Log.bullFailed(logger, error, context)`

Logs when a BullMQ job fails.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `error: unknown` - Error that caused failure
- `context: BullCtx & RetryCtx` - BullMQ and retry context

**Example:**

```typescript
Log.bullFailed(logger, error, {
  service: 'notification-service',
  component: 'EmailWorker',
  method: 'processEmail',
  bull: {
    queue: 'email-queue',
    jobId: 'email-123',
    attempt: 2,
  },
  retry: { attempt: 2, backoffMs: 5000 },
});
```

#### `Log.bullRetry(logger, context)`

Logs when a BullMQ job is retried.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `context: BullCtx & RetryCtx` - BullMQ and retry context

### Utility Functions

#### `warnRateLimited(logger, key, message, context, minMs?)`

Rate-limited warning to prevent log spam.

**Parameters:**

- `logger: Logger` - Pino logger instance
- `key: string` - Unique key for rate limiting
- `message: string` - Warning message
- `context: BaseCtx & Record<string, any>` - Log context
- `minMs?: number` - Minimum milliseconds between warnings (default: 60000)

**Example:**

```typescript
warnRateLimited(
  logger,
  'payment-gateway-slow',
  'Payment gateway responding slowly',
  {
    service: 'payment-service',
    component: 'PaymentGateway',
    method: 'processPayment',
    responseTimeMs: 5000,
  },
  30000, // Warn at most once every 30 seconds
);
```

---

## Logger Factory API

### `buildAppLogger(cls: ClsService): Logger`

Creates a Pino logger instance with CLS context integration.

**Parameters:**

- `cls: ClsService` - NestJS CLS service for async context

**Returns:**

- `Logger` - Configured Pino logger with automatic context injection

**Features:**

- Automatic `traceId`, `correlationId`, `tenantId`, `userId` injection
- Environment-driven sink configuration
- Proper error serialization
- Base application metadata

**Example:**

```typescript
@Injectable()
export class MyService {
  private logger: Logger;

  constructor(private cls: ClsService) {
    this.logger = buildAppLogger(cls);
  }
}
```

### `APP_LOGGER_PROVIDER`

Dependency injection provider for the logger.

**Usage:**

```typescript
@Module({
  providers: [APP_LOGGER_PROVIDER],
  exports: [APP_LOGGER_PROVIDER],
})
export class LoggingModule {}

// In services:
@Injectable()
export class MyService {
  constructor(@Inject('APP_LOGGER') private logger: Logger) {}
}
```

---

## Middleware APIs

### `TraceMiddleware`

Basic trace propagation middleware.

**Features:**

- Extracts or generates `traceId` from headers
- Sets CLS context for the request
- Echo trace ID in response headers
- Supports W3C `traceparent` format

**Headers Processed:**

- `traceparent` - W3C trace context
- `x-request-id` - Custom trace ID

**Headers Set:**

- `x-request-id` - Echo of trace ID

**Usage:**

```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
```

### `EnhancedTraceMiddleware`

Advanced trace middleware with additional features.

**Features:**

- All features of `TraceMiddleware`
- Debug-by-trace functionality
- Multi-tenant context extraction
- Correlation ID support
- User context propagation

**Additional Headers Processed:**

- `x-debug-trace` - Enable debug logging for trace
- `x-correlation-id` - Business correlation ID
- `x-tenant-id` - Multi-tenant context
- `x-user-id` - User context

**Additional Headers Set:**

- `x-correlation-id` - Echo correlation ID
- `x-debug-trace` - Echo debug flag

**Usage:**

```typescript
// Replace TraceMiddleware with EnhancedTraceMiddleware
consumer.apply(EnhancedTraceMiddleware).forRoutes('*');
```

### Debug Functions

#### `debugByTrace(logger, message, context, cls)`

Conditional debug logging based on trace flag.

**Parameters:**

- `logger: any` - Logger instance
- `message: string` - Debug message
- `context: Record<string, any>` - Log context
- `cls: ClsService` - CLS service instance

**Example:**

```typescript
debugByTrace(
  logger,
  'Detailed processing information',
  { step: 'validation', data: processedData },
  this.cls,
);
// Only logs if x-debug-trace header was set to 'true'
```

#### `isDebugTraceEnabled(cls): boolean`

Check if debug tracing is enabled for current context.

**Parameters:**

- `cls: ClsService` - CLS service instance

**Returns:**

- `boolean` - True if debug tracing is enabled

---

## Integration Helpers

### BullMQ Integration

#### `addJobWithTrace(queue, cls, data, domainId)`

Adds a job to BullMQ queue with trace context.

**Parameters:**

- `queue: Queue` - BullMQ queue instance
- `cls: ClsService` - CLS service for context
- `data: any` - Job data
- `domainId: string` - Unique job identifier

**Returns:**

- `Promise<Job>` - Queued job with trace metadata

**Example:**

```typescript
const job = await addJobWithTrace(
  this.emailQueue,
  this.cls,
  { email: 'user@example.com', template: 'welcome' },
  `email-${userId}-${timestamp}`,
);
```

#### `setTraceContextOnJobStart(worker, cls)`

Sets up trace context when BullMQ jobs start processing.

**Parameters:**

- `worker: Worker` - BullMQ worker instance
- `cls: ClsService` - CLS service

**Example:**

```typescript
@Injectable()
export class EmailWorkerService {
  constructor(
    private cls: ClsService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {
    const worker = new Worker('email', this.processEmail.bind(this));
    setTraceContextOnJobStart(worker, this.cls);
  }
}
```

### EventStore Integration

#### `appendEventWithMetadata(appendToStream, cls, streamId, eventType, data)`

Appends event to EventStore with trace metadata.

**Parameters:**

- `appendToStream: Function` - EventStore append function
- `cls: ClsService` - CLS service for context
- `streamId: string` - Stream identifier
- `eventType: string` - Event type
- `data: any` - Event data

**Example:**

```typescript
await appendEventWithMetadata(
  this.eventStore.appendToStream,
  this.cls,
  `order-${orderId}`,
  'OrderCreated',
  { orderId, customerId, amount },
);
```

---

## Type Definitions

### Base Types

#### `BaseCtx`

Required fields for all log entries.

```typescript
type BaseCtx = {
  service: string; // Service name (low-cardinality)
  component: string; // Component/class name
  method: string; // Method/function name
  expected?: boolean; // Mark benign conditions
  timingMs?: number; // Operation duration
};
```

#### `RetryCtx`

Context for retry operations.

```typescript
type RetryCtx = {
  retry?: {
    attempt: number; // Current retry attempt
    backoffMs: number; // Backoff delay in milliseconds
  };
};
```

### Domain-Specific Types

#### `EsdbCtx`

EventStore-specific context.

```typescript
type EsdbCtx = BaseCtx & {
  esdb?: {
    category?: string; // Event category
    stream?: string; // Stream name
    subscription?: string; // Subscription name
    eventId?: string; // Event identifier
  };
};
```

#### `BullCtx`

BullMQ-specific context.

```typescript
type BullCtx = BaseCtx & {
  bull?: {
    queue: string; // Queue name
    jobId?: string; // Job identifier
    attempt?: number; // Attempt number
  };
};
```

### HTTP Types

```typescript
type HttpRequestContext = BaseCtx & {
  method: string; // HTTP method
  url: string; // Request URL
  statusCode: number; // Response status
  timingMs: number; // Request duration
};

type HttpErrorContext = BaseCtx & {
  method: string; // HTTP method
  url: string; // Request URL
  statusCode: number; // Error status
};
```

---

## Configuration Options

### Environment Variables

| Variable          | Type                                   | Default    | Description                 |
| ----------------- | -------------------------------------- | ---------- | --------------------------- |
| `LOG_SINK`        | `stdout\|console\|loki\|elasticsearch` | `stdout`   | Log destination             |
| `LOG_LEVEL`       | `debug\|info\|warn\|error\|fatal`      | `info`     | Minimum log level           |
| `PRETTY_LOGS`     | `boolean`                              | `false`    | Enable pretty printing      |
| `APP_NAME`        | `string`                               | `app`      | Application name            |
| `APP_VERSION`     | `string`                               | `0.0.1`    | Application version         |
| `NODE_ENV`        | `string`                               | `local`    | Environment name            |
| `LOKI_URL`        | `string`                               | -          | Loki endpoint URL           |
| `LOKI_BASIC_AUTH` | `string`                               | -          | Loki basic auth (user:pass) |
| `ES_NODE`         | `string`                               | -          | Elasticsearch node URL      |
| `ES_INDEX`        | `string`                               | `app-logs` | Elasticsearch index         |

### Transport Configuration

#### Stdout Transport

```typescript
// No transport config - uses default Pino stdout
{
  sink: 'stdout',
  // Logs go to stdout as JSON
}
```

#### Console Transport (Development)

```typescript
{
  sink: 'console',
  pretty: true,
  transport: {
    target: 'pino-pretty',
    options: {
      translateTime: 'UTC:isoTime',
      colorize: true,
      ignore: 'pid,hostname'
    }
  }
}
```

#### Loki Transport

```typescript
{
  sink: 'loki',
  transport: {
    target: 'pino-loki',
    options: {
      host: process.env.LOKI_URL,
      basicAuth: process.env.LOKI_BASIC_AUTH,
      batching: true,
      interval: 2000,
      labels: {
        app: process.env.APP_NAME,
        env: process.env.NODE_ENV,
      },
    }
  }
}
```

#### Elasticsearch Transport

```typescript
{
  sink: 'elasticsearch',
  transport: {
    target: 'pino-elasticsearch',
    options: {
      node: process.env.ES_NODE,
      index: process.env.ES_INDEX,
      esVersion: 8,
    }
  }
}
```

### CLS Configuration

```typescript
ClsModule.forRoot({
  global: true, // Make CLS available globally
  middleware: {
    mount: true, // Auto-mount CLS middleware
    generateId: true, // Generate request IDs
  },
});
```

### Logger Configuration

```typescript
// Base logger configuration
{
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    app: process.env.APP_NAME ?? 'app',
    environment: process.env.NODE_ENV ?? 'local',
    version: process.env.APP_VERSION ?? '0.0.1',
  },
  mixin() {
    // Automatic context injection from CLS
    return {
      traceId: cls.get('traceId'),
      correlationId: cls.get('correlationId'),
      tenantId: cls.get('tenantId'),
      userId: cls.get('userId'),
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
}
```

### Performance Tuning

#### High-Throughput Settings

```typescript
// For high-volume applications
{
  // Reduce log level
  level: 'warn',

  // Use stdout with external shipping
  sink: 'stdout',

  // Disable pretty printing
  pretty: false,

  // Sample debug logs
  hooks: {
    logMethod(inputArgs, method) {
      if (inputArgs[0]?.level === 30 && Math.random() > 0.1) {
        return; // Sample debug logs
      }
      return method.apply(this, inputArgs);
    }
  }
}
```

#### Memory-Optimized Settings

```typescript
// For memory-constrained environments
{
  // Limit object depth
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      // Don't serialize full headers/body
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      // Don't serialize response body
    }),
  },

  // Truncate long fields
  formatters: {
    log(object) {
      // Truncate message if too long
      if (object.msg?.length > 500) {
        object.msg = object.msg.substring(0, 500) + '...';
      }
      return object;
    }
  }
}
```

---

This API reference provides complete documentation for all components of the centralized logging system, enabling developers to effectively integrate and use the logging capabilities in their applications.
