# GS-Scaffold Logging Troubleshooting Guide

> **Comprehensive troubleshooting guide for the centralized logging system.**

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
3. [Integration Problems](#integration-problems)
4. [Performance Issues](#performance-issues)
5. [Observability Stack Issues](#observability-stack-issues)
6. [Debug Techniques](#debug-techniques)
7. [Error Reference](#error-reference)

---

## Quick Diagnostics

### Health Check Commands

```bash
# 1. Check application logs
docker-compose logs app

# 2. Check Loki ingestion
docker-compose logs loki

# 3. Check Promtail shipping
docker-compose logs promtail

# 4. Check Grafana connectivity
curl -s http://localhost:3001/api/health

# 5. Verify log structure
docker-compose exec app npm run test:logs
```

### Immediate Validation

```bash
# Test logging from container
docker-compose exec app node -e "
const { Logger } = require('pino');
const logger = Logger();
logger.info({ service: 'test', component: 'diagnostic' }, 'Test log entry');
"

# Check if logs appear in Grafana
# Go to http://localhost:3001/explore
# Query: {app=\"gs-scaffold\"} |= \"Test log entry\"
```

---

## Common Issues

### 1. Logs Not Appearing

#### **Problem:** No logs in stdout/console

**Symptoms:**

- Silent application
- No log output in terminal
- Empty log files

**Diagnosis:**

```typescript
// Add to main.ts for debugging
import { Logger } from 'pino';
const debugLogger = Logger({ level: 'debug' });
debugLogger.info('Bootstrap starting');

// Check LOG_LEVEL
console.log('LOG_LEVEL:', process.env.LOG_LEVEL);
```

**Solutions:**

```bash
# 1. Check log level
export LOG_LEVEL=debug

# 2. Force console output
export LOG_SINK=console
export PRETTY_LOGS=true

# 3. Test basic Pino
node -e "require('pino')().info('test')"
```

#### **Problem:** Logs missing context (traceId, userId, etc.)

**Symptoms:**

- Logs appear but missing CLS fields
- `traceId: undefined` in logs
- Cannot correlate requests

**Diagnosis:**

```typescript
// Add to service method
Log.debug(logger, 'CLS Context Check', {
  service: 'debug',
  component: 'diagnostic',
  method: 'checkCLS',
  clsValues: {
    traceId: this.cls.get('traceId'),
    userId: this.cls.get('userId'),
    correlationId: this.cls.get('correlationId'),
  },
});
```

**Solutions:**

```typescript
// 1. Verify ClsModule is imported in AppModule
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    // other imports...
  ],
})

// 2. Ensure middleware is applied
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}

// 3. Check middleware order (CLS must be first)
consumer
  .apply(TraceMiddleware)
  .forRoutes('*')
  .apply(OtherMiddleware)
  .forRoutes('*');
```

### 2. Performance Issues

#### **Problem:** Logging causing high CPU usage

**Symptoms:**

- Application slow/unresponsive
- High CPU in production
- Memory growing over time

**Diagnosis:**

```bash
# Check log output rate
docker-compose logs app | wc -l

# Monitor memory usage
docker stats gs-scaffold-app

# Check for log loops
grep -c "debug" logs/app.log
```

**Solutions:**

```typescript
// 1. Increase log level in production
// In production.env
LOG_LEVEL = warn;

// 2. Sample debug logs
const logger = Logger({
  level: 'info',
  hooks: {
    logMethod(inputArgs, method) {
      // Sample debug logs in production
      if (inputArgs[0]?.level === 30 && Math.random() > 0.1) {
        return; // Skip 90% of debug logs
      }
      return method.apply(this, inputArgs);
    },
  },
});

// 3. Use rate limiting for warnings
import { warnRateLimited } from './structured-logger';

warnRateLimited(
  logger,
  'slow-operation',
  'Operation taking longer than expected',
  context,
  60000, // At most once per minute
);
```

#### **Problem:** Memory leaks from retained log objects

**Symptoms:**

- Memory usage growing over time
- Application eventually crashes with OOM
- Heap size keeps increasing

**Solutions:**

```typescript
// 1. Avoid circular references in log context
const safeCycle = (obj: any) => {
  const seen = new WeakSet();
  return JSON.parse(
    JSON.stringify(obj, (key, val) => {
      if (val != null && typeof val === 'object') {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    }),
  );
};

Log.info(logger, 'Safe logging', safeCycle(context));

// 2. Limit object depth and size
const truncateDeep = (obj: any, depth = 3, maxStringLength = 500): any => {
  if (depth <= 0) return '[max depth]';

  if (typeof obj === 'string' && obj.length > maxStringLength) {
    return obj.substring(0, maxStringLength) + '...';
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = truncateDeep(value, depth - 1, maxStringLength);
    }
    return result;
  }

  return obj;
};

// 3. Use structured fields instead of large objects
// Instead of:
Log.info(logger, 'Request processed', { fullRequestBody: req.body });

// Do:
Log.info(logger, 'Request processed', {
  service: 'api',
  component: 'Controller',
  method: 'process',
  requestSize: JSON.stringify(req.body).length,
  requestType: req.headers['content-type'],
});
```

### 3. Log Format Issues

#### **Problem:** Malformed JSON logs

**Symptoms:**

- Loki/Elasticsearch ingestion errors
- Grafana cannot parse logs
- Log entries appear as strings

**Diagnosis:**

```bash
# Check for invalid JSON
docker-compose logs app | head -10 | jq .

# Look for multiline logs (should be single-line JSON)
docker-compose logs app | grep -E '\n.*\{'
```

**Solutions:**

```typescript
// 1. Ensure proper Pino configuration
const logger = Logger({
  // Disable pretty printing in production
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
        }
      : undefined,

  // Ensure single-line JSON
  formatters: {
    log(object) {
      // Ensure message doesn't contain newlines
      if (object.msg) {
        object.msg = object.msg.replace(/\n/g, '\\n');
      }
      return object;
    },
  },
});

// 2. Handle error stack traces properly
const errorSerializer = (err: Error) => ({
  type: err?.constructor?.name,
  message: err?.message,
  stack: err?.stack?.replace(/\n/g, '\\n'), // Escape newlines
  code: (err as any)?.code,
  errno: (err as any)?.errno,
});

// 3. Validate context before logging
const validateContext = (context: any): boolean => {
  try {
    JSON.stringify(context);
    return true;
  } catch (error) {
    console.warn('Invalid log context:', error.message);
    return false;
  }
};
```

---

## Integration Problems

### 1. NestJS Integration Issues

#### **Problem:** Logger not injected properly

**Symptoms:**

- `logger is undefined` errors
- DI container errors
- Cannot inject logger in services

**Solutions:**

```typescript
// 1. Verify LoggingModule is imported
@Module({
  imports: [LoggingModule], // Must be imported
  controllers: [MyController],
  providers: [MyService],
})
export class FeatureModule {}

// 2. Use correct injection token
@Injectable()
export class MyService {
  constructor(
    @Inject('APP_LOGGER') private readonly logger: Logger, // Use token
  ) {}
}

// 3. Alternative: Use logger factory directly
@Injectable()
export class MyService {
  private readonly logger: Logger;

  constructor(private readonly cls: ClsService) {
    this.logger = buildAppLogger(cls);
  }
}
```

#### **Problem:** Module import order issues

**Symptoms:**

- CLS context not available
- Middleware not applied
- Circular dependency errors

**Solutions:**

```typescript
// Correct import order in AppModule:
@Module({
  imports: [
    // 1. CLS must be first and global
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),

    // 2. Logging module next
    LoggingModule,

    // 3. Other feature modules
    UserModule,
    OrderModule,
    // ...
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply trace middleware to all routes
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
```

### 2. BullMQ Integration Issues

#### **Problem:** Job logs missing trace context

**Symptoms:**

- Job logs don't have `traceId`
- Cannot correlate job execution with triggering request
- Jobs appear disconnected

**Solutions:**

```typescript
// 1. Ensure job data includes trace context
@Injectable()
export class EmailService {
  async sendWelcomeEmail(userId: string) {
    const traceId = this.cls.get('traceId');

    await this.emailQueue.add('send-welcome', {
      userId,
      // Include trace context in job data
      _trace: {
        traceId,
        correlationId: this.cls.get('correlationId'),
        parentService: 'user-service',
      },
    });
  }
}

// 2. Set context in job processor
@Processor('email')
export class EmailProcessor {
  @Process('send-welcome')
  async handleWelcomeEmail(job: Job) {
    // Restore trace context from job data
    const { _trace } = job.data;
    if (_trace) {
      this.cls.set('traceId', _trace.traceId);
      this.cls.set('correlationId', _trace.correlationId);
    }

    Log.info(this.logger, 'Processing welcome email', {
      service: 'email-service',
      component: 'EmailProcessor',
      method: 'handleWelcomeEmail',
      userId: job.data.userId,
      bull: { queue: 'email', jobId: job.id },
    });
  }
}

// 3. Use helper for consistent trace propagation
import { addJobWithTrace } from './logging/bull-integration';

const job = await addJobWithTrace(
  this.emailQueue,
  this.cls,
  { userId },
  `welcome-${userId}`,
);
```

### 3. EventStore Integration Issues

#### **Problem:** Event logs not correlated with commands

**Symptoms:**

- Events and commands have different trace IDs
- Cannot track event sourcing flow
- Command handling appears disconnected

**Solutions:**

```typescript
// 1. Propagate trace context in event metadata
import { appendEventWithMetadata } from './logging/esdb-integration';

@Injectable()
export class OrderAggregate {
  async createOrder(command: CreateOrderCommand) {
    // Process command with current trace context
    Log.info(this.logger, 'Creating order', {
      service: 'order-service',
      component: 'OrderAggregate',
      method: 'createOrder',
      orderId: command.orderId,
    });

    // Append event with trace metadata
    await appendEventWithMetadata(
      this.eventStore.appendToStream,
      this.cls,
      `order-${command.orderId}`,
      'OrderCreated',
      command,
    );
  }
}

// 2. Handle events with trace context
@EventsHandler(OrderCreatedEvent)
export class OrderCreatedHandler {
  async handle(event: OrderCreatedEvent) {
    // Extract trace context from event metadata
    const traceId = event.metadata?.traceId;
    if (traceId) {
      this.cls.set('traceId', traceId);
    }

    Log.info(this.logger, 'Order created event handled', {
      service: 'order-service',
      component: 'OrderCreatedHandler',
      method: 'handle',
      orderId: event.orderId,
      esdb: { eventId: event.eventId },
    });
  }
}
```

---

## Performance Issues

### 1. High Log Volume

#### **Problem:** Too many debug logs in production

**Solutions:**

```typescript
// 1. Environment-specific log levels
const getLogLevel = () => {
  switch (process.env.NODE_ENV) {
    case 'production':
      return 'warn';
    case 'staging':
      return 'info';
    case 'development':
      return 'debug';
    default:
      return 'info';
  }
};

// 2. Conditional debug logging
const shouldDebug = process.env.NODE_ENV !== 'production';

if (shouldDebug) {
  Log.debug(logger, 'Detailed processing info', context);
}

// 3. Use debug-by-trace for selective debugging
import { debugByTrace } from './logging/debug-helpers';

debugByTrace(
  logger,
  'Detailed user processing info',
  { step: 'validation', userData },
  this.cls,
);
// Only logs if x-debug-trace header is present
```

### 2. Log Shipping Performance

#### **Problem:** Promtail/Loki causing backpressure

**Symptoms:**

- Application logging slows down
- Disk space filling up
- Loki ingestion errors

**Solutions:**

```yaml
# 1. Optimize Promtail configuration
# promtail-config.yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push
    # Increase batch size and interval
    batchwait: 5s
    batchsize: 1048576

    # Add retry configuration
    backoff_config:
      min_period: 500ms
      max_period: 5m
      max_retries: 10

scrape_configs:
  - job_name: containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: containerlogs
          __path__: /var/log/containers/*log

    # Pipeline for processing
    pipeline_stages:
      # Parse JSON logs
      - json:
          expressions:
            level: level
            service: service
            timestamp: time

      # Sample non-essential logs
      - match:
          selector: '{job="containerlogs"} |= "debug"'
          action: drop
          drop_counter_reason: debug_sampling

      # Add labels for efficient querying
      - labels:
          level:
          service:
```

```yaml
# 2. Optimize Loki configuration
# loki-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules

# Optimize ingestion
ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
  # Increase chunk target size
  chunk_target_size: 1572864
  # Reduce retention
  max_chunk_age: 1h

# Optimize storage
storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

# Limits to prevent resource exhaustion
limits_config:
  # Limit ingestion rate
  ingestion_rate_mb: 16
  ingestion_burst_size_mb: 32

  # Limit query complexity
  max_entries_limit_per_query: 10000
  max_query_series: 500

  # Retention
  retention_period: 168h # 7 days
```

---

## Observability Stack Issues

### 1. Grafana Connection Issues

#### **Problem:** Cannot connect to Loki from Grafana

**Diagnosis:**

```bash
# Check if Loki is accessible from Grafana container
docker-compose exec grafana wget -qO- http://loki:3100/ready

# Check Loki health
curl http://localhost:3100/ready

# Verify network connectivity
docker-compose exec grafana nslookup loki
```

**Solutions:**

```yaml
# 1. Verify docker-compose networking
# docker-compose.yaml
version: '3.8'
services:
  grafana:
    # ...
    depends_on:
      - loki
    networks:
      - logging

  loki:
    # ...
    networks:
      - logging

networks:
  logging:
    driver: bridge
```

```yaml
# 2. Check Grafana datasource configuration
# grafana-provisioning/datasources.yaml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100 # Use container name
    isDefault: true
    editable: false
```

### 2. Missing Logs in Grafana

#### **Problem:** Logs visible in Loki but not in Grafana

**Diagnosis:**

```bash
# Query Loki directly
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={app="gs-scaffold"}' \
  --data-urlencode 'start=1677628800000000000' \
  --data-urlencode 'end=1677632400000000000' | jq

# Check Grafana logs
docker-compose logs grafana | grep -i error
```

**Solutions:**

```bash
# 1. Verify time range in Grafana
# Use absolute time ranges initially
# Check that log timestamps are in correct timezone

# 2. Check label consistency
# In Loki query: {app="gs-scaffold"} | json
# Verify labels match what's configured in Promtail

# 3. Test with simple query first
{job="containerlogs"}

# 4. Check for label cardinality issues
# Avoid high-cardinality labels like userIds
```

### 3. Dashboard Issues

#### **Problem:** Grafana dashboards not showing data

**Solutions:**

```json
// 1. Check dashboard queries
{
  "targets": [
    {
      "expr": "{app=\"gs-scaffold\"} |= \"error\" | json",
      "legendFormat": "Errors",
      "refId": "A"
    }
  ],
  // Ensure time range variables are set
  "time": {
    "from": "now-6h",
    "to": "now"
  }
}

// 2. Use template variables for flexibility
{
  "templating": {
    "list": [
      {
        "name": "service",
        "type": "query",
        "query": "label_values(service)",
        "datasource": "Loki"
      }
    ]
  }
}

// 3. Add fallback queries
{
  "targets": [
    {
      "expr": "{app=\"gs-scaffold\", service=\"$service\"} | json",
      "refId": "A"
    },
    {
      "expr": "{app=\"gs-scaffold\"} | json | service =~ \".*$service.*\"",
      "refId": "B",
      "hide": false
    }
  ]
}
```

---

## Debug Techniques

### 1. Enabling Debug Mode

```bash
# 1. Application debug mode
export LOG_LEVEL=debug
export NODE_ENV=development

# 2. Enable debug tracing for specific requests
curl -H "x-debug-trace: true" http://localhost:3000/api/users/123

# 3. BullMQ debug mode
export DEBUG=bull:*

# 4. EventStore debug mode
export ESDB_LOG_LEVEL=debug
```

### 2. Log Analysis Commands

```bash
# 1. Find logs by trace ID
docker-compose logs app | jq 'select(.traceId == "abc123")'

# 2. Analyze error patterns
docker-compose logs app | jq 'select(.level >= 50)' | jq .msg | sort | uniq -c

# 3. Check log volume by service
docker-compose logs app | jq .service | sort | uniq -c

# 4. Find slow operations
docker-compose logs app | jq 'select(.timingMs > 1000)'

# 5. Trace request flow
trace_id="abc123"
docker-compose logs app | jq "select(.traceId == \"$trace_id\")" | sort_by(.time)
```

### 3. Performance Profiling

```bash
# 1. Check logging overhead
node --prof index.js
node --prof-process isolate-*.log > profile.txt

# 2. Memory usage monitoring
node --inspect index.js
# Use Chrome DevTools to analyze heap

# 3. Log shipping performance
# Monitor Promtail metrics
curl http://localhost:9080/metrics | grep promtail

# 4. Loki performance
curl http://localhost:3100/metrics | grep loki_ingester
```

---

## Error Reference

### Common Error Messages

#### `TypeError: Cannot read property 'get' of undefined`

```typescript
// Problem: CLS service not available
// Solution: Ensure ClsModule is imported and global
@Module({
  imports: [
    ClsModule.forRoot({ global: true }),
    // ...
  ],
})
```

#### `Error: Cannot inject APP_LOGGER`

```typescript
// Problem: Logger provider not available
// Solution: Import LoggingModule
@Module({
  imports: [LoggingModule],
  // ...
})
```

#### `SyntaxError: Unexpected token in JSON`

```typescript
// Problem: Malformed log JSON
// Solution: Escape newlines and special characters
const sanitizeMessage = (msg: string) =>
  msg.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
```

#### `Loki push failed: 429 Too Many Requests`

```yaml
# Problem: Rate limiting in Loki
# Solution: Increase rate limits in loki-config.yaml
limits_config:
  ingestion_rate_mb: 32
  ingestion_burst_size_mb: 64
```

#### `ENOSPC: no space left on device`

```bash
# Problem: Disk space exhaustion
# Solution: Clean up logs and configure retention
docker system prune -f
docker volume prune -f

# Configure log rotation
# In docker-compose.yaml:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Debug Checklist

When logging issues occur, check:

1. **Environment Variables**
   - [ ] `LOG_LEVEL` is set appropriately
   - [ ] `LOG_SINK` matches desired output
   - [ ] `NODE_ENV` is correct

2. **Module Configuration**
   - [ ] `ClsModule` is imported and global
   - [ ] `LoggingModule` is imported in feature modules
   - [ ] Middleware is applied correctly

3. **Network Connectivity**
   - [ ] Loki is accessible from application
   - [ ] Promtail can reach log files
   - [ ] Grafana can connect to Loki

4. **Log Format**
   - [ ] Logs are valid JSON
   - [ ] No multiline log entries
   - [ ] Required fields are present

5. **Performance**
   - [ ] Log level appropriate for environment
   - [ ] No excessive debug logging
   - [ ] Rate limiting configured

This troubleshooting guide should help resolve most common issues with the centralized logging system. For complex issues, enable debug mode and analyze the full request flow using trace IDs.
