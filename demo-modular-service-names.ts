#!/usr/bin/env node

/**
 * Demonstration of Modular Service Name Configuration
 *
 * This script shows how each NestJS module can register its own service name
 * while maintaining the same logging infrastructure and component logger pattern.
 */

import { NestFactory } from '@nestjs/core';
import { Module, Injectable, Inject } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { LoggingModule } from './src/shared/logging/logging.module';
import {
  createServiceLoggerFactory,
  APP_LOGGER,
} from './src/shared/logging/logging.providers';
import { Log } from './src/shared/logging/structured-logger';
import type { Logger } from 'pino';

/* ================================================================
 * DEMO SERVICES WITH DIFFERENT SERVICE NAMES
 * ================================================================ */

// Main App Service (gs-scaffold)
const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');

@Injectable()
class DemoAppService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = appLoggerFactory.createComponentLogger(
      baseLogger,
      'DemoAppService',
    );
  }

  doAppWork() {
    Log.minimal.info(this.log, 'Main app performing work', {
      method: 'doAppWork',
      action: 'startup-sequence',
    });
  }
}

// User Service (user-service)
const userLoggerFactory = createServiceLoggerFactory('user-service');

@Injectable()
class DemoUserService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = userLoggerFactory.createComponentLogger(
      baseLogger,
      'DemoUserService',
    );
  }

  createUser() {
    Log.minimal.info(this.log, 'Creating new user', {
      method: 'createUser',
      userId: 'demo-user-123',
    });

    Log.minimal.info(this.log, 'User created successfully', {
      method: 'createUser',
      userId: 'demo-user-123',
      duration: '45ms',
    });
  }
}

// Order Service (order-service)
const orderLoggerFactory = createServiceLoggerFactory('order-service');

@Injectable()
class DemoOrderService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = orderLoggerFactory.createComponentLogger(
      baseLogger,
      'DemoOrderService',
    );
  }

  processOrder() {
    Log.minimal.info(this.log, 'Processing order', {
      method: 'processOrder',
      orderId: 'demo-order-456',
      amount: 100,
    });

    Log.minimal.info(this.log, 'Order processed successfully', {
      method: 'processOrder',
      orderId: 'demo-order-456',
      status: 'completed',
    });
  }
}

// Payment Service (payment-service)
const paymentLoggerFactory = createServiceLoggerFactory('payment-service');

@Injectable()
class DemoPaymentService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = paymentLoggerFactory.createComponentLogger(
      baseLogger,
      'DemoPaymentService',
    );
  }

  processPayment() {
    Log.minimal.info(this.log, 'Processing payment', {
      method: 'processPayment',
      paymentId: 'demo-payment-789',
      gateway: 'stripe',
    });

    try {
      // Simulate work
      Log.minimal.info(this.log, 'Payment completed', {
        method: 'processPayment',
        paymentId: 'demo-payment-789',
        status: 'success',
      });
    } catch (error: any) {
      Log.minimal.error(this.log, error, 'Payment failed', {
        method: 'processPayment',
        paymentId: 'demo-payment-789',
      });
    }
  }
}

/* ================================================================
 * DEMO MODULE CONFIGURATION
 * ================================================================ */

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true },
    }),
    LoggingModule,
  ],
  providers: [
    DemoAppService,
    DemoUserService,
    DemoOrderService,
    DemoPaymentService,
    // Each service registers its own logger provider
    appLoggerFactory.createAppLoggerProvider(),
    userLoggerFactory.createAppLoggerProvider(),
    orderLoggerFactory.createAppLoggerProvider(),
    paymentLoggerFactory.createAppLoggerProvider(),
  ],
})
class DemoModule {}

/* ================================================================
 * DEMONSTRATION RUNNER
 * ================================================================ */

async function runDemo() {
  console.log('\n🚀 Starting Modular Service Name Configuration Demo\n');

  const app = await NestFactory.createApplicationContext(DemoModule, {
    logger: false, // Disable default logger to see our structured logs clearly
  });

  const appService = app.get(DemoAppService);
  const userService = app.get(DemoUserService);
  const orderService = app.get(DemoOrderService);
  const paymentService = app.get(DemoPaymentService);

  console.log('📋 Generating logs from different services...\n');

  // Generate logs from each service
  appService.doAppWork();
  userService.createUser();
  orderService.processOrder();
  paymentService.processPayment();

  console.log(
    '\n✅ Demo completed! Notice how each service logs with its own service name:',
  );
  console.log('   • Main app logs include: "service":"gs-scaffold"');
  console.log('   • User operations include: "service":"user-service"');
  console.log('   • Order operations include: "service":"order-service"');
  console.log('   • Payment operations include: "service":"payment-service"');
  console.log(
    '\n🔍 In production, you can filter logs by service in Grafana/Loki:',
  );
  console.log('   • {service="user-service"} - Show only user service logs');
  console.log('   • {service="order-service"} - Show only order service logs');
  console.log(
    '   • {service=~".*"} | json | component="DemoUserService" - Filter by component',
  );
  console.log(
    '   • {service=~".*"} | json | method="createUser" - Filter by method',
  );

  await app.close();
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

export { runDemo };
