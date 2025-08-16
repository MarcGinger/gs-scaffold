import { EventStreamService } from '../../event-stream/event-stream.service';
import { IUsertoken } from 'src/common';
import type { ILogger } from 'src/common/logger.interface';
import { ILinkStream } from 'src/domain';
import { IEventStream, IEventStreamOptionsMeta } from '../event-store.model';

class TestableEventStreamService extends EventStreamService {
  public getLinkList() {
    return this.linkStore;
  }
  public setLinkList(val: Record<string, Record<string, ILinkStream>>) {
    this.linkStore = val;
  }
  public callHandleLinkEvent(evt: ILinkStream, meta: IEventStreamOptionsMeta) {
    return this.handleLinkEvent(evt, meta);
  }
  public callSetupList<T>(
    ...args: Parameters<EventStreamService['setupList']>
  ) {
    return this.setupList<T>(...args);
  }
  public callDelay(ms: number) {
    return this.delay(ms);
  }
  public getLogger() {
    return this.logger;
  }
}

describe('EventStreamService', () => {
  let service: TestableEventStreamService;
  let logger: ILogger;
  let eventStream: IEventStream<{ id: string; type: string; payload: any }>;

  beforeEach(() => {
    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };
    eventStream = {
      catchup: jest.fn(),
      subscribe: jest.fn(),
    } as unknown as IEventStream<{ id: string; type: string; payload: any }>;
    service = new TestableEventStreamService(logger, eventStream);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('logs error if setupList throws', async () => {
      const spy = jest
        .spyOn(service as any, 'setupList')
        .mockRejectedValue(new Error('fail'));
      await service.onModuleInit();
      const errorMock = logger.error as jest.Mock;
      expect(errorMock).toHaveBeenCalledWith(
        expect.any(Error),
        'EventstoredbListService: Error initializing link list',
      );
      spy.mockRestore();
    });

    it('calls setupList and does not log error on success', async () => {
      const spy = jest
        .spyOn(service as any, 'setupList')
        .mockResolvedValue(undefined);
      await service.onModuleInit();
      const errorMock = logger.error as jest.Mock;
      expect(errorMock).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('setupList', () => {
    it('retries on error and succeeds', async () => {
      let callCount = 0;
      (eventStream.catchup as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount < 2) throw new Error('fail');
        return 42n;
      });
      (eventStream.subscribe as jest.Mock).mockReturnValue(undefined);
      // Mock the protected delay method directly
      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);
      await service.callSetupList('stream', jest.fn());
      expect((eventStream.catchup as jest.Mock).mock.calls.length).toBe(2);
      expect((eventStream.subscribe as jest.Mock).mock.calls.length).toBe(1);
      expect((eventStream.subscribe as jest.Mock).mock.calls[0][0]).toBe(
        'stream',
      );
      expect(typeof (eventStream.subscribe as jest.Mock).mock.calls[0][1]).toBe(
        'object',
      );
    });
  });

  describe('handleLinkEvent', () => {
    it('merges event into linkStore', () => {
      const evt: ILinkStream = {
        code: 'c',
        name: 'n',
      } as unknown as ILinkStream;
      const meta: IEventStreamOptionsMeta = {
        tenant: 't',
        key: 'k',
      } as unknown as IEventStreamOptionsMeta;
      service.callHandleLinkEvent(evt, meta);
      expect(service.getLinkList()['t']['k']).toMatchObject(evt);
    });
  });

  describe('linkToDomainEntity', () => {
    it('returns the item as is', () => {
      const user = { tenant: 't' } as IUsertoken;
      const item = { code: 'c' } as ILinkStream;
      expect(service.linkToDomainEntity(user, item)).toBe(item);
    });
  });

  describe('linkList', () => {
    it('returns all links for tenant', () => {
      service.setLinkList({
        foo: { a: { code: 'a', name: 'A' }, b: { code: 'b', name: 'B' } },
      });
      const user = { tenant: 'foo' } as IUsertoken;
      expect(service.linkList(user)).toHaveLength(2);
    });
    it('filters by code', () => {
      service.setLinkList({
        foo: { a: { code: 'abc', name: 'A' }, b: { code: 'b', name: 'B' } },
      });
      const user = { tenant: 'foo' } as IUsertoken;
      expect(service.linkList(user, { code: 'ab' })).toHaveLength(1);
    });
    it('filters by name', () => {
      service.setLinkList({
        foo: {
          a: { code: 'a', name: 'Alpha' },
          b: { code: 'b', name: 'Beta' },
        },
      });
      const user = { tenant: 'foo' } as IUsertoken;
      expect(service.linkList(user, { name: 'beta' })).toHaveLength(1);
    });
    it('returns empty if tenant missing', () => {
      const user = { tenant: 'none' } as IUsertoken;
      expect(service.linkList(user)).toEqual([]);
    });
  });

  describe('linkItem', () => {
    it('returns the item for code', () => {
      service.setLinkList({ foo: { a: { code: 'a', name: 'A' } } });
      const user = { tenant: 'foo' } as IUsertoken;
      expect(service.linkItem(user, 'a')).toMatchObject({ code: 'a' });
    });
    it('returns undefined if not found', () => {
      service.setLinkList({ foo: {} });
      const user = { tenant: 'foo' } as IUsertoken;
      expect(service.linkItem(user, 'missing')).toBeUndefined();
    });
  });

  describe('delay', () => {
    it('resolves after the specified time (using fake timers)', async () => {
      jest.useFakeTimers();
      const promise = service.callDelay(1000);
      jest.advanceTimersByTime(1000);
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });
});
