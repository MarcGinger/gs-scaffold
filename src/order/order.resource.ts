import { Resource } from '../shared/security/opa/resource.decorator';
import { Request } from 'express';

/**
 * Order resource decorator for authorization
 * @param action - The order action being performed (e.g., 'create', 'read', 'update', 'cancel')
 */
export const OrderResource = (action: string) =>
  Resource({
    type: 'order',
    action: `order.${action}`,
    extractId: (req: Request) => req.params?.orderId || req.params?.id,
    extractAttributes: (req: Request) => {
      const body = req.body as Record<string, unknown> | undefined;
      const query = req.query as Record<string, unknown> | undefined;

      return {
        customerId: (body?.customerId || query?.customerId) as
          | string
          | undefined,
        status: (body?.status || query?.status) as string | undefined,
        amount: (body?.amount || query?.amount) as number | undefined,
        priority: (body?.priority || query?.priority) as string | undefined,
        region: (body?.region || query?.region) as string | undefined,
      };
    },
  });

/**
 * Order fulfillment resource decorator (for fulfillment-specific actions)
 * @param action - The fulfillment action being performed
 */
export const OrderFulfillmentResource = (action: string) =>
  Resource({
    type: 'order-fulfillment',
    action: `order.fulfillment.${action}`,
    extractId: (req: Request) => req.params?.orderId || req.params?.id,
    extractAttributes: (req: Request) => {
      const body = req.body as Record<string, unknown> | undefined;
      const query = req.query as Record<string, unknown> | undefined;

      return {
        warehouseId: (body?.warehouseId || query?.warehouseId) as
          | string
          | undefined,
        shippingMethod: (body?.shippingMethod || query?.shippingMethod) as
          | string
          | undefined,
        carrier: (body?.carrier || query?.carrier) as string | undefined,
      };
    },
  });
