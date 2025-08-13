import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';
import { Log } from '../shared/logging/structured-logger';

// Create service-specific logger helpers
const orderLoggerFactory = createServiceLoggerFactory('order-service');

interface OrderData {
  id: string;
  amount: number;
}

interface Order extends OrderData {
  status: string;
  processedAt: Date;
}

@Injectable()
export class OrderService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = orderLoggerFactory.createComponentLogger(
      baseLogger,
      'OrderService',
    );
  }

  processOrder(orderData: OrderData): Order {
    Log.minimal.info(this.log, 'Processing order', {
      method: 'processOrder',
      orderId: orderData.id,
      amount: orderData.amount,
    });

    try {
      const order: Order = {
        ...orderData,
        status: 'processed',
        processedAt: new Date(),
      };

      Log.minimal.info(this.log, 'Order processed successfully', {
        method: 'processOrder',
        orderId: order.id,
        status: order.status,
      });

      return order;
    } catch (error: any) {
      Log.minimal.error(this.log, error, 'Failed to process order', {
        method: 'processOrder',
        orderId: orderData.id,
      });
      throw error;
    }
  }

  getOrderStatus(orderId: string): Order {
    Log.minimal.debug(this.log, 'Getting order status', {
      method: 'getOrderStatus',
      orderId,
    });

    // This will log with:
    // {
    //   "service": "order-service",  <- Different from user-service
    //   "component": "OrderService",
    //   "level": "debug",
    //   "msg": "Getting order status",
    //   "method": "getOrderStatus",
    //   "orderId": "order-123"
    // }

    return {
      id: orderId,
      amount: 100,
      status: 'processed',
      processedAt: new Date(),
    };
  }
}
