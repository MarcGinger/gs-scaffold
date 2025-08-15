import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { OrderService } from './order.service';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';
import { Log } from '../shared/logging/structured-logger';
import { OrderResource } from './order.resource';

// Create service-specific logger helpers
const orderLoggerFactory = createServiceLoggerFactory('order-service');

@Controller('orders')
export class OrderController {
  private readonly log: Logger;

  constructor(
    private readonly orderService: OrderService,
    @Inject(APP_LOGGER) baseLogger: Logger,
  ) {
    this.log = orderLoggerFactory.createComponentLogger(
      baseLogger,
      'OrderController',
    );
  }

  @Post()
  @OrderResource('create')
  createOrder(@Body() orderData: { id: string; amount: number }): any {
    Log.minimal.info(this.log, 'Create order endpoint called', {
      method: 'createOrder',
      endpoint: 'POST /orders',
    });

    return this.orderService.processOrder(orderData);
  }

  @Get(':id/status')
  @OrderResource('read')
  getOrderStatus(@Param('id') id: string): any {
    Log.minimal.info(this.log, 'Get order status endpoint called', {
      method: 'getOrderStatus',
      endpoint: 'GET /orders/:id/status',
      orderId: id,
    });

    return this.orderService.getOrderStatus(id);
  }
}
