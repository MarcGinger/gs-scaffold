import { createParamDecorator, ExecutionContext } from '@nestjs/common';
// import { GqlExecutionContext } from '@nestjs/graphql'; // if using GraphQL
import { IUserToken } from '../types/user-token.interface';
import { AuthErrors } from '../errors/auth.errors';

type RequestLike = { user?: IUserToken };

/**
 * Central place to resolve the "request" object from different execution contexts
 * Supports HTTP, GraphQL, and WebSocket contexts (future-proofing)
 */
function getRequest(ctx: ExecutionContext): RequestLike {
  if (ctx.getType() === 'http') {
    return ctx.switchToHttp().getRequest<RequestLike>();
  }

  // If using GraphQL, uncomment:
  // if (ctx.getType<'graphql'>() === 'graphql') {
  //   const gql = GqlExecutionContext.create(ctx);
  //   return gql.getContext().req;
  // }

  // If using WebSockets, adapt to your gateway/adapter:
  // if (ctx.getType() === 'ws') {
  //   return (ctx.switchToWs().getClient() as any)?.handshake ?? {};
  // }

  return {};
}

/**
 * Extract the current authenticated user from the request
 * Throws AuthErrors.userNotFound() if no user is present
 */
export const CurrentUser = createParamDecorator(
  (data: keyof IUserToken | undefined, ctx: ExecutionContext) => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    return data ? user[data] : user;
  },
);

/**
 * Optional variant: returns undefined instead of throwing when no user is present
 * Useful for handlers that can work both authenticated and unauthenticated
 */
export const CurrentUserOptional = createParamDecorator(
  (data: keyof IUserToken | undefined, ctx: ExecutionContext) => {
    const { user } = getRequest(ctx);
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

/**
 * Extract the current user ID (sub claim)
 * Throws AuthErrors.userNotFound() if no user, AuthErrors.userIdMissing() if no sub
 */
export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    if (!user.sub) throw AuthErrors.userIdMissing();
    return user.sub;
  },
);

/**
 * Extract the current user's tenant information
 * Returns undefined if no tenant (allows for single-tenant scenarios)
 */
export const CurrentUserTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    return user.tenant;
  },
);

/**
 * Extract user roles - strict variant that requires roles to be present
 * Throws AuthErrors.rolesMissing() if roles array is missing or empty
 * Use this when your application contract requires all authenticated users to have roles
 */
export const CurrentUserRoles = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string[] => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    if (!user.roles || user.roles.length === 0) {
      throw AuthErrors.rolesMissing();
    }
    return user.roles;
  },
);

/**
 * Extract user roles - permissive variant that defaults to empty array
 * Returns [] if roles are missing, never throws for missing roles
 * Use this for routes that can handle users without specific roles
 */
export const CurrentUserRolesOptional = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string[] => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    return user.roles ?? [];
  },
);

/**
 * Extract user permissions - strict variant
 * Throws AuthErrors.rolesMissing() if permissions are required but missing
 */
export const CurrentUserPermissions = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string[] => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    if (!user.permissions || user.permissions.length === 0) {
      throw AuthErrors.rolesMissing(); // Using rolesMissing for permissions too
    }
    return user.permissions;
  },
);

/**
 * Extract user permissions - permissive variant
 * Returns [] if permissions are missing
 */
export const CurrentUserPermissionsOptional = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string[] => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    return user.permissions ?? [];
  },
);

/**
 * Extract user groups - permissive variant (groups are often optional)
 */
export const CurrentUserGroups = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string[] => {
    const { user } = getRequest(ctx);
    if (!user) throw AuthErrors.userNotFound();
    return user.groups ?? [];
  },
);
