export class CreateProductCommand {
  constructor(
    public readonly productId: string,
    public readonly name: string,
    public readonly sku: string,
    public readonly price: number,
    public readonly currency: string,
    public readonly categoryId: string,
    public readonly categoryName: string,
    public readonly description?: string,
    // Metadata
    public readonly correlationId?: string,
    public readonly userId?: string,
    public readonly tenantId?: string,
  ) {}
}
