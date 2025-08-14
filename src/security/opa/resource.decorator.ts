import { SetMetadata } from '@nestjs/common';

export interface ResourceOptions {
  type: string;
  action: string;
  extractId?: (req: any) => string | undefined;
  extractAttributes?: (req: any) => Record<string, any>;
}

export const RESOURCE_KEY = 'resource';

export const Resource = (options: ResourceOptions) =>
  SetMetadata(RESOURCE_KEY, options);

// Convenience decorators for common resources
export const ProductResource = (action: string) =>
  Resource({
    type: 'product',
    action: `product.${action}`,
    extractId: (req) => req.params?.id,
    extractAttributes: (req) => ({
      category: req.body?.category || req.query?.category,
      ownerId: req.body?.ownerId || req.query?.ownerId,
    }),
  });

export const OrderResource = (action: string) =>
  Resource({
    type: 'order',
    action: `order.${action}`,
    extractId: (req) => req.params?.id,
    extractAttributes: (req) => ({
      customerId: req.body?.customerId || req.query?.customerId,
      status: req.body?.status || req.query?.status,
    }),
  });

export const UserResource = (action: string) =>
  Resource({
    type: 'user',
    action: `user.${action}`,
    extractId: (req) => req.params?.id,
    extractAttributes: (req) => ({
      department: req.body?.department || req.query?.department,
      role: req.body?.role || req.query?.role,
    }),
  });
