import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OpaGuard } from '../opa/opa.guard';

@Injectable()
export class CompositeSecurityGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly opaGuard: OpaGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, check JWT authentication
    const isAuthenticated = await this.jwtAuthGuard.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    // Then, check OPA authorization
    const isAuthorized = await this.opaGuard.canActivate(context);
    return isAuthorized;
  }
}

// Convenience decorator for applying security to endpoints
export const Secured = () => CompositeSecurityGuard;
