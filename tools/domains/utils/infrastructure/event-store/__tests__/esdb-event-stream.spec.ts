import { EsdbEventStream } from '../esdb-event-store';
import { Subscription } from 'rxjs';
import { StreamNotFoundError } from '@eventstore/db-client';
import { Metadata } from '@grpc/grpc-js';
import type { ILogger } from '../../common/logger.interface';

// Mock EventStoreDBClient and dependencies
const mockAppendToStream = jest.fn();
const mockReadStream = jest.fn();
const mockSubscribeToStream = jest.fn();

jest.mock('@eventstore/db-client', () => {
  const actual = jest.requireActual('@eventstore/db-client');
  return {
    ...actual,
    EventStoreDBClient: {
      connectionString: jest.fn(() => ({
        appendToStream: mockAppendToStream,
        readStream: mockReadStream,
        subscribeToStream: mockSubscribeToStream,
      })),
    },
    jsonEvent: jest.fn((data) => data),
  };
});

// Local interface to match the ServiceError shape for test purposes
interface TestServiceError {
  code: number;
  details: string;
  metadata: Metadata;
  message: string;
  name: string;
}

const mockLogger: ILogger = {
  log: jest.fn(() => {}),
  error: jest.fn(() => {}),
  warn: jest.fn(() => {}),
  debug: jest.fn(() => {}),
  verbose: jest.fn(() => {}),
};

describe('EsdbEventStream', () => {
  let service: EsdbEventStream<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EsdbEventStream('TestService', mockLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('write', () => {
    it('should call appendToStream and log success', async () => {
      mockAppendToStream.mockResolvedValueOnce(undefined);
      await service.write({
        user: { sub: '1', name: 'n', email: 'e', tenant: 't' },
        stream: 'stream',
        key: 'key',
        type: 'type',
        event: { foo: 'bar' },
      });
      expect(mockAppendToStream).toHaveBeenCalled();
      expect((mockLogger.log as jest.Mock).mock.calls.length).toBeGreaterThan(
        0,
      );
    });

    it('should log and throw on error', async () => {
      mockAppendToStream.mockRejectedValueOnce(new Error('fail'));
      await expect(
        service.write({
          user: { sub: '1', name: 'n', email: 'e', tenant: 't' },
          stream: 'stream',
          key: 'key',
          type: 'type',
          event: { foo: 'bar' },
        }),
      ).rejects.toThrow('fail');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle array of events in write', async () => {
      mockAppendToStream.mockResolvedValueOnce(undefined);
      const eventsArray = [{ foo: 1 }, { foo: 2 }];
      await service.write({
        user: { sub: '1', name: 'n', email: 'e', tenant: 't' },
        stream: 'stream',
        key: 'key',
        type: 'type',
        event: eventsArray,
      });
      expect(mockAppendToStream).toHaveBeenCalled();
      const callArgs = mockAppendToStream.mock.calls[0] as unknown[];
      const events = callArgs[1] as Array<Record<string, unknown>>;
      expect(Array.isArray(events)).toBe(true);
      expect(events).toHaveLength(2);
      for (let i = 0; i < events.length; i++) {
        expect(events[i]).toEqual(
          expect.objectContaining({
            data: { foo: i + 1 },
            type: 'type',
            metadata: expect.objectContaining({
              $userId: '1',
              $email: 'e',
              $service: 'TestService',
            }),
          }),
        );
      }
    });

    it('should omit $tenant if user.tenant is missing or falsy', async () => {
      mockAppendToStream.mockResolvedValueOnce(undefined);
      await service.write({
        user: { sub: '1', name: 'n', email: 'e' }, // no tenant
        stream: 'stream',
        key: 'key',
        type: 'type',
        event: { foo: 'bar' },
      });
      expect(mockAppendToStream).toHaveBeenCalled();
      const callArgs = mockAppendToStream.mock.calls[0] as unknown[];
      const events = callArgs[1] as Array<Record<string, unknown>>;
      const metadata = events[0]?.metadata;
      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
      expect(Object.prototype.hasOwnProperty.call(metadata, '$tenant')).toBe(
        false,
      );
    });
  });

  describe('catchup', () => {
    it('should call readStream and onEvent', async () => {
      const fakeEvent = {
        event: {
          streamId: 'stream-tenant-key',
          type: 'type',
          created: Date.now(),
          data: { foo: 'bar' },
          position: { commit: 1n },
        },
        link: { revision: 1n },
      };
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve(); // satisfy linter for async generator
          yield fakeEvent;
        },
      });
      const onEvent = jest.fn();
      const revision = await service.catchup('stream', { onEvent });
      expect(onEvent).toHaveBeenCalled();
      expect(revision).toBe(1n);
    });

    it('should log and return undefined on StreamNotFoundError', async () => {
      const serviceError: TestServiceError = {
        code: 5,
        details: 'not found',
        metadata: new Metadata(),
        message: 'not found',
        name: 'ServiceError',
      };
      mockReadStream.mockImplementation(() => {
        throw new StreamNotFoundError(serviceError);
      });
      const onEvent = jest.fn();
      const revision = await service.catchup('stream', { onEvent });
      expect((mockLogger.warn as jest.Mock).mock.calls.length).toBeGreaterThan(
        0,
      );
      expect(revision).toBeUndefined();
    });

    it('should log and throw on unexpected error in catchup', async () => {
      const error = new Error('unexpected');
      mockReadStream.mockImplementation(() => {
        throw error;
      });
      const onEvent = jest.fn();
      await expect(service.catchup('stream', { onEvent })).rejects.toThrow(
        'unexpected',
      );
      expect((mockLogger.error as jest.Mock).mock.calls.length).toBeGreaterThan(
        0,
      );
    });

    it('should use "unknown-tenant" if streamId has no tenant segment', async () => {
      const fakeEvent = {
        event: {
          streamId: 'stream', // no '-' present
          type: 'type',
          created: Date.now(),
          data: { foo: 'bar' },
          position: { commit: 1n },
        },
        link: { revision: 1n },
      };
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield fakeEvent;
        },
      });
      const onEvent = jest.fn();
      await service.catchup('stream', { onEvent });
      expect(onEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tenant: 'unknown-tenant' }),
      );
    });

    it('should use "unknown-key" if streamId has no key segment', async () => {
      const fakeEvent = {
        event: {
          streamId: 'stream', // no '-' present
          type: 'type',
          created: Date.now(),
          data: { foo: 'bar' },
          position: { commit: 1n },
        },
        link: { revision: 1n },
      };
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield fakeEvent;
        },
      });
      const onEvent = jest.fn();
      await service.catchup('stream', { onEvent });
      expect(onEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ key: 'unknown-key' }),
      );
    });

    it('should return undefined from catchup if no event has a link.revision', async () => {
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            event: {
              streamId: 'stream-tenant-key',
              type: 'type',
              created: Date.now(),
              data: { foo: 'bar' },
              position: { commit: 1n },
            },
            link: {}, // no revision
          };
        },
      });
      const onEvent = jest.fn();
      const revision = await service.catchup('stream', { onEvent });
      expect(onEvent).toHaveBeenCalled();
      expect(revision).toBeUndefined();
    });

    it('should return undefined from catchup if resolved.event is undefined', async () => {
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { event: undefined };
        },
      });
      const onEvent = jest.fn();
      const revision = await service.catchup('stream', { onEvent });
      expect(onEvent).not.toHaveBeenCalled();
      expect(revision).toBeUndefined();
    });
  });

  describe('subscribe', () => {
    let subs: Subscription[] = [];

    afterEach(() => {
      for (const sub of subs) {
        if (sub instanceof Subscription) sub.unsubscribe();
      }
      subs = [];
    });

    it('should call subscribeToStream and return a Subscription', () => {
      mockSubscribeToStream.mockReturnValue({
        on: jest.fn(),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      });
      const sub = service.subscribe('stream', { onEvent: jest.fn() });
      if (sub instanceof Subscription) subs.push(sub);
      expect(mockSubscribeToStream).toHaveBeenCalled();
      expect(sub).toBeInstanceOf(Subscription);
    });

    it('should ignore ResolvedEvent with undefined event in subscribe', () => {
      const onEvent = jest.fn();
      mockSubscribeToStream.mockReturnValue({
        on: (eventName: string, handler: (resolved: any) => void) => {
          if (eventName === 'data') {
            handler({ event: undefined });
            handler({ event: null });
          }
          return { on: jest.fn() };
        },
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      });
      const sub = service.subscribe('stream', { onEvent });
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('should call onEvent with correct meta in subscribe', () => {
      const on = jest.fn(
        (eventName: string, handler: (resolved: any) => void) => {
          if (eventName === 'data') {
            handler({
              event: {
                streamId: 'stream-tenant-key',
                type: 'type',
                created: 1234567890,
                data: { foo: 'bar' },
                position: { commit: 42n },
              },
              link: { revision: 99n },
            });
          }
          return { on: jest.fn() };
        },
      );
      mockSubscribeToStream.mockReturnValue({
        on,
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      });
      const onEvent = jest.fn();
      const sub = service.subscribe('stream', { onEvent });
      if (sub instanceof Subscription) subs.push(sub);
      expect(onEvent).toHaveBeenCalledWith(
        { foo: 'bar' },
        expect.objectContaining({
          stream: 'stream',
          tenant: 'tenant',
          key: 'key',
          type: 'type',
          date: new Date(1234567890),
          sequence: 42n,
          revision: 99n,
          isLive: true,
        }),
      );
    });

    it('should use "unknown-tenant" if streamId has no tenant segment in subscribe', () => {
      const onEvent = jest.fn();
      mockSubscribeToStream.mockReturnValue({
        on: (eventName: string, handler: (resolved: any) => void) => {
          if (eventName === 'data') {
            handler({
              event: {
                streamId: 'stream',
                type: 'type',
                created: 1234567890,
                data: { foo: 'bar' },
                position: { commit: 1n },
              },
              link: { revision: 2n },
            });
          }
          return { on: jest.fn() };
        },
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      });
      const sub = service.subscribe('stream', { onEvent });
      if (sub instanceof Subscription) subs.push(sub);
      expect(onEvent).toHaveBeenCalledWith(
        { foo: 'bar' },
        expect.objectContaining({ tenant: 'unknown-tenant' }),
      );
    });

    it('should use "unknown-key" if streamId has no key segment in subscribe', () => {
      const onEvent = jest.fn();
      mockSubscribeToStream.mockReturnValue({
        on: (eventName: string, handler: (resolved: any) => void) => {
          if (eventName === 'data') {
            handler({
              event: {
                streamId: 'stream-tenant',
                type: 'type',
                created: 1234567890,
                data: { foo: 'bar' },
                position: { commit: 1n },
              },
              link: { revision: 3n },
            });
          }
          return { on: jest.fn() };
        },
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      });
      const sub = service.subscribe('stream', { onEvent });
      if (sub instanceof Subscription) subs.push(sub);
      expect(onEvent).toHaveBeenCalledWith(
        { foo: 'bar' },
        expect.objectContaining({ key: 'unknown-key' }),
      );
    });

    it('should handle error event in subscribe and retry unsubscribe', (done) => {
      // Arrange
      let errorHandler: ((err: Error) => void | Promise<void>) | undefined;
      const fakeEsdbSubscription = {
        on: (eventName: string, handler: (resolved: any) => void) => {
          if (eventName === 'error') errorHandler = handler;
          return fakeEsdbSubscription;
        },
        unsubscribe: jest.fn().mockRejectedValueOnce(new Error('unsub fail')),
      };
      mockSubscribeToStream.mockReturnValue(fakeEsdbSubscription);
      const onEvent = jest.fn();
      service.subscribe('stream', { onEvent });
      // Act: trigger error event
      if (errorHandler) {
        const maybePromise = errorHandler(new Error('test error'));
        if (maybePromise && typeof maybePromise.then === 'function') {
          void maybePromise.then(finishAssertions);
        } else {
          setImmediate(finishAssertions);
        }
      } else {
        done.fail('Error handler was not set');
      }
      function finishAssertions() {
        const errorCalls = (mockLogger.error as jest.Mock).mock.calls;
        const hasSubscriptionError = errorCalls.some(([, msg]) => {
          return (
            typeof msg === 'string' &&
            msg.includes('Subscription to "stream" error:')
          );
        });
        const hasUnsubError = errorCalls.some(([, msg]) => {
          return (
            typeof msg === 'string' &&
            msg.includes('Error while unsubscribing:')
          );
        });
        expect(hasSubscriptionError).toBe(true);
        expect(hasUnsubError).toBe(true);
        expect(fakeEsdbSubscription.unsubscribe).toHaveBeenCalled();
        done();
      }
    });

    it('should log error if unsubscribe throws in Subscription teardown', (done) => {
      // Arrange
      const fakeEsdbSubscription = {
        on: jest.fn(),
        unsubscribe: jest
          .fn()
          .mockRejectedValueOnce(new Error('teardown fail')),
      };
      mockSubscribeToStream.mockReturnValue(fakeEsdbSubscription);
      const onEvent = jest.fn();
      const sub = service.subscribe('stream', { onEvent });
      // Act: unsubscribe (triggers rxSub teardown)
      sub.unsubscribe();
      // Wait for the error logger to be called
      setImmediate(() => {
        const errorCalls = (mockLogger.error as jest.Mock).mock.calls;
        const hasUnsubError = errorCalls.some(([, msg]) => {
          return (
            typeof msg === 'string' &&
            msg.includes('Error while unsubscribing:')
          );
        });
        expect(hasUnsubError).toBe(true);
        expect(fakeEsdbSubscription.unsubscribe).toHaveBeenCalled();
        done();
      });
    });

    it('should not restart subscription if isShuttingDown is true during retry/backoff', (done) => {
      let errorHandler: ((err: Error) => void | Promise<void>) | undefined;
      let subscriptionStarted = 0;
      const fakeEsdbSubscription = {
        on: (eventName: string, handler: (resolved: any) => void) => {
          if (eventName === 'error') errorHandler = handler;
          return fakeEsdbSubscription;
        },
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      mockSubscribeToStream.mockImplementation(() => {
        subscriptionStarted++;
        return fakeEsdbSubscription;
      });
      const onEvent = jest.fn();
      const sub = service.subscribe('stream', { onEvent });
      // Simulate error event and set isShuttingDown before retry
      if (errorHandler) {
        // Patch delay to immediately resolve
        jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);
        // Set isShuttingDown before the retry/backoff
        service['isShuttingDown'] = true;
        const maybePromise = errorHandler(new Error('test error'));
        if (maybePromise && typeof maybePromise.then === 'function') {
          void maybePromise.then(finishAssertions);
        } else {
          setImmediate(finishAssertions);
        }
      } else {
        done.fail('Error handler was not set');
      }
      function finishAssertions() {
        // Should only have started the subscription once
        expect(subscriptionStarted).toBe(1);
        done();
      }
    });

    it('should restart subscription if isShuttingDown is false during retry/backoff', (done) => {
      let errorHandler: ((err: Error) => void | Promise<void>) | undefined;
      let subscriptionStarted = 0;
      const fakeEsdbSubscription = {
        on: (eventName: string, handler: (resolved: any) => void) => {
          if (eventName === 'error') errorHandler = handler;
          return fakeEsdbSubscription;
        },
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      mockSubscribeToStream.mockImplementation(() => {
        subscriptionStarted++;
        return fakeEsdbSubscription;
      });
      const onEvent = jest.fn();
      service.subscribe('stream', { onEvent });
      // Patch delay to immediately resolve
      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);
      // Ensure isShuttingDown is false before retry
      service['isShuttingDown'] = false;
      // Simulate error event
      if (errorHandler) {
        const maybePromise = errorHandler(new Error('test error'));
        if (maybePromise && typeof maybePromise.then === 'function') {
          void maybePromise.then(finishAssertions);
        } else {
          setImmediate(finishAssertions);
        }
      } else {
        done.fail('Error handler was not set');
      }
      function finishAssertions() {
        // Should have started the subscription twice (initial + retry)
        expect(subscriptionStarted).toBe(2);
        done();
      }
    });

    it('should not start subscription if isShuttingDown is true before subscribe is called', () => {
      service['isShuttingDown'] = true;
      const onEvent = jest.fn();
      service.subscribe('stream', { onEvent });
      expect(mockSubscribeToStream).not.toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should unsubscribe all subscriptions and log', () => {
      const sub = new Subscription();
      const spy = jest.spyOn(sub, 'unsubscribe');
      const svc = service as unknown as { subscriptions: Subscription[] };
      svc.subscriptions = [sub];
      service.shutdown();
      expect(spy).toHaveBeenCalled();
      expect((mockLogger.log as jest.Mock).mock.calls.length).toBeGreaterThan(
        0,
      );
      expect(svc.subscriptions).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('should return events from list when resolved.event is present', async () => {
      // Arrange
      const fakeEvent = {
        event: {
          data: { foo: 'bar' },
        },
      };
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield fakeEvent;
        },
      });
      // Act
      const result = await service.list('stream');
      // Assert
      expect(result).toEqual([{ foo: 'bar' }]);
      expect(mockReadStream).toHaveBeenCalledWith(
        'stream',
        expect.objectContaining({
          fromRevision: expect.anything(),
          direction: expect.anything(),
          maxCount: undefined,
          resolveLinkTos: true,
        }),
      );
    });

    it('should skip events when resolved.event is undefined in list', async () => {
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { event: undefined };
        },
      });
      const result = await service.list('stream');
      expect(result).toEqual([]);
    });

    it('should use fromPosition as fromRevision when provided', async () => {
      const fakeEvent = { event: { data: { foo: 'bar' } } };
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield fakeEvent;
        },
      });
      const result = await service.list('stream', { fromPosition: 123 });
      expect(result).toEqual([{ foo: 'bar' }]);
      expect(mockReadStream).toHaveBeenCalledWith(
        'stream',
        expect.objectContaining({
          fromRevision: BigInt(123),
          direction: expect.anything(),
          maxCount: undefined,
          resolveLinkTos: true,
        }),
      );
    });
  });

  describe('getConnection', () => {
    it('should log and return if at least one event is found', async () => {
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { event: { revision: 42n } };
        },
      });
      await service.getConnection();
      expect(mockLogger.log as jest.Mock).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Connected @ revision 42'),
      );
    });

    it('should log and return if stream is empty', async () => {
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          // yield nothing
        },
      });
      await service.getConnection();
      expect(mockLogger.log as jest.Mock).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('is empty; treating as connected.'),
      );
    });

    it('should log and return if StreamNotFoundError is thrown', async () => {
      mockReadStream.mockImplementation(() => {
        throw new StreamNotFoundError({
          code: 5,
          details: 'not found',
          metadata: new Metadata(),
          message: 'not found',
          name: 'ServiceError',
        });
      });
      await service.getConnection();
      expect(mockLogger.log as jest.Mock).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('not found; initializing connection.'),
      );
    });

    it('should log error and retry on unexpected error', async () => {
      const error = new Error('unexpected');
      let callCount = 0;
      mockReadStream.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw error;
        // On retry, yield an event to break the loop
        return {
          async *[Symbol.asyncIterator]() {
            yield { event: { revision: 99n } };
          },
        };
      });
      const delaySpy = jest
        .spyOn(service as any, 'delay')
        .mockResolvedValue(undefined);
      await service.getConnection();
      const errorCalls = (mockLogger.error as jest.Mock).mock.calls;
      const hasRetryError = errorCalls.some(([, msg]) => {
        return (
          typeof msg === 'string' &&
          msg.includes('Error reading stream "connection", retrying in')
        );
      });
      expect(hasRetryError).toBe(true);
      expect(delaySpy).toHaveBeenCalled();
      delaySpy.mockRestore();
    });
  });

  describe('getLastRevision', () => {
    it('should log and return the last revision if an event is found', async () => {
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield { event: { revision: 123n } };
        },
      });
      const result = await service.getLastRevision('stream');
      const logCalls = (mockLogger.log as jest.Mock).mock.calls;
      expect(
        logCalls.some(
          ([, msg]) =>
            typeof msg === 'string' &&
            msg.includes("Last revision in 'stream' is 123"),
        ),
      ).toBe(true);
      expect(result).toBe(123n);
    });

    it('should log and return null if the stream is empty', async () => {
      mockReadStream.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          // yield nothing
        },
      });
      const result = await service.getLastRevision('stream');
      const logCalls = (mockLogger.log as jest.Mock).mock.calls;
      expect(
        logCalls.some(
          ([, msg]) =>
            typeof msg === 'string' &&
            msg.includes("Stream 'stream' not found or is empty."),
        ),
      ).toBe(true);
      expect(result).toBeNull();
    });

    it('should log error and return null if an error is thrown', async () => {
      const error = new Error('fail');
      mockReadStream.mockImplementation(() => {
        throw error;
      });
      const result = await service.getLastRevision('stream');
      expect(result).toBeNull();
      const errorCalls = (mockLogger.error as jest.Mock).mock.calls;
      const hasError = errorCalls.some(([, msg]) => {
        return (
          typeof msg === 'string' &&
          msg.includes("Error reading last revision from stream 'stream':")
        );
      });
      expect(hasError).toBe(true);
    });
  });
});

function hasMessage(obj: unknown): obj is { message: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'message' in obj &&
    typeof (obj as { message?: unknown }).message === 'string'
  );
}
