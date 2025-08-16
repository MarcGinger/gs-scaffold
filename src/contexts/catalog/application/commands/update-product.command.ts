export class UpdateProductCommand {
  constructor(
    public readonly productId: string,
    public readonly name?: string,
    public readonly description?: string,
    // Metadata
    public readonly correlationId?: string,
    public readonly userId?: string,
    public readonly tenantId?: string,
  ) {}
}
