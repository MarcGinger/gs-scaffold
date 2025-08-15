import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IUserToken } from '../types/user-token.interface';
import { AuthErrors } from '../errors/auth.errors';

// Public decorator to skip auth
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Add custom logic here if needed (e.g., route-based checks)
    return super.canActivate(context);
  }

  // If you use GraphQL/WS, uncomment and adapt accordingly:
  // getRequest(context: ExecutionContext) {
  //   // HTTP
  //   if (context.getType() === 'http') {
  //     return context.switchToHttp().getRequest();
  //   }
  //   // GraphQL (Apollo)
  //   if (context.getType<GqlContextType>() === 'graphql') {
  //     const gqlCtx = GqlExecutionContext.create(context);
  //     return gqlCtx.getContext().req;
  //   }
  //   // WebSockets
  //   if (context.getType() === 'ws') {
  //     return context.switchToWs().getClient()?.handshake; // depending on your adapter
  //   }
  // }

  handleRequest<TUser = IUserToken>(
    err: unknown,
    user: TUser,
    info?: Record<string, unknown>,
  ): TUser {
    // Handle authentication errors properly
    if (err) {
      const errorMessage = this.extractErrorMessage(err);
      throw err instanceof UnauthorizedException
        ? err
        : AuthErrors.authenticationFailed(errorMessage);
    }

    if (!user) {
      // Map common JWT errors to clearer messages using AuthErrors
      const reason = this.extractReasonFromInfo(info);

      // Handle different types of authentication failures with specific error codes
      if (
        info?.name === 'TokenExpiredError' ||
        (typeof reason === 'string' && reason.toLowerCase().includes('expired'))
      ) {
        throw AuthErrors.tokenExpired();
      }

      if (
        info?.name === 'JsonWebTokenError' ||
        (typeof reason === 'string' &&
          reason.toLowerCase().includes('invalid signature'))
      ) {
        throw AuthErrors.tokenInvalid();
      }

      if (info?.name === 'NotBeforeError') {
        throw AuthErrors.tokenNotActive();
      }

      if (
        typeof reason === 'string' &&
        reason.toLowerCase().includes('jwt malformed')
      ) {
        throw AuthErrors.tokenMalformed();
      }

      if (
        typeof reason === 'string' &&
        reason.toLowerCase().includes('audience')
      ) {
        throw AuthErrors.tokenAudienceInvalid();
      }

      if (
        typeof reason === 'string' &&
        reason.toLowerCase().includes('issuer')
      ) {
        throw AuthErrors.tokenIssuerInvalid();
      }

      if (typeof info?.message === 'string') {
        throw AuthErrors.authenticationFailed(info.message);
      }

      // Default case when no token is provided or other failures
      throw AuthErrors.tokenMissing();
    }

    return user;
  }

  /**
   * Safely extract error message from unknown error type
   */
  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === 'string') {
      return err;
    }
    if (
      err &&
      typeof err === 'object' &&
      'message' in err &&
      typeof err.message === 'string'
    ) {
      return err.message;
    }
    return 'Authentication failed';
  }

  /**
   * Safely extract reason from JWT info object
   */
  private extractReasonFromInfo(
    info?: Record<string, unknown>,
  ): string | undefined {
    if (!info) return undefined;

    if (typeof info.message === 'string') {
      return info.message;
    }

    if (typeof info.name === 'string') {
      return info.name;
    }

    if (typeof info === 'string') {
      return info;
    }

    return undefined;
  }
}
