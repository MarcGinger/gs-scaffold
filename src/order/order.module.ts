import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { LoggingModule } from '../shared/logging/logging.module';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';

// Create service-specific logger factory for orders
const orderLoggerFactory = createServiceLoggerFactory('order-service');

@Module({
  imports: [LoggingModule],
  controllers: [OrderController],
  providers: [
    OrderService,
    // Each module registers its own app logger with unique service name
    orderLoggerFactory.createAppLoggerProvider(),
  ],
  exports: [OrderService],
})
export class OrderModule {}
