export class CategorizeProductCommand {
  constructor(
    public readonly productId: string,
    public readonly categoryId: string,
    public readonly categoryName: string,
    // Metadata
    public readonly correlationId?: string,
    public readonly userId?: string,
    public readonly tenantId?: string,
  ) {}
}
