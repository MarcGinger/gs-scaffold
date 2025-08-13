# Enhanced CLS-Aware Logger Implementation

> **Complete implementation of the enhanced logging pattern with automatic context injection.**

## Overview

This implementation provides a CLS-aware logger that automatically enriches all log entries with:

- **Base metadata**: `app`, `environment`, `version`, `service`
- **Component context**: `component` (from child logger)
- **CLS context**: `traceId`, `correlationId`, `tenantId`, `userId`
- **Custom context**: Only method-specific fields need to be provided

## Implementation

### 1. Enhanced Logger Provider (`logging.providers.ts`)

```typescript
import { Provider } from '@nestjs/common';
import pino, { Logger } from 'pino';
import { ClsService } from 'nestjs-cls';

export const APP_LOGGER = 'APP_LOGGER';

export const appLoggerProvider: Provider = {
  provide: APP_LOGGER,
  inject: [ClsService],
  useFactory: (cls: ClsService): Logger => {
    return pino({
      level: process.env.LOG_LEVEL ?? 'info',
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
      // Transport configuration...
    });
  },
};

export function createComponentLogger(
  baseLogger: Logger,
  component: string,
): Logger {
  return baseLogger.child({ component });
}
```

### 2. Enhanced Structured Logger

```typescript
// Enhanced context type for use with component loggers
export type MinimalCtx = {
  method: string;
  expected?: boolean;
  timingMs?: number;
};

export const Log = {
  // Standard helpers (require service/component)
  info(logger: Logger, msg: string, ctx: BaseCtx & Record<string, any>) {
    logger.info(ctx, msg);
  },

  // Enhanced helpers for component loggers (service/component optional)
  minimal: {
    info(logger: Logger, msg: string, ctx: MinimalCtx & Record<string, any>) {
      logger.info(ctx, msg);
    },
    warn(
      logger: Logger,
      msg: string,
      ctx: MinimalCtx & RetryCtx & Record<string, any>,
    ) {
      logger.warn(ctx, msg);
    },
    error(
      logger: Logger,
      err: unknown,
      msg: string,
      ctx: MinimalCtx & RetryCtx & Record<string, any>,
    ) {
      logger.error({ ...ctx, err }, msg);
    },
    debug(logger: Logger, msg: string, ctx: MinimalCtx & Record<string, any>) {
      logger.debug(ctx, msg);
    },
  },
};
```

### 3. Service Implementation

```typescript
import { Injectable, Inject } from '@nestjs/common';
import type { Logger } from 'pino';
import { Log } from './shared/logging/structured-logger';
import {
  APP_LOGGER,
  createComponentLogger,
} from './shared/logging/logging.providers';

@Injectable()
export class AppService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = createComponentLogger(baseLogger, 'AppService');
  }

  getHello(): string {
    // Only method-specific context needed - everything else is automatic!
    Log.minimal.info(this.log, 'getHello called', { method: 'getHello' });
    return 'Hello World!';
  }
}
```

## Actual Log Output

When the service method is called with CLS context set, here's the actual log output:

```json
{
  "level": 30,
  "time": 1755080412740,
  "app": "app",
  "environment": "test",
  "version": "0.0.1",
  "service": "app",
  "component": "AppService",
  "traceId": "test-trace-123",
  "correlationId": "test-correlation-456",
  "tenantId": "test-tenant-abc",
  "userId": "test-user-789",
  "method": "getHello",
  "msg": "getHello called"
}
```

## Benefits

### Before Enhancement

```typescript
Log.info(this.logger, 'getHello called', {
  service: 'gs-scaffold', // ❌ Manual
  component: 'AppService', // ❌ Manual
  method: 'getHello', // ❌ Manual
  // Missing traceId, userId, etc. unless manually passed
});
```

### After Enhancement

```typescript
Log.minimal.info(this.log, 'getHello called', {
  method: 'getHello', // ✅ Only method required
});
// Everything else is automatic:
// - service, app, environment, version (base config)
// - component (child logger)
// - traceId, correlationId, tenantId, userId (CLS)
```

## Key Features

1. **Automatic Context Injection**: CLS mixin automatically includes trace context
2. **Component-Specific Loggers**: Child loggers include component context
3. **Type Safety**: `MinimalCtx` type ensures required fields are provided
4. **Backward Compatibility**: Standard `Log.info()` still works for existing code
5. **Enhanced Developer Experience**: Less boilerplate, more consistency

## Usage Patterns

### Basic Service Logging

```typescript
@Injectable()
export class UserService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = createComponentLogger(baseLogger, 'UserService');
  }

  async createUser(userData: CreateUserDto): Promise<User> {
    Log.minimal.info(this.log, 'Creating user', {
      method: 'createUser',
      email: userData.email,
    });

    try {
      const user = await this.userRepository.save(userData);

      Log.minimal.info(this.log, 'User created successfully', {
        method: 'createUser',
        userId: user.id,
        timingMs: 45,
      });

      return user;
    } catch (error) {
      Log.minimal.error(this.log, error, 'User creation failed', {
        method: 'createUser',
        email: userData.email,
      });
      throw error;
    }
  }
}
```

### HTTP Controller Logging

```typescript
@Controller('users')
export class UserController {
  private readonly log: Logger;

  constructor(
    @Inject(APP_LOGGER) baseLogger: Logger,
    private userService: UserService,
  ) {
    this.log = createComponentLogger(baseLogger, 'UserController');
  }

  @Post()
  async createUser(@Body() userData: CreateUserDto): Promise<User> {
    Log.minimal.info(this.log, 'Create user request received', {
      method: 'createUser',
      email: userData.email,
    });

    return this.userService.createUser(userData);
  }
}
```

### Integration with BullMQ

```typescript
@Processor('email')
export class EmailProcessor {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = createComponentLogger(baseLogger, 'EmailProcessor');
  }

  @Process('send-welcome')
  async handleWelcomeEmail(job: Job<{ userId: string; email: string }>) {
    // Set CLS context from job metadata
    const { traceId, correlationId } = job.data._trace || {};
    if (traceId) this.cls.set('traceId', traceId);
    if (correlationId) this.cls.set('correlationId', correlationId);

    Log.minimal.info(this.log, 'Processing welcome email job', {
      method: 'handleWelcomeEmail',
      userId: job.data.userId,
      bull: { queue: 'email', jobId: job.id },
    });

    // Process the job...
  }
}
```

## Testing

The implementation includes comprehensive tests that verify:

- ✅ Logger injection works correctly
- ✅ CLS context is automatically included
- ✅ Component context is properly set
- ✅ Minimal context pattern works as expected

Run the test:

```bash
npm test -- enhanced-logger.integration.spec.ts
```

This enhancement dramatically reduces logging boilerplate while providing comprehensive observability and trace correlation across your entire application stack! 🚀
