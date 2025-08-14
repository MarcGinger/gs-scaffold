import { Inject, Injectable } from '@nestjs/common';
import {
  START,
  FORWARDS,
  BACKWARDS,
  ReadStreamOptions,
} from '@eventstore/db-client';
import type { Logger } from 'pino';

import { EventStoreService } from './eventstore.service';
import { SnapshotRepository } from './snapshot.repository';
import { Reducer } from '../../domain/aggregates';
import { Snapshot } from '../../domain/events';
import { APP_LOGGER, Log } from '../../logging';

type StreamIds = { streamId: string; snapId: string };

/**
 * Centralized stream ID builder to avoid drift across the codebase
 */
function buildStreamIds(
  context: string,
  aggregate: string,
  aggSchema: number,
  tenant: string,
  entityId: string,
): StreamIds {
  const base = `${context}.${aggregate}.v${aggSchema}-${tenant}-${entityId}`;
  return { streamId: base, snapId: `snap.${base}` };
}

/**
 * Domain-specific error for aggregate rebuild failures
 */
export class AggregateRebuildFailedError extends Error {
  constructor(
    public readonly streamId: string,
    public readonly context: string,
    public readonly aggregate: string,
    public readonly entityId: string,
    cause: Error,
  ) {
    super(
      `Failed to rebuild aggregate ${aggregate}/${entityId}: ${cause.message}`,
    );
    this.name = 'AggregateRebuildFailedError';
    this.cause = cause;
  }
}

@Injectable()
export class AggregateRepository<State> {
  constructor(
    private readonly es: EventStoreService,
    private readonly snapshots: SnapshotRepository<State>,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Load aggregate state with snapshot catch-up optimization.
   * Returns the aggregate version (domain event index, starting at -1).
   */
  async load(
    context: string,
    aggregate: string,
    aggSchema: number,
    tenant: string,
    entityId: string,
    reducer: Reducer<State>,
    options?: {
      signal?: AbortSignal;
      readOptions?: Omit<ReadStreamOptions, 'direction'>;
      correlationId?: string;
    },
  ): Promise<{ state: State; version: number }> {
    const { streamId, snapId } = buildStreamIds(
      context,
      aggregate,
      aggSchema,
      tenant,
      entityId,
    );

    Log.debug(this.logger, 'aggregate.load.start', {
      component: 'AggregateRepository',
      method: 'load',
      streamId,
      snapId,
      context,
      aggregate,
      tenant,
      entityId,
      correlationId: options?.correlationId,
    });

    try {
      // 1) Load snapshot
      const { snapshot: snap } = await this.snapshots.loadLatest(snapId);
      let state = snap?.state ?? reducer.initial();
      let version = snap?.version ?? -1; // domain version; -1 means no events applied
      let eventsProcessed = 0;

      // 2) Replay events since snapshot
      const fromRevision = snap ? BigInt(snap.version + 1) : START;
      Log.debug(this.logger, 'aggregate.load.replayStart', {
        component: 'AggregateRepository',
        method: 'load',
        streamId,
        hasSnapshot: !!snap,
        snapshotVersion: snap?.version,
        fromRevision:
          fromRevision === START ? 'START' : fromRevision.toString(),
        correlationId: options?.correlationId,
      });

      const iter = this.es.readStream(streamId, {
        direction: FORWARDS,
        fromRevision,
        ...options?.readOptions,
      });

      for await (const resolved of iter) {
        // Check for cancellation
        if (options?.signal?.aborted) {
          throw new Error('Aggregate load cancelled by signal');
        }

        const event = resolved.event;
        if (!event) continue;

        try {
          state = reducer.apply(state, {
            type: event.type,
            data: event.data,
            metadata: event.metadata,
          });
          version++;
          eventsProcessed++;
        } catch (error) {
          Log.error(
            this.logger,
            error as Error,
            'aggregate.load.eventApplyFailed',
            {
              component: 'AggregateRepository',
              method: 'load',
              streamId,
              eventType: event.type,
              eventId: event.id,
              version,
              correlationId: options?.correlationId,
            },
          );
          throw new AggregateRebuildFailedError(
            streamId,
            context,
            aggregate,
            entityId,
            error as Error,
          );
        }
      }

      Log.debug(this.logger, 'aggregate.load.complete', {
        component: 'AggregateRepository',
        method: 'load',
        streamId,
        finalVersion: version,
        eventsProcessed,
        hasSnapshot: !!snap,
        correlationId: options?.correlationId,
      });

      return { state, version };
    } catch (error) {
      if (error instanceof AggregateRebuildFailedError) {
        throw error; // Re-throw domain errors as-is
      }

      Log.error(this.logger, error as Error, 'aggregate.load.failed', {
        component: 'AggregateRepository',
        method: 'load',
        streamId,
        context,
        aggregate,
        tenant,
        entityId,
        correlationId: options?.correlationId,
      });
      throw new AggregateRebuildFailedError(
        streamId,
        context,
        aggregate,
        entityId,
        error as Error,
      );
    }
  }

  /**
   * Save a snapshot for an aggregate.
   * `version` is the aggregate's domain version (event index).
   * `streamPosition` is the ESDB stream revision to which this snapshot corresponds.
   */
  async saveSnapshot(
    context: string,
    aggregate: string,
    aggSchema: number,
    tenant: string,
    entityId: string,
    state: State,
    version: number,
    streamPosition: bigint,
    correlationId?: string,
  ): Promise<void> {
    const { snapId } = buildStreamIds(
      context,
      aggregate,
      aggSchema,
      tenant,
      entityId,
    );

    const snapshot: Snapshot<State> = {
      aggregate: `${context}.${aggregate}`,
      aggregateSchema: aggSchema,
      tenant,
      entityId,
      state,
      version, // domain version
      streamPosition, // ESDB revision
      takenAt: new Date().toISOString(),
    };

    await this.snapshots.save(snapId, snapshot);

    Log.debug(this.logger, 'aggregate.snapshot.saved', {
      component: 'AggregateRepository',
      method: 'saveSnapshot',
      snapId,
      version,
      streamPosition: streamPosition.toString(),
      context,
      aggregate,
      tenant,
      entityId,
      correlationId,
    });
  }

  /**
   * Decide if we should take a snapshot.
   * Computes `timeSinceLastSnapshot` automatically from snapshot's `takenAt`.
   */
  shouldTakeSnapshot(
    eventsProcessed: number,
    lastSnapshot?: { takenAt: string },
    thresholds = { eventCount: 200, timeInMs: 5 * 60 * 1000 },
  ): boolean {
    // Check event count threshold
    if (eventsProcessed >= thresholds.eventCount) {
      return true;
    }

    // Check time threshold
    if (lastSnapshot?.takenAt) {
      const timeSinceLastSnapshot =
        Date.now() - new Date(lastSnapshot.takenAt).getTime();
      if (timeSinceLastSnapshot >= thresholds.timeInMs) {
        return true;
      }
    }

    return false;
  }

  /**
   * Lightweight aggregate stats using tail read to avoid full replay.
   * Returns both domain version and stream position for clarity.
   */
  async getStats(
    context: string,
    aggregate: string,
    aggSchema: number,
    tenant: string,
    entityId: string,
  ): Promise<{
    streamExists: boolean;
    version: number; // domain version estimate
    streamPosition?: bigint; // ESDB stream revision
    snapshotExists: boolean;
    snapshotVersion?: number;
    eventsSinceSnapshot: number;
  }> {
    const { streamId, snapId } = buildStreamIds(
      context,
      aggregate,
      aggSchema,
      tenant,
      entityId,
    );

    // 1) Latest stream revision via single backward read
    let latestRevision = -1n;
    let streamExists = false;
    try {
      const iter = this.es.readStream(streamId, {
        direction: BACKWARDS,
        maxCount: 1,
      });
      for await (const resolved of iter) {
        // If we read one event, its revision == current head
        latestRevision = resolved.event?.revision ?? -1n;
        streamExists = true;
        break;
      }
    } catch {
      // stream may not exist
    }

    // 2) Snapshot info
    const snapshotStats = await this.snapshots.getStats(snapId);

    // Assuming domain version == revision for simplicity
    // In practice, you might need to adjust this mapping
    const version = streamExists ? Number(latestRevision) : -1;
    const eventsSinceSnapshot =
      snapshotStats.version != null
        ? Math.max(0, version - snapshotStats.version)
        : streamExists
          ? version + 1
          : 0;

    return {
      streamExists,
      version,
      streamPosition: streamExists ? latestRevision : undefined,
      snapshotExists: snapshotStats.exists,
      snapshotVersion: snapshotStats.version,
      eventsSinceSnapshot,
    };
  }
}
