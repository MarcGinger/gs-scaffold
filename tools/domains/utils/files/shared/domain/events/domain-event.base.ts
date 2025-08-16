import { IUserToken } from 'src/shared/auth';

export abstract class DomainEvent {
  abstract readonly eventType: string;

  readonly occurredAt: string = new Date().toISOString();
  readonly userId: string;
  readonly tenant: string;
  readonly tenantId: string;
  readonly username: string;

  constructor(
    user: IUserToken,
    public readonly aggregateId: string,
  ) {
    this.userId = user.sub;
    this.tenantId = user.tenant_id ?? user.tenant ?? 'unknown';
    this.username = user.preferred_username ?? user.name ?? user.email;
    this.tenant = user.tenant ?? 'unknown';
  }
}
