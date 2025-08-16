import { ChangeProductPriceProps } from '../../domain';

export class ChangeProductPricePropsCommand implements ChangeProductPriceProps {
  constructor(
    public readonly productId: string,
    public readonly price: number,
    public readonly currency: string,
    // Metadata
    public readonly correlationId?: string,
    public readonly userId?: string,
    public readonly tenantId?: string,
  ) {}
}
