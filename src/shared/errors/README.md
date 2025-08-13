# Domain Error Management - Core Types

This module provides the foundational types and utilities for implementing the "Never Throw" domain error management pattern in our NestJS application.

## Core Concepts

### Result<T, E> Pattern

Instead of throwing exceptions, domain and application functions return `Result<T, E>` which represents either:

- Success: `{ ok: true, value: T }`
- Failure: `{ ok: false, error: E }`

### DomainError Interface

All errors implement the `DomainError` interface with:

- `code`: Stable, namespaced identifier (e.g., "USER.NOT_FOUND")
- `title`: Short human-readable message
- `category`: Error classification for transport mapping
- `retryable`: Whether operations should be retried (optional)
- `detail`: Longer description (optional)
- `context`: Additional metadata for logging (optional)

## Basic Usage

### Creating Results

```typescript
import { ok, err } from '@/shared/errors';

// Success case
function findUser(id: string): Result<User, DomainError> {
  const user = database.find(id);
  if (user) {
    return ok(user);
  }
  return err({
    code: 'USER.NOT_FOUND',
    title: 'User not found',
    category: 'domain',
  });
}
```

### Handling Results

```typescript
import { isOk, isErr } from '@/shared/errors';

const result = findUser('123');

if (isOk(result)) {
  console.log('Found user:', result.value);
} else {
  console.error('Error:', result.error.title);
}
```

### Adding Context

```typescript
import { withContext } from '@/shared/errors';

function updateUser(id: string, data: UserData): Result<User, DomainError> {
  const result = findUser(id);
  if (isErr(result)) {
    return err(
      withContext(result.error, {
        operation: 'updateUser',
        userId: id,
        correlationId: getCorrelationId(),
      }),
    );
  }
  // ... update logic
}
```

### Chaining Operations

```typescript
import { andThen, map } from '@/shared/errors';

const result = findUser('123').pipe(
  andThen((user) => validateUser(user)),
  andThen((user) => saveUser(user)),
  map((user) => ({ id: user.id, name: user.name })),
);
```

## Error Categories

| Category         | Usage                     | HTTP Mapping            | Retry |
| ---------------- | ------------------------- | ----------------------- | ----- |
| `domain`         | Business rule violations  | 409 Conflict            | No    |
| `validation`     | Input validation errors   | 400 Bad Request         | No    |
| `security`       | Auth/authorization        | 401/403                 | No    |
| `application`    | App logic errors          | 422 Unprocessable       | Maybe |
| `infrastructure` | External service failures | 503 Service Unavailable | Yes   |

## Best Practices

1. **Never throw in domain/application layers** - Always return `Result<T, E>`
2. **Use namespaced error codes** - Format: `CONTEXT.SPECIFIC_ERROR`
3. **Add context at boundaries** - Include correlation IDs, user IDs, etc.
4. **Set retryable appropriately** - Guide worker retry logic
5. **Log once at transport boundaries** - Avoid duplicate logging

## Next Steps

After implementing core types, create:

1. Error catalogs for each domain context
2. HTTP Problem Details mapper
3. Result interceptor for automatic unwrapping
4. Repository patterns with Result returns

See the full implementation guide in `.github/COPILOT_INSTRUCTIONS_error-handling.md`
