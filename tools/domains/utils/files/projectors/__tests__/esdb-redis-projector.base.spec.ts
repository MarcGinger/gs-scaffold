import { EsdbRedisProjectorBase } from '../esdb-redis-projector.base';
import {
  IEventStream,
  IEventStreamOptionsMeta,
} from '../../event-stream/event-stream.model';
import { RedisUtilityService } from '../../redis/redis-utility.service';
import { ILogger } from '../../common/logger.interface';
import { Subscription } from 'rxjs';

describe('EsdbRedisProjectorBase (coverage)', () => {
  class TestProjector extends EsdbRedisProjectorBase<{ foo: string }> {
    protected readonly streamName = 'test-stream';
    public upserted: any[] = [];
    public checkpoints: Record<string, bigint> = {};
    public eventTypeCheck: any[] = [];
    public throwOnUpsert = false;
    public throwOnCheckpoint = false;

    protected isEventType(data: unknown): data is { foo: string } {
      this.eventTypeCheck.push(data);
      return typeof data === 'object' && data !== null && 'foo' in data;
    }
    protected async upsertRedisState(
      event: { foo: string },
      tenant: string,
    ): Promise<void> {
      if (this.throwOnUpsert) throw new Error('upsert error');
      this.upserted.push({ event, tenant });
    }
    protected async getStreamCheckpoint(
      stream: string,
    ): Promise<bigint | undefined> {
      if (this.throwOnCheckpoint) throw new Error('checkpoint error');
      return this.checkpoints[stream];
    }
    protected async setStreamCheckpoint(
      stream: string,
      revision: bigint,
    ): Promise<void> {
      if (this.throwOnCheckpoint) throw new Error('checkpoint error');
      this.checkpoints[stream] = revision;
    }
    public getStreamName() {
      return this.streamName;
    }
    public callHandleEvent(data: any, meta: any) {
      return this.handleEvent(data, meta);
    }
  }

  // Helper to expose protected subscription for testing
  class TestProjectorWithAccess extends TestProjector {
    setTestSubscription(val: any) {
      this.subscription = val;
    }
    getTestSubscription() {
      return this.subscription;
    }
  }
  let projectorWithAccess: TestProjectorWithAccess;

  let projector: TestProjector;
  let logger: ILogger;
  let eventStream: IEventStream<any>;
  let redisUtilityService: RedisUtilityService;

  beforeEach(() => {
    logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() } as any;
    eventStream = {
      subscribe: jest.fn(() => new Subscription()),
      catchup: jest.fn(),
      write: jest.fn(),
    } as any;
    redisUtilityService = {} as any;
    projector = new TestProjector(logger, eventStream, redisUtilityService);
    projectorWithAccess = new TestProjectorWithAccess(
      logger,
      eventStream,
      redisUtilityService,
    );
  });

  it('should call upsertRedisState and set checkpoint on handleEvent', async () => {
    const meta: IEventStreamOptionsMeta = {
      stream: 'test-stream',
      tenant: 'tenant1',
      key: 'key1',
      type: 'type',
      date: new Date(),
      sequence: 1n,
      revision: 2n,
      isLive: true,
    };
    await projector['handleEvent']({ foo: 'bar' }, meta);
    expect(projector.upserted).toEqual([
      { event: { foo: 'bar' }, tenant: 'tenant1' },
    ]);
    expect(projector.checkpoints['test-stream']).toBe(2n);
  });

  it('should not call upsertRedisState if event type is invalid', async () => {
    const meta: IEventStreamOptionsMeta = {
      stream: 'test-stream',
      tenant: 'tenant1',
      key: 'key1',
      type: 'type',
      date: new Date(),
      sequence: 1n,
      revision: 2n,
      isLive: true,
    };
    await projector['handleEvent']({ notfoo: 'baz' }, meta);
    expect(projector.upserted).toEqual([]);
    expect(projector.checkpoints['test-stream']).toBeUndefined();
  });

  it('should log error if upsertRedisState throws', async () => {
    projector.throwOnUpsert = true;
    const meta: IEventStreamOptionsMeta = {
      stream: 'test-stream',
      tenant: 'tenant1',
      key: 'key1',
      type: 'type',
      date: new Date(),
      sequence: 1n,
      revision: 2n,
      isLive: true,
    };
    await projector['handleEvent']({ foo: 'bar' }, meta);
    expect((logger.error as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('should log error if setStreamCheckpoint throws', async () => {
    projector.throwOnCheckpoint = true;
    const meta: IEventStreamOptionsMeta = {
      stream: 'test-stream',
      tenant: 'tenant1',
      key: 'key1',
      type: 'type',
      date: new Date(),
      sequence: 1n,
      revision: 2n,
      isLive: true,
    };
    await projector['handleEvent']({ foo: 'bar' }, meta);
    expect((logger.error as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('should log warn if event type is invalid', async () => {
    const meta: IEventStreamOptionsMeta = {
      stream: 'test-stream',
      tenant: 'tenant1',
      key: 'key1',
      type: 'type',
      date: new Date(),
      sequence: 1n,
      revision: 2n,
      isLive: true,
    };
    await projector['handleEvent'](null as any, meta);
    expect((logger.warn as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('should warn if subscription already exists in subscribeToProjectionStream', async () => {
    projectorWithAccess.setTestSubscription(new Subscription());
    await projectorWithAccess.subscribeToProjectionStream('test-stream');
    expect((logger.warn as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('should log error if getStreamCheckpoint throws in subscribeToProjectionStream', async () => {
    projectorWithAccess.throwOnCheckpoint = true;
    await projectorWithAccess.subscribeToProjectionStream('test-stream-error');
    expect((logger.error as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    projectorWithAccess.throwOnCheckpoint = false;
  });

  it('should log error if eventStream.subscribe throws in subscribeToProjectionStream', async () => {
    (eventStream.subscribe as jest.Mock).mockImplementationOnce(() => {
      throw new Error('subscribe error');
    });
    await projectorWithAccess.subscribeToProjectionStream('test-stream');
    expect((logger.error as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('should unsubscribe and log on onModuleDestroy', () => {
    const unsub = jest.fn();
    projectorWithAccess.setTestSubscription({ unsubscribe: unsub });
    projectorWithAccess.onModuleDestroy();
    expect(unsub).toHaveBeenCalled();
    expect((logger.log as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    // Should clear subscription
    expect(projectorWithAccess.getTestSubscription()).toBeUndefined();
  });

  it('should not throw if onModuleDestroy called with no subscription', () => {
    projectorWithAccess.setTestSubscription(undefined);
    expect(() => projectorWithAccess.onModuleDestroy()).not.toThrow();
    expect((logger.log as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('should build correct projector user object', () => {
    const user = projector['buildProjectorUser']('tenant42');
    expect(user).toEqual({
      sub: 'projector',
      name: 'projector',
      email: 'projector@system',
      tenant: 'tenant42',
    });
  });

  it('should call subscribeToProjectionStream with streamName on onModuleInit', async () => {
    const spy = jest
      .spyOn(projector, 'subscribeToProjectionStream')
      .mockResolvedValue();
    await projector.onModuleInit();
    expect(spy).toHaveBeenCalledWith(projector.getStreamName());
    spy.mockRestore();
  });

  it('should call handleEvent via onEvent callback in subscribeToProjectionStream', async () => {
    const handleEventSpy = jest
      .spyOn(projector, 'callHandleEvent')
      .mockResolvedValue();
    (eventStream.subscribe as jest.Mock).mockImplementation(
      (_stream, opts: any) => {
        opts.onEvent(
          { foo: 'bar' },
          {
            stream: 'test-stream',
            tenant: 'tenant1',
            key: 'key1',
            type: 'type',
            date: new Date(),
            sequence: 1n,
            revision: 2n,
            isLive: true,
          },
        );
        return new Subscription();
      },
    );
    // Patch the base to call the public wrapper for test
    (projector as any).handleEvent = projector.callHandleEvent.bind(projector);
    await projector.subscribeToProjectionStream('test-stream');
    expect(handleEventSpy).toHaveBeenCalledWith(
      { foo: 'bar' },
      expect.objectContaining({ stream: 'test-stream', tenant: 'tenant1' }),
    );
    handleEventSpy.mockRestore();
  });
});
