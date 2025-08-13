# COPILOT_INSTRUCTIONS.md — Domain Error Management (Never Throw)

> **Purpose**: Standardise how we model, return, log, and transport errors across our NestJS + DDD + CQRS stack (domains, use cases, adapters, HTTP, BullMQ workers, ESDB projectors). The domain **never throws**; it returns typed results. Transport concerns (HTTP, queues) map those results to their own error shapes.

---

## 0) High-level goals

- **Deterministic flows**: Don’t throw from domain or application services; return `Result<T, DomainError>`.
- **Separation of concerns**: Domain knows codes & categories only. HTTP status codes and exception classes live in adapters.
- **Observability-first**: One log at the boundary (HTTP controller / worker handler) with correlation & tenant context.
- **Retry-aware**: Errors declare `retryable` to guide BullMQ backoffs and outbox retries.
- **Self-documenting**: Stable, namespaced error codes (e.g., `MAKER.USER_REQUIRED_FOR_OPERATION`).

---

## 1) File & folder conventions

```
src/
  shared/
    errors/
      error.types.ts           // Result<T,E>, DomainError, ErrorCategory, helpers
      http.problem.ts          // RFC 9457 Problem Details mapper + status mapping
      result.interceptor.ts    // (optional) Interceptor that unwraps Result<T,E>
    logger/                    // ILogger abstraction you already have
  contexts/
    maker/
      errors/
        maker.errors.ts        // MakerErrors catalog (domain-only)
      application/
        use-cases/...          // Use cases return Result<T,E>
      domain/...               // Aggregates, VOs; return Result from guards/factories
      infrastructure/...       // Repos; translate infra faults to DomainError
  interfaces/
    http/...                   // Controllers, DTOs; map Result -> HTTP Problem
    workers/...                // BullMQ processors; map Result -> retry/fail
```

---

## 2) Core types (domain-only)

Create `src/shared/errors/error.types.ts`:

```ts
// src/shared/errors/error.types.ts
export type ErrorCategory =
  | 'domain' // Business invariant violated / state conflict
  | 'validation' // Input/state validation errors
  | 'security' // AuthN/AuthZ
  | 'application' // App orchestration/integration logic
  | 'infrastructure'; // DB, network, provider outages

export interface DomainError<C extends string = string> {
  code: C; // e.g. 'MAKER.USER_REQUIRED_FOR_OPERATION'
  title: string; // short human message
  detail?: string; // longer description (optional)
  category: ErrorCategory; // guides transport mapping
  retryable?: boolean; // workers: should we retry?
  context?: Record<string, unknown>; // extra KV for logs/telemetry
}

export type Result<T, E extends DomainError = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E extends DomainError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export function withContext<E extends DomainError>(
  e: E,
  ctx: Record<string, unknown>,
): E {
  return { ...e, context: { ...(e.context ?? {}), ...ctx } };
}
```

> **Copilot hints**
>
> - When a function can fail, return `Result<T, E>`.
> - Prefer `ok(value)` and `err(MakerErrors.X)` helpers.
> - Append runtime context via `withContext(error, { correlationId, tenantId, ... })` just before returning.

---

## 3) Catalog builder & Maker catalog

Create a small helper to namespace codes and a catalog for the Maker context.

```ts
// src/contexts/_shared/errors/catalog.ts
import { DomainError } from '../../../shared/errors/error.types';

export function makeCatalog<
  T extends Record<string, Omit<DomainError, 'code'>>,
>(defs: T, namespace: string) {
  return Object.fromEntries(
    Object.entries(defs).map(([k, v]) => {
      const code = `${namespace}.${k}` as const;
      return [k, { ...v, code }];
    }),
  ) as {
    [K in keyof T]: DomainError<`${typeof namespace}.${Extract<K, string>}`>;
  };
}
```

```ts
// src/contexts/maker/errors/maker.errors.ts
import { makeCatalog } from '../../_shared/errors/catalog';

export const MakerErrors = makeCatalog(
  {
    USER_REQUIRED_FOR_OPERATION: {
      title: 'User token is required',
      detail: 'Authentication is required to modify Maker relationships.',
      category: 'security',
      retryable: false,
    },
    MAKER_NOT_FOUND: {
      title: 'Maker not found',
      detail: 'The specified Maker does not exist or is not accessible.',
      category: 'domain',
      retryable: false,
    },
    DEPENDENCY_TIMEOUT: {
      title: 'Upstream dependency timeout',
      detail: 'A required upstream call timed out.',
      category: 'infrastructure',
      retryable: true,
    },
  },
  'MAKER',
);

export type MakerErrorCode = keyof typeof MakerErrors; // string literal union
```

**Rules for adding errors**

- Names are UPPER_SNAKE_CASE.
- Codes are namespaced by context (`'MAKER'`, `'BANKING'`, etc.).
- Choose a category carefully; set `retryable` thoughtfully.
- Keep `title` short; put explanations in `detail`.

---

## 4) Usage patterns

### 4.1 Domain / Application services

```ts
// src/contexts/maker/application/use-cases/update-maker.use-case.ts
import { Result, ok, err } from '../../../../shared/errors/error.types';
import { MakerErrors } from '../../errors/maker.errors';

export interface UpdateMakerInput {
  userId?: string;
  // ...other fields
}

export async function updateMaker(
  input: UpdateMakerInput,
): Promise<Result<'OK'>> {
  if (!input.userId) {
    return err(MakerErrors.USER_REQUIRED_FOR_OPERATION);
  }

  // domain checks ... if fail => return err(MakerErrors.MAKER_NOT_FOUND)

  // side effects...
  return ok('OK');
}
```

### 4.2 Repositories / Infrastructure

- Catch low-level exceptions and translate to a catalogued `DomainError` with `category: 'infrastructure'`.
- Attach context: query, stream name, provider code.

```ts
try {
  const entity = await repo.findById(id);
  if (!entity) return err(MakerErrors.MAKER_NOT_FOUND);
  return ok(entity);
} catch (e) {
  return err({
    ...MakerErrors.DEPENDENCY_TIMEOUT,
    detail: 'DB lookup failed',
    context: { id, cause: (e as Error).message },
  });
}
```

---

## 5) HTTP mapping (Problem Details)

Create `src/shared/errors/http.problem.ts` to translate `DomainError` → RFC Problem Details.

```ts
// src/shared/errors/http.problem.ts
import { DomainError } from './error.types';
import { HttpStatus } from '@nestjs/common';

export interface ProblemDetails {
  type?: string; // link to docs for this error code
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string; // your stable code
}

export function httpStatusFor(e: DomainError): HttpStatus {
  switch (e.category) {
    case 'security':
      return HttpStatus.UNAUTHORIZED;
    case 'validation':
      return HttpStatus.BAD_REQUEST;
    case 'domain':
      return HttpStatus.CONFLICT; // or 422
    case 'infrastructure':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

export function toProblem(e: DomainError, instance?: string): ProblemDetails {
  return {
    type: `https://errors.your-domain.dev/${e.code}`,
    title: e.title,
    status: httpStatusFor(e),
    detail: e.detail,
    instance,
    code: e.code,
  };
}
```

### 5.1 Controller pattern (no throws)

```ts
// src/interfaces/http/maker.controller.ts
import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { toProblem, httpStatusFor } from '../../shared/errors/http.problem';
import { updateMaker } from '../../contexts/maker/application/use-cases/update-maker.use-case';

@Controller('maker')
export class MakerController {
  @Get('update')
  async update(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await updateMaker({ userId: undefined });
    if (!result.ok) {
      const problem = toProblem(result.error, req.originalUrl);
      res.status(httpStatusFor(result.error));
      return problem;
    }
    return result.value;
  }
}
```

### 5.2 Optional: `ResultInterceptor`

Let controllers return `Result<any>` directly.

```ts
// src/shared/errors/result.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { DomainError } from './error.types';
import { toProblem, httpStatusFor } from './http.problem';

@Injectable()
export class ResultInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const res = ctx.switchToHttp().getResponse();
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      map((data: any) => {
        if (data && data.ok !== undefined) {
          if (data.ok) return data.value;
          const e = data.error as DomainError;
          const problem = toProblem(e, req?.originalUrl);
          res.status(httpStatusFor(e));
          return problem;
        }
        return data;
      }),
    );
  }
}
```

Register globally in `main.ts`:

```ts
app.useGlobalInterceptors(new ResultInterceptor());
```

---

## 6) Logging & telemetry

- **Single boundary log** per failure (controller or worker). Avoid deep-layer duplicate logs.
- Include: `code`, `category`, `correlationId`, `tenantId`, `userId`, plus `error.context`.
- Level mapping: `validation/domain` → `warn`, `security` → `warn` (or `info`), `infrastructure` → `error`.

```ts
logger.warn(
  {
    code: e.code,
    category: e.category,
    context: e.context,
    correlationId,
    tenantId,
  },
  e.title,
);
```

**Tracing**

- Add `traceId`/`spanId` to `context`.
- For OpenTelemetry: set span status to `ERROR` with attributes `error.code`, `error.category`.

---

## 7) Workers (BullMQ) & Outbox

- Workers receive `Result`. Use `retryable` to decide requeue/backoff vs permanent failure.
- Attach `jobId`, `queue`, `attemptsMade` to `error.context` before logging.

```ts
// src/interfaces/workers/maker.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { withContext } from '../../shared/errors/error.types';

@Processor('maker-queue')
export class MakerProcessor extends WorkerHost {
  async process(job) {
    const result = await updateMaker(job.data);
    if (!result.ok) {
      const e = withContext(result.error, {
        jobId: job.id,
        queue: job.queueName,
        attempts: job.attemptsMade,
      });
      // log once at boundary
      this.logger.warn(
        { code: e.code, category: e.category, context: e.context },
        e.title,
      );
      if (e.retryable) throw new Error(e.code); // let BullMQ retry/backoff
      // no-retry → move to failed without retry
      return { status: 'failed', problem: e.code };
    }
    return { status: 'ok' };
  }
}
```

**Outbox rule**: Persist the decision (`sent`/`failed` + `code`) so projectors and dashboards show accurate status. Use `retryable` + backoff policies centrally.

---

## 8) Validation & aggregation

When multiple field errors occur, aggregate them into a single `DomainError` with structured `context`:

```ts
return err({
  code: 'MAKER.VALIDATION_FAILED',
  title: 'Validation failed',
  category: 'validation',
  retryable: false,
  detail: 'One or more fields are invalid.',
  context: {
    issues: [
      { field: 'name', rule: 'required' },
      { field: 'email', rule: 'format' },
    ],
  },
});
```

---

## 9) OpenAPI (ProblemDetails schema)

Document the error envelope for clients.

```ts
// swagger.schema.ts
export const ProblemDetailsSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' },
    code: { type: 'string' },
  },
};
```

Annotate endpoints:

```ts
@ApiResponse({ status: 401, schema: ProblemDetailsSchema })
@ApiResponse({ status: 409, schema: ProblemDetailsSchema })
```

---

## 10) Testing patterns

- **Unit**: Assert `Result` shape and `code`. No `try/catch`.
- **Integration**: Controller returns ProblemDetails with correct HTTP status.
- **Contract**: Assert BullMQ retry behaviour (retryable vs not).

```ts
expect(result).toEqual({
  ok: false,
  error: expect.objectContaining({ code: 'MAKER.MAKER_NOT_FOUND' }),
});
```

---

## 11) Migration plan (from throw-based)

1. Introduce `Result` + catalogs.
2. Convert domain guards/factories to return `Result`.
3. Wrap repo calls and translate infra exceptions → `err(infraError)`.
4. Add `ResultInterceptor` (optional) and update controllers to return `Result`.
5. Update workers to branch on `retryable`.
6. Add lint rules to **forbid throws** in domain/application folders.

**ESLint rule snippet** (`no-throw-in-domain.js`):

```js
module.exports = {
  meta: { type: 'problem' },
  create(context) {
    const inDomain = /contexts\/.+\/(domain|application)\//.test(
      context.getFilename(),
    );
    return inDomain
      ? {
          ThrowStatement(node) {
            context.report({
              node,
              message:
                'Do not throw in domain/application; return Result instead.',
            });
          },
          NewExpression(node) {
            if (
              node.callee &&
              node.callee.name &&
              /Exception$/.test(node.callee.name)
            ) {
              context.report({
                node,
                message:
                  'Do not construct HTTP exceptions in domain/application.',
              });
            }
          },
        }
      : {};
  },
};
```

---

## 12) Do / Don’t

**Do**

- Return `Result<T, E>` from domain/application.
- Use namespaced codes and categories.
- Log once at boundaries with correlation/tenant context.
- Use `retryable` to steer workers.

**Don’t**

- Don’t include HTTP `statusCode` or exception class names in domain errors.
- Don’t throw in domain/use cases.
- Don’t log the same error multiple times across layers.

---

## 13) Ready-to-copy templates

**New catalog template**

```ts
import { makeCatalog } from '../../_shared/errors/catalog';

export const <ContextName>Errors = makeCatalog({
  SOME_ERROR: { title: '', detail: '', category: 'domain', retryable: false },
}, '<CONTEXT>');
```

**Typical use-case result**

```ts
import { ok, err } from '../../../shared/errors/error.types';
import { <ContextName>Errors } from '../errors/<context>.errors';

export async function useCase(input: Input): Promise<Result<Output>> {
  if (!input.satisfies) return err(<ContextName>Errors.SOME_ERROR);
  return ok(await doWork());
}
```

---

## 14) Acceptance checklist

- [ ] No `throw` in `contexts/**/(domain|application)`.
- [ ] All domain errors live in catalogs with namespaced codes.
- [ ] Controllers/Interceptors map to Problem Details + correct status.
- [ ] Workers handle `retryable` correctly; backoff configured.
- [ ] Logs contain code, category, correlationId, tenantId, userId.
- [ ] OpenAPI documents ProblemDetails on error responses.
- [ ] Tests assert `Result` and code values.

---

_End of spec — implement incrementally per context (Maker first), then apply a codemod to migrate use cases and repositories to `Result`._
