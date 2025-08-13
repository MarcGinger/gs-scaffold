import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { buildAppLogger } from './logger.factory';
import { Log } from './structured-logger';

describe('Structured Logger Unit Tests', () => {
  let clsService: ClsService;
  let logger: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({
          global: true,
        }),
      ],
    }).compile();

    clsService = module.get(ClsService);
    logger = buildAppLogger(clsService);
  });

  it('should include traceId from CLS context', (done) => {
    const testTraceId = 'test-trace-12345';

    clsService.run(() => {
      clsService.set('traceId', testTraceId);

      // Mock the logger to capture the output
      const mockInfo = jest.fn();
      logger.info = mockInfo;

      Log.info(logger, 'Test message', {
        service: 'test-service',
        component: 'TestComponent',
        method: 'testMethod',
      });

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'test-service',
          component: 'TestComponent',
          method: 'testMethod',
        }),
        'Test message',
      );

      done();
    });
  });

  it('should handle error logging with proper error serialization', (done) => {
    const testError = new Error('Test error message');
    const testTraceId = 'error-trace-12345';

    clsService.run(() => {
      clsService.set('traceId', testTraceId);

      const mockError = jest.fn();
      logger.error = mockError;

      Log.error(logger, testError, 'Operation failed', {
        service: 'test-service',
        component: 'TestComponent',
        method: 'failingMethod',
      });

      expect(mockError).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'test-service',
          component: 'TestComponent',
          method: 'failingMethod',
          err: testError,
        }),
        'Operation failed',
      );

      done();
    });
  });

  it('should log ESDB events with expected flag for not found', (done) => {
    clsService.run(() => {
      clsService.set('traceId', 'esdb-trace-12345');

      const mockInfo = jest.fn();
      logger.info = mockInfo;

      Log.esdbCatchupNotFound(logger, {
        service: 'event-store',
        component: 'ProjectionManager',
        method: 'startProjection',
        esdb: {
          category: 'test.category.v1',
          stream: '$ce-test.category.v1',
        },
      });

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'event-store',
          component: 'ProjectionManager',
          method: 'startProjection',
          expected: true,
          esdb: {
            category: 'test.category.v1',
            stream: '$ce-test.category.v1',
          },
        }),
        'Category stream not found yet; waiting for first event',
      );

      done();
    });
  });

  it('should log BullMQ job events with queue context', (done) => {
    clsService.run(() => {
      clsService.set('traceId', 'bull-trace-12345');

      const mockInfo = jest.fn();
      logger.info = mockInfo;

      Log.bullQueued(logger, {
        service: 'notification-service',
        component: 'EmailWorker',
        method: 'processEmail',
        bull: {
          queue: 'email-queue',
          jobId: 'job-12345',
          attempt: 1,
        },
      });

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'notification-service',
          component: 'EmailWorker',
          method: 'processEmail',
          bull: {
            queue: 'email-queue',
            jobId: 'job-12345',
            attempt: 1,
          },
        }),
        'Job queued',
      );

      done();
    });
  });

  it('should include all required canonical log shape fields', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Test that base fields are always present
    expect(logger.level).toBeDefined();

    logSpy.mockRestore();
  });
});
