import { Injectable } from '@nestjs/common';
import { IUserToken } from '../types/user-token.interface';
import { JwtPayload } from '../types/jwt-payload.interface';

type ResourceAccess = Record<string, { roles?: unknown }>;

export interface TokenMapperOptions {
  includeGroupsAsRoles?: boolean; // default true
  roleCase?: 'lower' | 'original'; // default 'lower'
  ignoreRolePrefixes?: string[]; // default ['uma_', 'default-']
  ignoreRoles?: string[]; // default ['offline_access']
  tenantClaimOrder?: string[]; // default ['tenant', 'organization', 'custom_tenant']
  tenantIdClaimOrder?: string[]; // default ['tenant_id', 'organization_id', 'org_id']
}

const DEFAULT_OPTS: Required<TokenMapperOptions> = {
  includeGroupsAsRoles: true,
  roleCase: 'lower',
  ignoreRolePrefixes: ['uma_', 'default-'],
  ignoreRoles: ['offline_access'],
  tenantClaimOrder: ['tenant', 'organization', 'custom_tenant'],
  tenantIdClaimOrder: ['tenant_id', 'organization_id', 'org_id'],
};

@Injectable()
export class TokenToUserMapper {
  private readonly options: Required<TokenMapperOptions> = DEFAULT_OPTS;

  mapToUserToken(payload: JwtPayload): IUserToken {
    const roles = this.extractRoles(payload, this.options);
    const { tenant, tenant_id } = this.extractTenant(payload, this.options);
    const tenant_roles = this.extractTenantRoles(payload, tenant, this.options);

    // Normalize aud to array for consistency
    const audArray = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : undefined;

    // Name fallback chain
    const name =
      payload.name ||
      payload.preferred_username ||
      (typeof payload.email === 'string' ? payload.email : undefined) ||
      payload.sub;

    const userToken: IUserToken = {
      sub: payload.sub,
      name,
      email: payload.email || '',
      preferred_username: payload.preferred_username,
      tenant,
      tenant_id,
      client_id: payload.azp || payload.client_id,
      roles,
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions
        : [],
      scope: typeof payload.scope === 'string' ? payload.scope : undefined,
      session_state: payload.session_state,
      resource_access: payload.resource_access,
      realm_access: payload.realm_access,
      groups: Array.isArray(payload.groups)
        ? this.normalizeGroups(payload.groups)
        : [],

      // JWT standard claims (pass-through)
      iss: payload.iss,
      aud: audArray,
      exp: payload.exp,
      iat: payload.iat,
      nbf: payload.nbf,
      jti: payload.jti,

      // tenant-related
      tenant_roles,
      security_level:
        typeof payload.security_level === 'number' ? payload.security_level : 1,
      mfa_verified: Boolean(payload.mfa_verified),
    };

    return userToken;
  }

  private extractRoles(
    payload: JwtPayload,
    opts: Required<TokenMapperOptions>,
  ): string[] {
    const out: string[] = [];

    // 1) realm_access.roles
    const realmRoles = this.asStringArray(payload?.realm_access?.roles);
    if (realmRoles) out.push(...realmRoles);

    // 2) resource_access[client].roles
    const ra = payload?.resource_access;
    if (this.isResourceAccess(ra)) {
      for (const v of Object.values(ra)) {
        const roles = this.asStringArray(v?.roles);
        if (roles) out.push(...roles);
      }
    }

    // 3) groups (optional)
    if (opts.includeGroupsAsRoles) {
      const groups = this.asStringArray(payload?.groups);
      if (groups) out.push(...groups.map((g) => this.groupToRole(g)));
    }

    // 4) custom roles claim
    const customRoles = this.asStringArray(payload?.roles);
    if (customRoles) out.push(...customRoles);

    // Normalize + filter
    const norm = out
      .map((r) =>
        opts.roleCase === 'lower' ? r?.toLowerCase()?.trim() : r?.trim(),
      )
      .filter(Boolean);

    const filtered = norm.filter(
      (r) =>
        !opts.ignoreRoles.includes(r) &&
        !opts.ignoreRolePrefixes.some((p) => r.startsWith(p)),
    );

    return Array.from(new Set(filtered)).sort();
  }

  private extractTenant(
    payload: JwtPayload,
    opts: Required<TokenMapperOptions>,
  ): { tenant?: string; tenant_id?: string } {
    const tenant = this.firstString(payload, opts.tenantClaimOrder);
    const tenant_id =
      this.firstString(payload, opts.tenantIdClaimOrder) ??
      // fallback if only one present
      (tenant ? tenant : undefined);

    return {
      tenant: tenant ?? undefined,
      tenant_id: tenant_id ?? undefined,
    };
  }

  private extractTenantRoles(
    payload: JwtPayload,
    tenant: string | undefined,
    opts: Required<TokenMapperOptions>,
  ): string[] {
    if (!tenant) return [];

    const out: string[] = [];

    // resource_access[tenant].roles
    const ra = payload?.resource_access;
    if (this.isResourceAccess(ra) && ra[tenant]) {
      const roles = this.asStringArray(ra[tenant].roles);
      if (roles) out.push(...roles);
    }

    // realm_access.roles with prefix "<tenant>:"
    const realmRoles = this.asStringArray(payload?.realm_access?.roles);
    if (realmRoles) {
      out.push(
        ...realmRoles
          .filter((r) => r.startsWith(`${tenant}:`))
          .map((r) => r.slice(tenant.length + 1)),
      );
    }

    // custom tenant_roles map
    const tr = payload?.tenant_roles as Record<string, unknown> | undefined;
    if (tr && typeof tr === 'object' && Array.isArray(tr[tenant])) {
      const tenantRoleArray = tr[tenant] as unknown[];
      out.push(
        ...tenantRoleArray.filter((x): x is string => typeof x === 'string'),
      );
    }

    const normalized = out.map((r) =>
      opts.roleCase === 'lower' ? r.toLowerCase().trim() : r.trim(),
    );
    return Array.from(new Set(normalized)).sort();
  }

  // ---------- helpers ----------

  private isResourceAccess(v: unknown): v is ResourceAccess {
    return v !== null && typeof v === 'object';
  }

  private asStringArray(v: unknown): string[] | undefined {
    if (!v) return undefined;
    if (Array.isArray(v))
      return v.filter((x): x is string => typeof x === 'string');
    return undefined;
  }

  private firstString(obj: unknown, keys: string[]): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const key of keys) {
      const record = obj as Record<string, unknown>;
      const val = record[key];
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
    return undefined;
  }

  private groupToRole(group: string): string {
    // Keycloak groups often look like '/admins' or '/tenant/admins'
    return group.startsWith('/') ? group.slice(1) : group;
  }

  private normalizeGroups(groups: string[]): string[] {
    return Array.from(
      new Set(groups.map((g) => (g.startsWith('/') ? g.slice(1) : g))),
    ).sort();
  }
}
