import { DomainEvent } from '../events/events';
import { Result, failure } from '../events/events';

/**
 * Base class for all aggregates following DDD patterns
 * Handles event application, uncommitted events tracking, and version management
 */
export abstract class AggregateRootBase {
  protected _version: number = -1;
  private _uncommittedEvents: DomainEvent[] = [];

  /**
   * Get the current aggregate version
   */
  get version(): number {
    return this._version;
  }

  /**
   * Get uncommitted events since last commit
   */
  get uncommittedEvents(): readonly DomainEvent[] {
    return [...this._uncommittedEvents];
  }

  /**
   * Mark all events as committed and clear uncommitted events
   */
  markEventsAsCommitted(): void {
    this._uncommittedEvents = [];
  }

  /**
   * Apply an event to the aggregate and add to uncommitted events
   */
  protected apply(event: DomainEvent): void {
    this.when(event);
    this._uncommittedEvents.push(event);
    this._version++;
  }

  /**
   * Replay events from the event store (used during rehydration)
   */
  public replay(events: DomainEvent[]): void {
    events.forEach((event) => {
      this.when(event);
      this._version++;
    });
  }

  /**
   * Load aggregate from snapshot and subsequent events
   */
  public loadFromSnapshot(
    snapshot: any,
    subsequentEvents: DomainEvent[],
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    this._version = snapshot.version;
    this.applySnapshot(snapshot);
    this.replay(subsequentEvents);
  }

  /**
   * Abstract method that must be implemented by concrete aggregates
   * to handle state mutations based on events
   */
  protected abstract when(event: DomainEvent): void;

  /**
   * Abstract method for applying snapshot state
   */
  protected abstract applySnapshot(snapshot: any): void;

  /**
   * Create a snapshot of the current aggregate state
   */
  public abstract createSnapshot(): any;

  /**
   * Validate aggregate invariants - override in concrete aggregates
   */
  protected validateInvariants(): Result<void, string> {
    return { success: true, data: undefined } as Result<void, string>;
  }

  /**
   * Execute business logic with invariant validation
   */
  protected executeBusinessLogic(operation: () => void): Result<void, string> {
    const validationResult = this.validateInvariants();
    if (!validationResult.success) {
      // Narrow the union to the failure branch before accessing `error` so
      // TypeScript stops complaining about property access on the success variant.
      const err = (validationResult as { success: false; error: string }).error;
      return failure(err);
    }

    try {
      operation();
      return { success: true, data: undefined } as Result<void, string>;
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

/**
 * Interface for aggregate reducers used in event replay
 */
export interface Reducer<State> {
  initial(): State;
  apply(state: State, event: { type: string; data: any; metadata: any }): State;
}

/**
 * Base interface for command handlers
 */
export interface CommandHandler<
  TCommand,
  TAggregate extends AggregateRootBase,
> {
  handle(
    command: TCommand,
    aggregate: TAggregate,
  ): Promise<Result<void, string>>;
}

/**
 * Interface for aggregate repositories
 */
export interface AggregateRepository<T extends AggregateRootBase> {
  load(id: string): Promise<Result<T, string>>;
  save(aggregate: T, expectedVersion?: number): Promise<Result<void, string>>;
}
