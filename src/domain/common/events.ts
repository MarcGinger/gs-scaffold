/**
 * Shared types for EventStoreDB events and metadata
 * Following the DDD + CQRS + Event Sourcing patterns
 */

export type EventMeta = {
  eventId: string; // GUID
  correlationId: string; // trace across services
  causationId: string; // prior event/command id
  commandId: string; // idempotency key
  tenant: string; // 'core', 'acme', ...
  user?: { id: string; email?: string; name?: string };
  source: string; // service/module name
  occurredAt: string; // ISO timestamp
  schemaVersion: number; // payload schema version
  contentType?: 'application/json+domain';
};

export type EventEnvelope<T> = {
  type: string; // event type name (versioned)
  data: T; // payload
  metadata: EventMeta; // uniform envelope
};

export type Snapshot<TState> = {
  aggregate: string; // banking.currency
  aggregateSchema: number; // e.g., 1
  tenant: string;
  entityId: string;
  state: TState; // serialized aggregate state
  version: number; // aggregate version at capture
  streamPosition: bigint; // commit/prepare or revision marker
  takenAt: string; // ISO timestamp
};

/**
 * Base domain event interface
 */
export interface DomainEvent {
  readonly type: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType: string;
}

/**
 * Result type for never-throw domain operations
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Helper to create successful results
 */
export const success = <T>(data: T): Result<T> => ({ success: true, data });

/**
 * Helper to create error results
 */
export const failure = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});

/**
 * Type guard for successful results
 */
export const isSuccess = <T, E>(
  result: Result<T, E>,
): result is { success: true; data: T } => result.success;

/**
 * Type guard for failed results
 */
export const isFailure = <T, E>(
  result: Result<T, E>,
): result is { success: false; error: E } => !result.success;
