import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IUserToken } from '../types/user-token.interface';

interface RequestWithUser {
  user: IUserToken;
}

export const CurrentUser = createParamDecorator(
  (data: keyof IUserToken | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new Error('User not found in request context');
    }

    return data ? user[data] : user;
  },
);

// Convenience decorators for common user properties
export const CurrentUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return user?.sub || '';
  },
);

export const CurrentUserTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return user?.tenant;
  },
);

export const CurrentUserRoles = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return user?.roles || [];
  },
);
