export class DeactivateProductCommand {
  constructor(
    public readonly productId: string,
    // Metadata
    public readonly correlationId?: string,
    public readonly userId?: string,
    public readonly tenantId?: string,
  ) {}
}
