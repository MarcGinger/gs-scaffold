import { PinoLogger } from '../logger.service';
import pino from 'pino';
import { Logger } from 'pino';

describe('PinoLogger constructor/config', () => {
  const OLD_ENV = process.env;
  let origConsoleError: jest.SpyInstance;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    origConsoleError = jest.spyOn(console, 'error').mockImplementation();
    jest.clearAllMocks();
  });
  afterEach(() => {
    process.env = OLD_ENV;
    origConsoleError.mockRestore();
  });

  it('uses ConfigService if provided', () => {
    const configService = {
      get: jest.fn((k: string) => {
        if (k === 'LOG_LEVEL') return 'debug';
        if (k === 'NODE_ENV') return 'production';
        if (k === 'APP_NAME') return 'test-app';
        if (k === 'APP_VERSION') return '1.2.3';
        if (k === 'HOSTNAME') return 'hosty';
        return undefined;
      }),
    };
    // @ts-expect-error: ConfigService is not fully typed
    new PinoLogger(configService);
    expect(configService.get).toHaveBeenCalledWith('LOG_LEVEL');
    expect(configService.get).toHaveBeenCalledWith('NODE_ENV');
  });

  it('falls back to process.env if ConfigService not provided', () => {
    process.env.LOG_LEVEL = 'warn';
    process.env.NODE_ENV = 'production';
    process.env.APP_NAME = 'env-app';
    process.env.APP_VERSION = '9.9.9';
    process.env.HOSTNAME = 'envhost';
    expect(() => new PinoLogger()).not.toThrow();
  });

  it('enables pretty printing in non-production', () => {
    process.env.NODE_ENV = 'development';
    expect(() => new PinoLogger()).not.toThrow();
  });

  it('uses file logging if LOG_FILE_PATH is set', () => {
    process.env.LOG_FILE_PATH = './test.log';
    const destSpy = jest.spyOn(pino, 'destination');
    new PinoLogger();
    expect(destSpy).toHaveBeenCalled();
    destSpy.mockRestore();
  });

  it('falls back to stdout if file logging fails', () => {
    process.env.LOG_FILE_PATH = './fail.log';
    const destSpy = jest.spyOn(pino, 'destination');
    destSpy.mockImplementationOnce(() => {
      throw new Error('fail');
    });
    destSpy.mockImplementation(() => ({
      write: jest.fn(),
      flush: jest.fn(),
      reopen: jest.fn(),
      flushSync: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      addListener: jest.fn(),
      listeners: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn(),
      eventNames: jest.fn(),
      listenerCount: jest.fn(),
      off: jest.fn(),
      rawListeners: jest.fn(),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
    }));
    expect(() => new PinoLogger()).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create log file destination:'),
      expect.any(Error),
    );
    destSpy.mockRestore();
  });
});

describe('PinoLogger', () => {
  let logger: PinoLogger;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<Logger>;
    logger = Object.create(PinoLogger.prototype) as PinoLogger;
    Object.defineProperty(logger, 'logger', {
      value: mockLogger,
      writable: true,
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('log methods', () => {
    it('log() calls info with normalized context', () => {
      logger.log('msg', { foo: 'bar' });
      expect(mockLogger.info).toHaveBeenCalledWith({ foo: 'bar' }, 'msg');
    });
    it('log() normalizes string context', () => {
      logger.log('msg', 'ctx');
      expect(mockLogger.info).toHaveBeenCalledWith({ context: 'ctx' }, 'msg');
    });
    it('log() handles undefined context', () => {
      logger.log('msg');
      expect(mockLogger.info).toHaveBeenCalledWith({}, 'msg');
    });
    it('error() logs Error with stack', () => {
      const err = new Error('fail');
      logger.error(err, 'trace', { foo: 1 });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err, trace: 'trace', foo: 1 }),
        'fail',
      );
    });
    it('error() logs string error', () => {
      logger.error('fail', 'trace', { foo: 1 });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ trace: 'trace', foo: 1 }),
        'fail',
      );
    });
    it('warn() calls warn', () => {
      logger.warn('warn', { a: 1 });
      expect(mockLogger.warn).toHaveBeenCalledWith({ a: 1 }, 'warn');
    });
    it('debug() calls debug', () => {
      logger.debug('debug', { a: 2 });
      expect(mockLogger.debug).toHaveBeenCalledWith({ a: 2 }, 'debug');
    });
    it('verbose() calls trace', () => {
      logger.verbose('verb', { a: 3 });
      expect(mockLogger.trace).toHaveBeenCalledWith({ a: 3 }, 'verb');
    });
  });

  describe('child loggers', () => {
    it('child() returns child logger', () => {
      expect(logger.child({ foo: 1 })).toBe(mockLogger);
      (mockLogger.child as jest.Mock).mock.calls.forEach((call) => {
        expect(call).toEqual([{ foo: 1 }]);
      });
    });
    it('forComponent() returns child logger with component', () => {
      expect(logger.forComponent('Comp')).toBe(mockLogger);
      (mockLogger.child as jest.Mock).mock.calls.forEach((call) => {
        expect(call).toEqual([{ component: 'Comp' }]);
      });
    });
    it('setCorrelationId() returns child logger with correlationId', () => {
      expect(logger.setCorrelationId('cid')).toBe(mockLogger);
      (mockLogger.child as jest.Mock).mock.calls.forEach((call) => {
        expect(call).toEqual([{ correlationId: 'cid' }]);
      });
    });
    it('createRequestLogger() returns child logger with requestId', () => {
      expect(
        logger.createRequestLogger({ headers: { 'x-request-id': 'rid' } }),
      ).toBe(mockLogger);
      (mockLogger.child as jest.Mock).mock.calls.forEach((call) => {
        expect(call).toEqual([{ requestId: 'rid' }]);
      });
    });
    it('createRequestLogger() generates requestId if missing', () => {
      const result = logger.createRequestLogger({});
      (mockLogger.child as jest.Mock).mock.calls.forEach((call: unknown) => {
        if (
          Array.isArray(call) &&
          call.length > 0 &&
          typeof call[0] === 'object' &&
          call[0] !== null
        ) {
          const arg = call[0] as Record<string, unknown>;
          expect(arg).toHaveProperty('requestId');
          expect(typeof arg.requestId).toBe('string');
        }
      });
      expect(result).toBe(mockLogger);
    });
  });

  describe('event/metrics logging', () => {
    it('logEvent() calls info with event and payload', () => {
      logger.logEvent('evt', { foo: 1 });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'evt', foo: 1 }),
        'Event: evt',
      );
    });
    it('logHealthMetrics() logs system metrics', () => {
      const orig = process.memoryUsage;
      // @ts-expect-error: patching process.memoryUsage for test
      process.memoryUsage = () => ({
        heapUsed: 1024 * 1024 * 10,
        rss: 1024 * 1024 * 20,
      });
      logger.logHealthMetrics();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'metrics', heap: 10, rss: 20 }),
        'System health metrics',
      );
      process.memoryUsage = orig;
    });
  });
});
