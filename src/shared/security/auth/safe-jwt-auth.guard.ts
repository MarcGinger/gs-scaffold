import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthErrors } from '../errors/auth.errors';

/**
 * Secure JWT Auth Guard with header preflight validation
 *
 * This guard:
 * 1. Validates Authorization header format for early, friendly errors
 * 2. Delegates to Passport JwtStrategy for proper signature verification
 * 3. Uses JWKS validation with your improved JWT strategy
 *
 * This replaces the previous insecure version that parsed tokens without verification.
 */
@Injectable()
export class SafeJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(ctx: ExecutionContext) {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers?: { authorization?: string } }>();
    const auth = req.headers?.authorization;

    // Header preflight validation for friendly error messages
    if (!auth) throw AuthErrors.missingAuthorizationHeader();
    if (!auth.startsWith('Bearer '))
      throw AuthErrors.invalidAuthorizationHeader();

    const token = auth.slice(7);
    if (!token) throw AuthErrors.missingToken();

    // Delegate to Passport JwtStrategy for proper signature verification
    return super.canActivate(ctx);
  }
}
