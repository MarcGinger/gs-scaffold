import { EsdbOrmProjectorBase } from '../esdb-orm-projector.base';
import {
  IEventStream,
  IEventStreamOptionsMeta,
} from '../../event-stream/event-stream.model';
import { ILogger } from '../../common/logger.interface';
import { Subscription } from 'rxjs';
import { Repository, ObjectLiteral } from 'typeorm';

describe('EsdbOrmProjectorBase (coverage)', () => {
  class TestProjector extends EsdbOrmProjectorBase<
    { foo: string },
    { id: string; name: string },
    { stream: string; revision: string }
  > {
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
    protected async upsertEntity(
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
    // Expose protected for test
    public getStreamName() {
      return this.streamName;
    }
    public setTestSubscription(val: any) {
      this.subscription = val;
    }
    public getTestSubscription() {
      return this.subscription;
    }
    public callHandleEvent(data: any, meta: any) {
      return this.handleEvent(data, meta);
    }
  }

  let projector: TestProjector;
  let logger: ILogger;
  let eventStream: IEventStream<any>;
  let entityRepository: Repository<any>;
  let checkpointRepository: Repository<any>;
  let projectorWithAccess: TestProjector;

  beforeEach(() => {
    logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() } as any;
    eventStream = {
      subscribe: jest.fn(() => new Subscription()),
      catchup: jest.fn(),
      write: jest.fn(),
    } as any;
    entityRepository = {} as any;
    checkpointRepository = {} as any;
    projector = new TestProjector(
      logger,
      eventStream,
      entityRepository,
      checkpointRepository,
    );
    projectorWithAccess = projector;
  });

  it('should call upsertEntity and set checkpoint on handleEvent', async () => {
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

  it('should not call upsertEntity if event type is invalid', async () => {
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

  it('should log error if upsertEntity throws', async () => {
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
    expect(projectorWithAccess.getTestSubscription()).toBeUndefined();
  });

  it('should not throw if onModuleDestroy called with no subscription', () => {
    projectorWithAccess.setTestSubscription(undefined);
    expect(() => projectorWithAccess.onModuleDestroy()).not.toThrow();
    expect((logger.log as jest.Mock).mock.calls.length).toBeGreaterThan(0);
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
    (projector as any).handleEvent = projector.callHandleEvent.bind(projector);
    await projector.subscribeToProjectionStream('test-stream');
    expect(handleEventSpy).toHaveBeenCalledWith(
      { foo: 'bar' },
      expect.objectContaining({ stream: 'test-stream', tenant: 'tenant1' }),
    );
    handleEventSpy.mockRestore();
  });
});
