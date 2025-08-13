import { ConfigService } from '../config.service';
import { createComponentLogger } from '../../logging/logging.providers';
import pino from 'pino';

describe('ConfigService Component Logger Integration', () => {
  let configService: ConfigService;
  let mockLogger: any;

  beforeEach(() => {
    configService = ConfigService.getInstance();
    mockLogger = pino({
      level: 'debug',
      transport: { target: 'pino-pretty' },
    });
  });

  it('should use component logger that automatically includes component name', () => {
    // Spy on the child method to verify component logger creation
    const childSpy = jest.spyOn(mockLogger, 'child');
    const mockComponentLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    childSpy.mockReturnValue(mockComponentLogger as any);

    // Mock successful validation
    process.env.NODE_ENV = 'development';
    process.env.LOG_SINK = 'console';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_NAME = 'test-app';

    try {
      configService.validateAndLog(mockLogger);
    } catch (error) {
      // Expected in test environment due to missing validation
    }

    // Verify that child logger was created with component name
    expect(childSpy).toHaveBeenCalledWith({ component: 'ConfigService' });

    // Verify that the component logger was used (not the base logger)
    expect(mockComponentLogger.info).toHaveBeenCalled();
  });

  it('should demonstrate the benefit of component logger pattern', () => {
    const baseLogger = pino({
      level: 'info',
      base: { service: 'test-service' },
    });

    // Create component logger
    const componentLogger = createComponentLogger(baseLogger, 'ConfigService');

    // Spy on the actual write method to see the final log output
    const writeSpy = jest.spyOn(process.stdout, 'write');
    writeSpy.mockImplementation(() => true);

    // Log something with minimal context
    componentLogger.info(
      {
        method: 'testMethod',
        result: 'success',
      },
      'Operation completed',
    );

    // Verify that the output contains the component name
    expect(writeSpy).toHaveBeenCalled();
    const logOutput = writeSpy.mock.calls[0][0] as string;
    expect(logOutput).toContain('"component":"ConfigService"');
    expect(logOutput).toContain('"method":"testMethod"');
    expect(logOutput).toContain('"result":"success"');

    writeSpy.mockRestore();
  });

  it('should show the difference between regular and component logger usage', () => {
    const baseLogger = pino({ level: 'info' });
    const componentLogger = createComponentLogger(baseLogger, 'ConfigService');

    // Test output by capturing writes
    const writeSpy = jest.spyOn(process.stdout, 'write');
    writeSpy.mockImplementation(() => true);

    // Regular logger - must specify component manually
    baseLogger.info(
      {
        service: 'test-service',
        component: 'ConfigService', // Manual specification required
        method: 'testMethod',
      },
      'Regular logger message',
    );

    // Component logger - component automatically included
    componentLogger.info(
      {
        service: 'test-service',
        method: 'testMethod', // No need to specify component
      },
      'Component logger message',
    );

    // Verify both calls produced output with component field
    expect(writeSpy).toHaveBeenCalledTimes(2);

    const regularLogOutput = writeSpy.mock.calls[0][0] as string;
    const componentLogOutput = writeSpy.mock.calls[1][0] as string;

    // Both should contain the component field
    expect(regularLogOutput).toContain('"component":"ConfigService"');
    expect(componentLogOutput).toContain('"component":"ConfigService"');

    // But the component logger achieves this automatically
    expect(componentLogOutput).toContain('"method":"testMethod"');
    expect(componentLogOutput).toContain('Component logger message');

    writeSpy.mockRestore();
  });
});
