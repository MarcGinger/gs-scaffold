import { Injectable, Optional, Inject } from '@nestjs/common';
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
  transformGroupPaths?: boolean; // default false - transform /tenant/admin → tenant:admin
  maxRolesCount?: number; // default 100 - cap role arrays to prevent pathological tokens
  maxGroupsCount?: number; // default 50 - cap groups arrays
  maxTenantRolesCount?: number; // default 50 - cap tenant-specific roles
}

// Token for dependency injection
export const TOKEN_MAPPER_OPTIONS = 'TOKEN_MAPPER_OPTIONS';

const DEFAULT_OPTS: Required<TokenMapperOptions> = {
  includeGroupsAsRoles: true,
  roleCase: 'lower',
  ignoreRolePrefixes: ['uma_', 'default-'],
  ignoreRoles: ['offline_access'],
  tenantClaimOrder: ['tenant', 'organization', 'custom_tenant'],
  tenantIdClaimOrder: ['tenant_id', 'organization_id', 'org_id'],
  transformGroupPaths: false,
  maxRolesCount: 100,
  maxGroupsCount: 50,
  maxTenantRolesCount: 50,
};

@Injectable()
export class TokenToUserMapper {
  private readonly options: Required<TokenMapperOptions>;

  constructor(
    @Optional()
    @Inject(TOKEN_MAPPER_OPTIONS)
    injectedOptions?: TokenMapperOptions,
  ) {
    // Merge injected options with defaults and freeze for immutability
    this.options = Object.freeze({
      ...DEFAULT_OPTS,
      ...injectedOptions,
    });
  }

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
        ? this.normalizeGroups(payload.groups, this.options.maxGroupsCount)
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

    // 2) resource_access[client].roles with hardened traversal
    const ra = payload?.resource_access;
    if (this.isResourceAccess(ra)) {
      for (const value of Object.values(ra)) {
        if (this.isValidResourceEntry(value)) {
          const roles = this.asStringArray(value.roles);
          if (roles) out.push(...roles);
        }
      }
    }

    // 3) groups (optional)
    if (opts.includeGroupsAsRoles) {
      const groups = this.asStringArray(payload?.groups);
      if (groups) {
        const groups = this.asStringArray(payload.groups);
        if (groups) {
          out.push(
            ...groups
              .map((g) => this.groupToRole(g, opts))
              .slice(0, opts.maxGroupsCount), // Cap groups count
          );
        }
      }
    }

    // 4) custom roles claim
    const customRoles = this.asStringArray(payload?.roles);
    if (customRoles) out.push(...customRoles);

    // Normalize + filter with hardened string processing
    const normalized = out
      .map((r) => this.normalizeRoleString(r, opts))
      .filter(Boolean);

    const filtered = normalized.filter(
      (r) =>
        !opts.ignoreRoles.includes(r) &&
        !opts.ignoreRolePrefixes.some((p) => r.startsWith(p)),
    );

    const uniqueSorted = Array.from(new Set(filtered)).sort();

    // Cap array size to prevent pathological tokens
    return uniqueSorted.slice(0, opts.maxRolesCount);
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
    const uniqueSorted = Array.from(new Set(normalized)).sort();

    // Cap array size to prevent pathological tokens
    return uniqueSorted.slice(0, opts.maxTenantRolesCount);
  }

  // ---------- helpers ----------

  /**
   * Hardened resource_access validation
   * Only accepts objects with own enumerable properties that are valid resource entries
   */
  private isResourceAccess(v: unknown): v is ResourceAccess {
    if (v === null || typeof v !== 'object') return false;

    // Check that it's a plain object (not array, not function, etc.)
    if (Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) {
      return false;
    }

    return true;
  }

  /**
   * Validates individual resource_access entries
   * Ensures the value is an object with a roles property that can be safely processed
   */
  private isValidResourceEntry(v: unknown): v is { roles?: unknown } {
    return (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      ('roles' in v || Object.keys(v).length === 0) // Allow empty objects or objects with roles
    );
  }

  /**
   * Normalize and validate role strings with bounds checking
   */
  private normalizeRoleString(
    role: string,
    opts: Required<TokenMapperOptions>,
  ): string {
    if (typeof role !== 'string') return '';

    const trimmed = role.trim();
    if (!trimmed) return '';

    // Apply case normalization
    const normalized =
      opts.roleCase === 'lower' ? trimmed.toLowerCase() : trimmed;

    // Additional safety: limit individual role string length
    return normalized.length > 100 ? normalized.slice(0, 100) : normalized;
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

  private groupToRole(
    group: string,
    opts: Required<TokenMapperOptions>,
  ): string {
    if (!opts.transformGroupPaths) {
      // Default behavior: just strip leading slash
      return group.startsWith('/') ? group.slice(1) : group;
    }

    // Enhanced path transformation: /tenant/admin → tenant:admin
    if (group.startsWith('/')) {
      const pathParts = group.slice(1).split('/');
      if (pathParts.length > 1) {
        return pathParts.join(':');
      }
      return pathParts[0] || group;
    }

    return group;
  }

  private normalizeGroups(groups: string[], maxCount: number): string[] {
    const normalized = groups.map((g) => (g.startsWith('/') ? g.slice(1) : g));
    const unique = Array.from(new Set(normalized));
    const sorted = unique.sort();

    // Cap array size to prevent pathological tokens
    return sorted.slice(0, maxCount);
  }
}
