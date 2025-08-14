import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from './eventstore.service';
import { SnapshotRepository } from './snapshot.repository';
import { START } from '@eventstore/db-client';
import { Reducer } from '../../domain/common/aggregate-root.base';
import { Snapshot } from '../../domain/common/events';

@Injectable()
export class AggregateRepository<State> {
  private readonly logger = new Logger(AggregateRepository.name);

  constructor(
    private readonly es: EventStoreService,
    private readonly snapshots: SnapshotRepository<State>,
  ) {}

  /**
   * Load aggregate state with snapshot catch-up optimization
   */
  async load(
    context: string,
    aggregate: string,
    aggSchema: number,
    tenant: string,
    entityId: string,
    reducer: Reducer<State>,
  ): Promise<{ state: State; version: number }> {
    const streamId = `${context}.${aggregate}.v${aggSchema}-${tenant}-${entityId}`;
    const snapId = `snap.${context}.${aggregate}.v${aggSchema}-${tenant}-${entityId}`;

    this.logger.debug(
      { streamId, snapId, context, aggregate, tenant, entityId },
      'aggregate.load.start',
    );

    try {
      // Try to load latest snapshot
      const snap = await this.snapshots.loadLatest(snapId);
      let state = snap?.state ?? reducer.initial();
      let version = snap?.version ?? -1;
      let eventsProcessed = 0;

      // Determine starting revision for event replay
      const fromRevision = snap ? BigInt(snap.version + 1) : START;

      this.logger.debug(
        {
          streamId,
          hasSnapshot: !!snap,
          snapshotVersion: snap?.version,
          fromRevision: fromRevision.toString(),
        },
        'aggregate.load.replayStart',
      );

      // Read and apply events since snapshot
      const read = this.es.readStream(streamId, { fromRevision });

      for await (const resolved of read) {
        if (!resolved.event) continue;

        const { event } = resolved;
        try {
          state = reducer.apply(state, {
            type: event.type,
            data: event.data,
            metadata: event.metadata,
          });
          version++;
          eventsProcessed++;
        } catch (error) {
          this.logger.error(
            {
              streamId,
              eventType: event.type,
              eventId: event.id,
              version,
              error: error instanceof Error ? error.message : String(error),
            },
            'aggregate.load.eventApplyFailed',
          );
          throw error;
        }
      }

      this.logger.debug(
        {
          streamId,
          finalVersion: version,
          eventsProcessed,
          hasSnapshot: !!snap,
        },
        'aggregate.load.complete',
      );

      return { state, version };
    } catch (error) {
      this.logger.error(
        {
          streamId,
          context,
          aggregate,
          tenant,
          entityId,
          error: error instanceof Error ? error.message : String(error),
        },
        'aggregate.load.failed',
      );
      throw error;
    }
  }

  /**
   * Save a snapshot for an aggregate
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
  ): Promise<void> {
    const snapId = `snap.${context}.${aggregate}.v${aggSchema}-${tenant}-${entityId}`;

    const snapshot: Snapshot<State> = {
      aggregate: `${context}.${aggregate}`,
      aggregateSchema: aggSchema,
      tenant,
      entityId,
      state,
      version,
      streamPosition,
      takenAt: new Date().toISOString(),
    };

    try {
      await this.snapshots.save(snapId, snapshot);

      this.logger.debug(
        {
          snapId,
          version,
          context,
          aggregate,
          tenant,
          entityId,
        },
        'aggregate.snapshot.saved',
      );
    } catch (error) {
      this.logger.error(
        {
          snapId,
          version,
          context,
          aggregate,
          tenant,
          entityId,
          error: error instanceof Error ? error.message : String(error),
        },
        'aggregate.snapshot.failed',
      );
      throw error;
    }
  }

  /**
   * Check if snapshot should be taken based on configurable thresholds
   */
  shouldTakeSnapshot(
    eventsProcessed: number,
    timeSinceLastSnapshot?: number,
    thresholds = {
      eventCount: 200,
      timeInMs: 5 * 60 * 1000, // 5 minutes
    },
  ): boolean {
    if (eventsProcessed >= thresholds.eventCount) {
      return true;
    }

    if (timeSinceLastSnapshot && timeSinceLastSnapshot >= thresholds.timeInMs) {
      return true;
    }

    return false;
  }

  /**
   * Get aggregate statistics for monitoring
   */
  async getStats(
    context: string,
    aggregate: string,
    aggSchema: number,
    tenant: string,
    entityId: string,
  ): Promise<{
    streamExists: boolean;
    version: number;
    snapshotExists: boolean;
    snapshotVersion?: number;
    eventsSinceSnapshot: number;
  }> {
    const snapId = `snap.${context}.${aggregate}.v${aggSchema}-${tenant}-${entityId}`;

    try {
      // Get current aggregate version
      const { version } = await this.load(
        context,
        aggregate,
        aggSchema,
        tenant,
        entityId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        { initial: () => null as any, apply: (s) => s },
      );

      // Get snapshot info
      const snapshotStats = await this.snapshots.getStats(snapId);

      return {
        streamExists: version >= 0,
        version,
        snapshotExists: snapshotStats.exists,
        snapshotVersion: snapshotStats.version,
        eventsSinceSnapshot: snapshotStats.version
          ? version - snapshotStats.version
          : version + 1,
      };
    } catch {
      return {
        streamExists: false,
        version: -1,
        snapshotExists: false,
        eventsSinceSnapshot: 0,
      };
    }
  }
}
