export interface IUserToken {
  sub: string;
  name: string;
  email: string;
  preferred_username?: string;
  tenant?: string;
  tenant_id?: string;
  client_id?: string;
  roles: string[];
  permissions?: string[];
  scope?: string;
  session_state?: string;
  resource_access?: Record<string, { roles: string[] }>;
  realm_access?: { roles: string[] };
  groups?: string[];

  // JWT standard claims
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;

  // Custom claims for security context
  correlation_id?: string;
  trace_id?: string;

  // Tenant and security metadata
  tenant_roles?: string[];
  security_level?: number;
  mfa_verified?: boolean;
}

export interface ISecurityContext {
  user: IUserToken;
  correlationId: string;
  traceId?: string;
  requestId?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}
