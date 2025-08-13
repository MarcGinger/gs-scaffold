import { ConfigService } from '../config.service';
import { Log } from '../../logging/structured-logger';
import pino from 'pino';

describe('ConfigService with Log.minimal pattern', () => {
  let configService: ConfigService;
  let mockLogger: any;

  beforeEach(() => {
    configService = ConfigService.getInstance();
    mockLogger = pino({
      level: 'debug',
      transport: { target: 'pino-pretty' },
    });
  });

  it('should use Log.minimal.info pattern correctly', () => {
    // Set up valid configuration
    process.env.NODE_ENV = 'development';
    process.env.LOG_SINK = 'console';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_NAME = 'test-app';

    // Spy on process.stdout to capture log output
    const writeSpy = jest.spyOn(process.stdout, 'write');
    writeSpy.mockImplementation(() => true);

    try {
      configService.validateAndLog(mockLogger);
    } catch (error) {
      // Expected in test environment
    }

    // Verify that logs contain component information
    const logCalls = writeSpy.mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    // Check that component is automatically included
    const logOutput = logCalls.map((call) => call[0] as string).join('');
    expect(logOutput).toContain('"component":"ConfigService"');

    writeSpy.mockRestore();
  });

  it('should demonstrate the Log.minimal convenience methods', () => {
    // Initialize logger first
    configService.validateAndLog(mockLogger);

    const writeSpy = jest.spyOn(process.stdout, 'write');
    writeSpy.mockImplementation(() => true);

    // Test convenience methods
    configService.logInfo('Configuration loaded', { configSize: 42 });
    configService.logWarning('Deprecated setting detected', {
      setting: 'old_param',
    });
    configService.logError(
      new Error('Config file missing'),
      'Failed to load config file',
      { filePath: '/etc/config.json' },
    );

    // Verify all methods produced output
    expect(writeSpy).toHaveBeenCalledTimes(3);

    const logOutputs = writeSpy.mock.calls.map((call) => call[0] as string);

    // Verify info log
    expect(logOutputs[0]).toContain('"component":"ConfigService"');
    expect(logOutputs[0]).toContain('"method":"logInfo"');
    expect(logOutputs[0]).toContain('"configSize":42');

    // Verify warning log
    expect(logOutputs[1]).toContain('"component":"ConfigService"');
    expect(logOutputs[1]).toContain('"method":"logWarning"');
    expect(logOutputs[1]).toContain('"setting":"old_param"');

    // Verify error log
    expect(logOutputs[2]).toContain('"component":"ConfigService"');
    expect(logOutputs[2]).toContain('"method":"logError"');
    expect(logOutputs[2]).toContain('"filePath":"/etc/config.json"');

    writeSpy.mockRestore();
  });

  it('should show how to use Log.minimal in other services', () => {
    // Example pattern for other services
    class ExampleService {
      private logger: any;

      constructor(baseLogger: any) {
        // Each service creates its own component logger
        this.logger =
          require('../../logging/logging.providers').createComponentLogger(
            baseLogger,
            'ExampleService',
          );
      }

      doSomething() {
        // Clean logging with automatic component inclusion
        Log.minimal.info(this.logger, 'Operation started', {
          method: 'doSomething',
          operation: 'data-processing',
        });

        try {
          // ... do work ...
          Log.minimal.info(this.logger, 'Operation completed successfully', {
            method: 'doSomething',
            processed: 100,
            timingMs: 250,
          });
        } catch (error) {
          Log.minimal.error(this.logger, error as Error, 'Operation failed', {
            method: 'doSomething',
            operation: 'data-processing',
          });
          throw error;
        }
      }
    }

    const exampleService = new ExampleService(mockLogger);

    const writeSpy = jest.spyOn(process.stdout, 'write');
    writeSpy.mockImplementation(() => true);

    exampleService.doSomething();

    // Verify the pattern works for other services too
    const logOutputs = writeSpy.mock.calls.map((call) => call[0] as string);
    expect(logOutputs[0]).toContain('"component":"ExampleService"');
    expect(logOutputs[1]).toContain('"component":"ExampleService"');

    writeSpy.mockRestore();
  });
});
