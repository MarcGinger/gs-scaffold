export interface IUserToken {
  sub: string;
  name: string;
  email: string;
  preferred_username?: string;
  tenant?: string;
  tenant_id?: string;
  client_id?: string;
}
