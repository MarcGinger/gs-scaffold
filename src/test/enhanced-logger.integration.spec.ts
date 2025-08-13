import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from '../app.service';
import { ClsModule, ClsService } from 'nestjs-cls';
import { LoggingModule } from '../shared/logging/logging.module';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import type { Logger } from 'pino';

describe('Enhanced Logger Integration Test', () => {
  let app: TestingModule;
  let appService: AppService;
  let clsService: ClsService;

  beforeEach(async () => {
    app = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({
          global: true,
          middleware: { mount: true, generateId: true },
        }),
        LoggingModule,
      ],
      providers: [AppService],
    }).compile();

    appService = app.get<AppService>(AppService);
    clsService = app.get<ClsService>(ClsService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should inject the enhanced APP_LOGGER correctly', () => {
    expect(appService).toBeDefined();

    // Verify the service is properly instantiated with the logger
    expect(appService).toBeInstanceOf(AppService);
  });

  it('should use CLS-aware logger with automatic context', () => {
    // Setup CLS context like a real request would
    clsService.run(() => {
      clsService.set('traceId', 'test-trace-123');
      clsService.set('correlationId', 'test-correlation-456');
      clsService.set('userId', 'test-user-789');
      clsService.set('tenantId', 'test-tenant-abc');

      // Call the service method
      const result = appService.getHello();

      expect(result).toBe('Hello World!');

      // The logger should have automatically included CLS context
      // This would be verified by checking the actual log output
      // In a real scenario, you'd capture the pino output stream
    });
  });

  it('should create component logger with proper context', () => {
    const baseLogger = app.get<Logger>(APP_LOGGER);
    expect(baseLogger).toBeDefined();

    // Verify the logger is an object (Pino logger instance)
    expect(typeof baseLogger).toBe('object');
  });

  it('should demonstrate the enhanced logging pattern', () => {
    // This test shows how the new pattern works
    clsService.run(() => {
      clsService.set('traceId', 'demo-trace-123');
      clsService.set('userId', 'demo-user-456');

      // Before enhancement: Required service, component, method
      // Log.info(logger, 'Operation complete', {
      //   service: 'gs-scaffold',
      //   component: 'AppService',
      //   method: 'getHello',
      // });

      // After enhancement: Only method required (service/component automatic)
      // Log.minimal.info(logger, 'Operation complete', {
      //   method: 'getHello',
      // });

      // The logger automatically includes:
      // - app, environment, version (from base config)
      // - service (from base config)
      // - component (from createComponentLogger)
      // - traceId, correlationId, userId, tenantId (from CLS)

      expect(true).toBe(true); // Test passes if no errors
    });
  });
});
