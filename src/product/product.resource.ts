import { Resource } from '../shared/security/opa/resource.decorator';
import { Request } from 'express';

/**
 * Product resource decorator for authorization
 * @param action - The product action being performed (e.g., 'create', 'read', 'update', 'delete')
 */
export const ProductResource = (action: string) =>
  Resource({
    type: 'product',
    action: `product.${action}`,
    extractId: (req: Request) => req.params?.productId || req.params?.id,
    extractAttributes: (req: Request) => {
      const body = req.body as Record<string, unknown> | undefined;
      const query = req.query as Record<string, unknown> | undefined;

      return {
        category: (body?.category || query?.category) as string | undefined,
        brand: (body?.brand || query?.brand) as string | undefined,
        price: (body?.price || query?.price) as number | undefined,
        status: (body?.status || query?.status) as string | undefined,
        vendorId: (body?.vendorId || query?.vendorId) as string | undefined,
      };
    },
  });

/**
 * Product catalog resource decorator (for catalog-specific actions)
 * @param action - The catalog action being performed
 */
export const ProductCatalogResource = (action: string) =>
  Resource({
    type: 'product-catalog',
    action: `product.catalog.${action}`,
    extractId: (req: Request) => req.params?.catalogId || req.params?.id,
    extractAttributes: (req: Request) => {
      const body = req.body as Record<string, unknown> | undefined;
      const query = req.query as Record<string, unknown> | undefined;

      return {
        visibility: (body?.visibility || query?.visibility) as
          | string
          | undefined,
        region: (body?.region || query?.region) as string | undefined,
        targetAudience: (body?.targetAudience || query?.targetAudience) as
          | string
          | undefined,
      };
    },
  });
