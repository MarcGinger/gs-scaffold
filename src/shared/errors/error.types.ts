// src/shared/errors/error.types.ts

/**
 * Categories of errors in the domain-driven architecture.
 * Each category guides how errors are handled at transport boundaries.
 */
export type ErrorCategory =
  | 'domain' // Business invariant violated / state conflict
  | 'validation' // Input/state validation errors
  | 'security' // AuthN/AuthZ
  | 'application' // App orchestration/integration logic
  | 'infrastructure'; // DB, network, provider outages

/**
 * Domain error interface that encapsulates error information
 * without coupling to HTTP status codes or transport concerns.
 */
export interface DomainError<C extends string = string> {
  /** Stable, namespaced error code (e.g. 'USER.USER_REQUIRED_FOR_OPERATION') */
  code: C;
  /** Short human-readable message */
  title: string;
  /** Longer description (optional) */
  detail?: string;
  /** Error category that guides transport mapping */
  category: ErrorCategory;
  /** Whether workers/services should retry this operation */
  retryable?: boolean;
  /** Extra key-value pairs for logs/telemetry */
  context?: Record<string, unknown>;
}

/**
 * Result type that represents either success (Ok) or failure (Err).
 * Domain and application layers return this instead of throwing.
 */
export type Result<T, E extends DomainError = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Helper function to create a successful Result.
 */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/**
 * Helper function to create a failed Result.
 */
export const err = <E extends DomainError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

/**
 * Helper function to add runtime context to an error.
 * Useful for adding correlation IDs, tenant IDs, etc.
 */
export function withContext<E extends DomainError>(
  error: E,
  context: Record<string, unknown>,
): E {
  return {
    ...error,
    context: {
      ...(error.context ?? {}),
      ...context,
    },
  };
}

/**
 * Type guard to check if a Result is successful.
 */
export function isOk<T, E extends DomainError>(
  result: Result<T, E>,
): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Type guard to check if a Result is a failure.
 */
export function isErr<T, E extends DomainError>(
  result: Result<T, E>,
): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Utility to extract the value from an Ok result or throw if Err.
 * Use sparingly, prefer pattern matching on Result.
 */
export function unwrap<T, E extends DomainError>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw new Error(`Attempted to unwrap Err result: ${result.error.code}`);
}

/**
 * Utility to extract the error from an Err result or return undefined if Ok.
 */
export function unwrapErr<T, E extends DomainError>(
  result: Result<T, E>,
): E | undefined {
  return isErr(result) ? result.error : undefined;
}

/**
 * Map the value of an Ok result, leaving Err results unchanged.
 */
export function map<T, U, E extends DomainError>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

/**
 * Map the error of an Err result, leaving Ok results unchanged.
 */
export function mapErr<T, E extends DomainError, F extends DomainError>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  return isErr(result) ? err(fn(result.error)) : result;
}

/**
 * Chain operations that return Results.
 * Similar to flatMap for monads.
 */
export function andThen<T, U, E extends DomainError>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}
