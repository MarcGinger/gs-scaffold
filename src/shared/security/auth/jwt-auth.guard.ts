import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Add custom logic here if needed (e.g., skip authentication for certain routes)
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
  ): TUser {
    // Handle authentication errors properly
    if (err) {
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('Authentication failed');
    }

    if (!user) {
      // Handle different types of authentication failures
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }
      if (info?.name === 'NotBeforeError') {
        throw new UnauthorizedException('Token not active');
      }
      if (info?.message) {
        throw new UnauthorizedException(info.message);
      }
      // Default case when no token is provided
      throw new UnauthorizedException('No valid token provided');
    }

    return user;
  }
}
