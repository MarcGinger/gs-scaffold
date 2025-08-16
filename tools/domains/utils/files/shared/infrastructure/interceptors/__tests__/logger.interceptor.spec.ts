import { ExecutionContext, CallHandler } from '@nestjs/common';
import { LoggingInterceptor } from '../logger.interceptor';
import { ILogger } from 'src/shared/logger';
import { of } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: ILogger;
  let mockContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      verbose: jest.fn(),
    };
    interceptor = new LoggingInterceptor(logger);
    mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          path: '/test',
          method: 'GET',
          headers: { 'x-forwarded-for': '1.2.3.4' },
          connection: { remoteAddress: '5.6.7.8' },
        }),
      }),
    } as any;
    mockCallHandler = {
      handle: jest.fn(() => of('response')),
    } as any;
    logSpy = jest.spyOn(logger, 'log');
  });

  it('should log incoming and outgoing requests', (done) => {
    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Incoming Request on /test',
          method: 'GET',
          ip: '1.2.3.4',
        }),
        'Incoming Request on /test',
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          ip: '1.2.3.4',
          duration: expect.any(Number),
        }),
        'End Request for /test',
      );
      done();
    });
  });

  it('should fallback to remoteAddress if x-forwarded-for is missing', (done) => {
    mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          path: '/test',
          method: 'POST',
          headers: {},
          connection: { remoteAddress: '::ffff:9.8.7.6' },
        }),
      }),
    } as any;
    interceptor = new LoggingInterceptor(logger);
    interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Incoming Request on /test',
          method: 'POST',
          ip: '9.8.7.6',
        }),
        'Incoming Request on /test',
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          ip: '9.8.7.6',
          duration: expect.any(Number),
        }),
        'End Request for /test',
      );
      done();
    });
  });
});
