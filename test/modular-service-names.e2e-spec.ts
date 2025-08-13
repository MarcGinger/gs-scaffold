/**
 * Test demonstrating modular service name configuration
 * Shows how different modules log with their own service names
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { LoggingModule } from '../src/shared/logging/logging.module';
import { UserService } from '../src/user/user.service';
import { OrderService } from '../src/order/order.service';
import { AppService } from '../src/app.service';
import { createServiceLoggerFactory } from '../src/shared/logging/logging.providers';

describe('Modular Service Name Configuration (e2e)', () => {
  let app: INestApplication;
  let userService: UserService;
  let orderService: OrderService;
  let appService: AppService;

  beforeEach(async () => {
    // Create service-specific logger factories
    const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');
    const userLoggerFactory = createServiceLoggerFactory('user-service');
    const orderLoggerFactory = createServiceLoggerFactory('order-service');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({
          global: true,
          middleware: { mount: true, generateId: true },
        }),
        LoggingModule,
      ],
      providers: [
        AppService,
        UserService,
        OrderService,
        // Each service gets its own logger provider with service name
        appLoggerFactory.createAppLoggerProvider(),
        userLoggerFactory.createAppLoggerProvider(),
        orderLoggerFactory.createAppLoggerProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userService = moduleFixture.get<UserService>(UserService);
    orderService = moduleFixture.get<OrderService>(OrderService);
    appService = moduleFixture.get<AppService>(AppService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should log with different service names for different modules', () => {
    // Capture console output to verify service names
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation();

    try {
      // Test AppService logging (gs-scaffold service)
      appService.getHello();

      // Test UserService logging (user-service)
      userService.createUser({ id: 'user-123', name: 'John Doe' });
      userService.findUser('user-123');

      // Test OrderService logging (order-service)
      orderService.processOrder({ id: 'order-456', amount: 100 });
      orderService.getOrderStatus('order-456');

      // Verify that logs contain different service names
      const allLogs = [
        ...consoleSpy.mock.calls.map((call) => call[0]),
        ...stdoutSpy.mock.calls.map((call) => call[0]),
      ];

      // Check for service-specific logging
      const logStrings = allLogs.filter((log) => typeof log === 'string');

      console.log('📋 Captured log entries:');
      logStrings.forEach((log, index) => {
        console.log(`${index + 1}. ${log}`);
      });

      // Verify service isolation
      const gsScaffoldLogs = logStrings.filter((log) =>
        log.includes('"service":"gs-scaffold"'),
      );
      const userServiceLogs = logStrings.filter((log) =>
        log.includes('"service":"user-service"'),
      );
      const orderServiceLogs = logStrings.filter((log) =>
        log.includes('"service":"order-service"'),
      );

      console.log('\n🎯 Service-specific log counts:');
      console.log(`gs-scaffold service: ${gsScaffoldLogs.length} logs`);
      console.log(`user-service: ${userServiceLogs.length} logs`);
      console.log(`order-service: ${orderServiceLogs.length} logs`);

      // Assertions
      expect(gsScaffoldLogs.length).toBeGreaterThan(0);
      expect(userServiceLogs.length).toBeGreaterThan(0);
      expect(orderServiceLogs.length).toBeGreaterThan(0);

      // Verify component names are included
      expect(
        userServiceLogs.some((log) =>
          log.includes('"component":"UserService"'),
        ),
      ).toBe(true);

      expect(
        orderServiceLogs.some((log) =>
          log.includes('"component":"OrderService"'),
        ),
      ).toBe(true);

      console.log('\n✅ Modular service name configuration working correctly!');
      console.log(
        '   Each module logs with its own service name while maintaining component clarity.',
      );
    } finally {
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });

  it('should demonstrate service-specific filtering capabilities', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation();

    try {
      // Generate logs from different services
      userService.createUser({ id: 'test-user', name: 'Test User' });
      orderService.processOrder({ id: 'test-order', amount: 50 });

      const allLogs = [
        ...consoleSpy.mock.calls.map((call) => call[0]),
        ...stdoutSpy.mock.calls.map((call) => call[0]),
      ].filter((log) => typeof log === 'string');

      // Simulate Grafana/Loki filtering
      console.log('\n🔍 Simulating Grafana/Loki service filtering:');

      console.log('\n📊 Filter: {service="user-service"}');
      const userLogs = allLogs.filter((log) =>
        log.includes('"service":"user-service"'),
      );
      userLogs.forEach((log) => console.log(`   ${log}`));

      console.log('\n📊 Filter: {service="order-service"}');
      const orderLogs = allLogs.filter((log) =>
        log.includes('"service":"order-service"'),
      );
      orderLogs.forEach((log) => console.log(`   ${log}`));

      console.log(
        '\n📊 Filter: {service="user-service"} | component="UserService"',
      );
      const userServiceComponent = allLogs.filter(
        (log) =>
          log.includes('"service":"user-service"') &&
          log.includes('"component":"UserService"'),
      );
      userServiceComponent.forEach((log) => console.log(`   ${log}`));

      expect(userLogs.length).toBeGreaterThan(0);
      expect(orderLogs.length).toBeGreaterThan(0);
      expect(userServiceComponent.length).toBeGreaterThan(0);
    } finally {
      consoleSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });
});
