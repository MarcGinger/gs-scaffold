/**
 * Product domain commands for CQRS pattern
 */

export interface CreateProductCommand {
  readonly type: 'product.create';
  readonly payload: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly price: number;
    readonly categoryId: string;
    readonly sku: string;
  };
  readonly metadata: {
    readonly correlationId: string;
    readonly causationId: string;
    readonly tenantId: string;
    readonly userId?: string;
  };
}

export interface UpdateProductPriceCommand {
  readonly type: 'product.updatePrice';
  readonly payload: {
    readonly id: string;
    readonly newPrice: number;
    readonly reason: string;
  };
  readonly metadata: {
    readonly correlationId: string;
    readonly causationId: string;
    readonly tenantId: string;
    readonly userId?: string;
  };
}

export interface DeactivateProductCommand {
  readonly type: 'product.deactivate';
  readonly payload: {
    readonly id: string;
    readonly reason: string;
  };
  readonly metadata: {
    readonly correlationId: string;
    readonly causationId: string;
    readonly tenantId: string;
    readonly userId?: string;
  };
}

export type ProductCommand =
  | CreateProductCommand
  | UpdateProductPriceCommand
  | DeactivateProductCommand;
