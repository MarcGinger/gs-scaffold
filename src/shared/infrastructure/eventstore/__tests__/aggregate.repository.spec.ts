// Mock dependencies to avoid complex import resolution
jest.mock('../eventstore.service');
jest.mock('../snapshot.repository');
jest.mock('../../../logging', () => ({
  APP_LOGGER: 'APP_LOGGER_TOKEN',
  Log: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import {
  AggregateRepository,
  AggregateRebuildFailedError,
} from '../aggregate.repository';

interface TestState {
  count: number;
  name: string;
}

interface MockEventStoreService {
  readStream: jest.MockedFunction<any>;
}

interface MockSnapshotRepository {
  loadLatest: jest.MockedFunction<any>;
  save: jest.MockedFunction<any>;
  getStats: jest.MockedFunction<any>;
}

interface MockLogger {
  info: jest.MockedFunction<any>;
  error: jest.MockedFunction<any>;
  debug: jest.MockedFunction<any>;
  warn: jest.MockedFunction<any>;
}

interface Reducer<T> {
  initial(): T;
  apply(state: T, event: any): T;
}

const mockSnapshot = {
  aggregate: 'ctx.agg',
  aggregateSchema: 1,
  tenant: 'tenant',
  entityId: 'id',
  state: { count: 10, name: 'test' },
  version: 5,
  streamPosition: 10n,
  takenAt: '2024-01-01T00:00:00.000Z',
};

describe('AggregateRepository', () => {
  let repo: AggregateRepository<TestState>;
  let eventStore: MockEventStoreService;
  let snapshots: MockSnapshotRepository;
  let logger: MockLogger;
  let reducer: Reducer<TestState>;
  let abortController: AbortController;

  beforeEach(() => {
    eventStore = {
      readStream: jest.fn(),
    };
    snapshots = {
      loadLatest: jest
        .fn()
        .mockResolvedValue({ snapshot: null, cacheHit: false }),
      save: jest.fn().mockResolvedValue(undefined),
      getStats: jest
        .fn()
        .mockResolvedValue({ exists: false, version: undefined }),
    };
    logger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };
    repo = new AggregateRepository(
      eventStore as any,
      snapshots as any,
      logger as any,
    );
    abortController = new AbortController();

    reducer = {
      initial: () => ({ count: 0, name: 'initial' }),
      apply: (state, event: any) => {
        switch (event.type) {
          case 'increment':
            return { ...state, count: state.count + (event.data?.amount || 1) };
          case 'rename':
            return { ...state, name: event.data?.name || 'unknown' };
          default:
            return state;
        }
      },
    };
  });

  describe('load', () => {
    it('should return initial state and version -1 if no events or snapshot', async () => {
      const result = await repo.load('ctx', 'agg', 1, 'tenant', 'id', reducer);
      expect(result.state).toEqual({ count: 0, name: 'initial' });
      expect(result.version).toBe(-1);
      expect(snapshots.loadLatest).toHaveBeenCalledWith(
        'snap.ctx.agg.v1-tenant-id',
      );
    });

    it('should load from snapshot and replay events since snapshot', async () => {
      (snapshots.loadLatest as jest.Mock).mockResolvedValue({
        snapshot: mockSnapshot,
        cacheHit: false,
      });

      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield {
            event: {
              type: 'increment',
              data: { amount: 5 },
              metadata: {},
              id: 'e1',
              revision: 11n,
            },
          };
          yield {
            event: {
              type: 'rename',
              data: { name: 'updated' },
              metadata: {},
              id: 'e2',
              revision: 12n,
            },
          };
        })(),
      );

      const result = await repo.load('ctx', 'agg', 1, 'tenant', 'id', reducer);

      expect(result.state).toEqual({ count: 15, name: 'updated' });
      expect(result.version).toBe(7); // snapshot version 5 + 2 events
      expect(eventStore.readStream).toHaveBeenCalledWith(
        'ctx.agg.v1-tenant-id',
        {
          direction: 'forwards',
          fromRevision: 6n, // snapshot version + 1
        },
      );
    });

    it('should handle snapshot cache hit', async () => {
      (snapshots.loadLatest as jest.Mock).mockResolvedValue({
        snapshot: mockSnapshot,
        cacheHit: true,
      });

      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {})(),
      );

      await repo.load('ctx', 'agg', 1, 'tenant', 'id', reducer);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.anything(),
        'aggregate.load.snapshot',
        expect.objectContaining({ cacheHit: true }),
      );
    });

    it('should handle events with correlationId metadata', async () => {
      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield {
            event: {
              type: 'increment',
              data: { amount: 1 },
              metadata: { correlationId: 'test-correlation' },
              id: 'e1',
            },
          };
        })(),
      );

      await repo.load('ctx', 'agg', 1, 'tenant', 'id', reducer, {
        correlationId: 'load-correlation',
      });

      expect(logger.debug).toHaveBeenCalledWith(
        expect.anything(),
        'aggregate.load.complete',
        expect.objectContaining({
          correlationId: 'load-correlation',
          eventsProcessed: 1,
        }),
      );
    });

    it('should handle cancellation via AbortSignal', async () => {
      abortController.abort();

      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield {
            event: { type: 'increment', data: {}, metadata: {}, id: 'e1' },
          };
        })(),
      );

      await expect(
        repo.load('ctx', 'agg', 1, 'tenant', 'id', reducer, {
          signal: abortController.signal,
        }),
      ).rejects.toThrow('Aggregate load cancelled by signal');
    });

    it('should skip null events', async () => {
      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield { event: null };
          yield {
            event: {
              type: 'increment',
              data: { amount: 1 },
              metadata: {},
              id: 'e1',
            },
          };
        })(),
      );

      const result = await repo.load('ctx', 'agg', 1, 'tenant', 'id', reducer);

      expect(result.state.count).toBe(1);
      expect(result.version).toBe(0); // only one event processed
    });

    it('should throw AggregateRebuildFailedError if reducer throws', async () => {
      const faultyReducer: Reducer<TestState> = {
        initial: () => ({ count: 0, name: 'initial' }),
        apply: () => {
          throw new Error('bad event');
        },
      };

      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield {
            event: {
              type: 'increment',
              data: {},
              metadata: { correlationId: 'event-correlation' },
              id: 'e1',
              streamId: 'test-stream',
            },
          };
        })(),
      );

      const error = await repo
        .load('ctx', 'agg', 1, 'tenant', 'id', faultyReducer)
        .catch((e) => e);

      expect(error).toBeInstanceOf(AggregateRebuildFailedError);
      expect(error.streamId).toBe('ctx.agg.v1-tenant-id');
      expect(error.context).toBe('ctx');
      expect(error.aggregate).toBe('agg');
      expect(error.entityId).toBe('id');

      expect(logger.error).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Error),
        'aggregate.load.eventApplyFailed',
        expect.objectContaining({
          eventType: 'increment',
          eventId: 'e1',
          correlationId: 'event-correlation',
          eventStreamId: 'test-stream',
        }),
      );
    });

    it('should throw AggregateRebuildFailedError for general load failures', async () => {
      (snapshots.loadLatest as jest.Mock).mockRejectedValue(
        new Error('snapshot load failed'),
      );

      const error = await repo
        .load('ctx', 'agg', 1, 'tenant', 'id', reducer)
        .catch((e) => e);

      expect(error).toBeInstanceOf(AggregateRebuildFailedError);
      expect(error.message).toContain(
        'Failed to rebuild aggregate agg/id: snapshot load failed',
      );
    });

    it('should re-throw AggregateRebuildFailedError as-is', async () => {
      const originalError = new AggregateRebuildFailedError(
        'test-stream',
        'ctx',
        'agg',
        'id',
        new Error('original'),
      );

      (snapshots.loadLatest as jest.Mock).mockRejectedValue(originalError);

      const error = await repo
        .load('ctx', 'agg', 1, 'tenant', 'id', reducer)
        .catch((e) => e);

      expect(error).toBe(originalError);
    });
  });

  describe('saveSnapshot', () => {
    it('should save snapshot with correct parameters', async () => {
      const state: TestState = { count: 42, name: 'test-state' };

      await repo.saveSnapshot(
        'ctx',
        'agg',
        1,
        'tenant',
        'id',
        state,
        10,
        100n,
        'correlation-123',
      );

      expect(snapshots.save).toHaveBeenCalledWith('snap.ctx.agg.v1-tenant-id', {
        aggregate: 'ctx.agg',
        aggregateSchema: 1,
        tenant: 'tenant',
        entityId: 'id',
        state,
        version: 10,
        streamPosition: 100n,
        takenAt: expect.any(String),
      });

      expect(logger.debug).toHaveBeenCalledWith(
        expect.anything(),
        'aggregate.snapshot.saved',
        expect.objectContaining({
          version: 10,
          streamPosition: '100',
          correlationId: 'correlation-123',
        }),
      );
    });

    it('should save snapshot without correlationId', async () => {
      const state: TestState = { count: 1, name: 'test' };

      await repo.saveSnapshot('ctx', 'agg', 1, 'tenant', 'id', state, 5, 50n);

      expect(snapshots.save).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.anything(),
        'aggregate.snapshot.saved',
        expect.objectContaining({
          correlationId: undefined,
        }),
      );
    });
  });

  describe('shouldTakeSnapshot', () => {
    it('should return true when event count threshold is reached', () => {
      expect(repo.shouldTakeSnapshot(200)).toBe(true);
      expect(repo.shouldTakeSnapshot(300)).toBe(true);
    });

    it('should return false when event count threshold is not reached', () => {
      expect(repo.shouldTakeSnapshot(199)).toBe(false);
      expect(repo.shouldTakeSnapshot(100)).toBe(false);
      expect(repo.shouldTakeSnapshot(0)).toBe(false);
    });

    it('should return true when time threshold is reached', () => {
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      expect(repo.shouldTakeSnapshot(0, { takenAt: oldTimestamp })).toBe(true);
    });

    it('should return false when time threshold is not reached', () => {
      const recentTimestamp = new Date().toISOString();
      expect(repo.shouldTakeSnapshot(0, { takenAt: recentTimestamp })).toBe(
        false,
      );
    });

    it('should use custom thresholds', () => {
      const customThresholds = { eventCount: 50, timeInMs: 2 * 60 * 1000 };

      expect(repo.shouldTakeSnapshot(49, undefined, customThresholds)).toBe(
        false,
      );
      expect(repo.shouldTakeSnapshot(50, undefined, customThresholds)).toBe(
        true,
      );

      const oldTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      expect(
        repo.shouldTakeSnapshot(0, { takenAt: oldTimestamp }, customThresholds),
      ).toBe(true);
    });

    it('should return false when no snapshot exists and event count below threshold', () => {
      expect(repo.shouldTakeSnapshot(100)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats for non-existent stream and snapshot', async () => {
      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {})(),
      );

      const stats = await repo.getStats('ctx', 'agg', 1, 'tenant', 'id');

      expect(stats).toEqual({
        streamExists: false,
        version: -1n,
        streamPosition: undefined,
        snapshotExists: false,
        snapshotVersion: undefined,
        eventsSinceSnapshot: 0,
      });
    });

    it('should return stats for existing stream without snapshot', async () => {
      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield { event: { revision: 42n } };
        })(),
      );

      const stats = await repo.getStats('ctx', 'agg', 1, 'tenant', 'id');

      expect(stats).toEqual({
        streamExists: true,
        version: 42n,
        streamPosition: 42n,
        snapshotExists: false,
        snapshotVersion: undefined,
        eventsSinceSnapshot: 1,
      });
    });

    it('should return stats for existing stream with snapshot', async () => {
      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield { event: { revision: 100n } };
        })(),
      );

      (snapshots.getStats as jest.Mock).mockResolvedValue({
        exists: true,
        version: 80,
      });

      const stats = await repo.getStats('ctx', 'agg', 1, 'tenant', 'id');

      expect(stats).toEqual({
        streamExists: true,
        version: 100n,
        streamPosition: 100n,
        snapshotExists: true,
        snapshotVersion: 80,
        eventsSinceSnapshot: 20, // 100 - 80
      });
    });

    it('should handle snapshot newer than stream (edge case)', async () => {
      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield { event: { revision: 50n } };
        })(),
      );

      (snapshots.getStats as jest.Mock).mockResolvedValue({
        exists: true,
        version: 60, // newer than stream
      });

      const stats = await repo.getStats('ctx', 'agg', 1, 'tenant', 'id');

      expect(stats.eventsSinceSnapshot).toBe(0); // should not be negative
    });

    it('should handle stream read errors gracefully', async () => {
      (eventStore.readStream as jest.Mock).mockImplementation(() => {
        throw new Error('Stream read error');
      });

      const stats = await repo.getStats('ctx', 'agg', 1, 'tenant', 'id');

      expect(stats.streamExists).toBe(false);
      expect(stats.version).toBe(-1n);
    });

    it('should handle empty events in stream', async () => {
      (eventStore.readStream as jest.Mock).mockReturnValue(
        (async function* () {
          yield { event: null };
        })(),
      );

      const stats = await repo.getStats('ctx', 'agg', 1, 'tenant', 'id');

      expect(stats.streamExists).toBe(false);
    });
  });

  describe('AggregateRebuildFailedError', () => {
    it('should create error with correct properties', () => {
      const cause = new Error('Original error');
      const error = new AggregateRebuildFailedError(
        'test-stream',
        'test-context',
        'test-aggregate',
        'test-entity',
        cause,
      );

      expect(error.name).toBe('AggregateRebuildFailedError');
      expect(error.message).toBe(
        'Failed to rebuild aggregate test-aggregate/test-entity: Original error',
      );
      expect(error.streamId).toBe('test-stream');
      expect(error.context).toBe('test-context');
      expect(error.aggregate).toBe('test-aggregate');
      expect(error.entityId).toBe('test-entity');
      expect(error.cause).toBe(cause);
    });
  });
});
