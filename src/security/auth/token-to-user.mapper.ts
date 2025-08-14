import { Injectable } from '@nestjs/common';
import { IUserToken } from '../types/user-token.interface';
import { JwtPayload } from '../types/jwt-payload.interface';

@Injectable()
export class TokenToUserMapper {
  mapToUserToken(payload: JwtPayload): IUserToken {
    // Extract roles from various places in the JWT
    const roles = this.extractRoles(payload);

    // Extract tenant information
    const tenant = this.extractTenant(payload);

    // Map the payload to our user token interface
    const userToken: IUserToken = {
      sub: payload.sub,
      name: payload.name || payload.preferred_username || payload.sub,
      email: payload.email || '',
      preferred_username: payload.preferred_username,
      tenant: tenant?.tenant,
      tenant_id: tenant?.tenant_id,
      client_id: payload.azp || payload.client_id,
      roles,
      permissions: payload.permissions || [],
      scope: payload.scope,
      session_state: payload.session_state,
      resource_access: payload.resource_access,
      realm_access: payload.realm_access,
      groups: payload.groups || [],

      // JWT standard claims
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
      iat: payload.iat,
      nbf: payload.nbf,
      jti: payload.jti,

      // Tenant-specific roles
      tenant_roles: this.extractTenantRoles(payload, tenant?.tenant),
      security_level: payload.security_level || 1,
      mfa_verified: payload.mfa_verified || false,
    };

    return userToken;
  }

  private extractRoles(payload: JwtPayload): string[] {
    const roles: string[] = [];

    // Extract from realm_access
    if (payload.realm_access?.roles) {
      roles.push(...payload.realm_access.roles);
    }

    // Extract from resource_access (for each client)
    if (payload.resource_access) {
      Object.values(payload.resource_access).forEach((access) => {
        if (access.roles) {
          roles.push(...access.roles);
        }
      });
    }

    // Extract from groups
    if (payload.groups) {
      roles.push(...payload.groups);
    }

    // Extract from custom roles claim
    if (payload.roles) {
      roles.push(...payload.roles);
    }

    // Remove duplicates and filter out system roles
    return [...new Set(roles)].filter(
      (role) =>
        !role.startsWith('uma_') &&
        !role.startsWith('default-') &&
        role !== 'offline_access',
    );
  }

  private extractTenant(
    payload: JwtPayload,
  ): { tenant?: string; tenant_id?: string } | null {
    // Try various places where tenant might be stored
    const tenant =
      payload.tenant ||
      payload.tenant_id ||
      payload.custom_tenant ||
      payload.organization ||
      payload.org_id;

    const tenant_id =
      payload.tenant_id ||
      payload.tenant ||
      payload.organization_id ||
      payload.org_id;

    if (tenant || tenant_id) {
      return {
        tenant: typeof tenant === 'string' ? tenant : String(tenant),
        tenant_id:
          typeof tenant_id === 'string' ? tenant_id : String(tenant_id),
      };
    }

    return null;
  }

  private extractTenantRoles(payload: JwtPayload, tenant?: string): string[] {
    if (!tenant) return [];

    const tenantRoles: string[] = [];

    // Check if there are tenant-specific roles in resource_access
    if (payload.resource_access?.[tenant]?.roles) {
      tenantRoles.push(...payload.resource_access[tenant].roles);
    }

    // Check for tenant-prefixed roles in realm_access
    if (payload.realm_access?.roles) {
      const tenantPrefixedRoles = payload.realm_access.roles
        .filter((role: string) => role.startsWith(`${tenant}:`))
        .map((role: string) => role.substring(tenant.length + 1));
      tenantRoles.push(...tenantPrefixedRoles);
    }

    // Check for custom tenant roles claim
    if (payload.tenant_roles?.[tenant]) {
      tenantRoles.push(...payload.tenant_roles[tenant]);
    }

    return [...new Set(tenantRoles)];
  }
}
