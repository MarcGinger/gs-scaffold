// JWT payload interface based on Keycloak token structure
export interface JwtPayload {
  // Standard JWT claims
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;

  // Keycloak specific claims
  name?: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;

  // Authorization claims
  realm_access?: {
    roles: string[];
  };
  resource_access?: Record<
    string,
    {
      roles: string[];
    }
  >;
  scope?: string;
  permissions?: string[];
  roles?: string[];
  groups?: string[];

  // Client and session
  azp?: string; // Authorized party (client_id)
  client_id?: string;
  session_state?: string;

  // Custom tenant claims
  tenant?: string;
  tenant_id?: string;
  organization?: string;
  org_id?: string;
  custom_tenant?: string;
  organization_id?: string;
  tenant_roles?: Record<string, string[]>;

  // Security metadata
  security_level?: number;
  mfa_verified?: boolean;

  // Additional claims can be added as needed
  [key: string]: any;
}
