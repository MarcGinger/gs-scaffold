import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../security/auth/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserId,
  CurrentUserRoles,
} from '../security/auth/current-user.decorator';
import { IUserToken } from '../security/types/user-token.interface';

@Controller('auth-test')
export class AuthTestController {
  @Get('public')
  getPublicData() {
    return {
      message: 'This is public data, no authentication required',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('protected')
  @UseGuards(JwtAuthGuard)
  getProtectedData(@CurrentUser() user: IUserToken) {
    return {
      message: 'This is protected data, authentication required',
      user: {
        id: user.sub,
        name: user.name,
        email: user.email,
        tenant: user.tenant,
        roles: user.roles,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getUserProfile(
    @CurrentUserId() userId: string,
    @CurrentUserRoles() roles: string[],
    @CurrentUser() user: IUserToken,
  ) {
    return {
      userId,
      roles,
      profile: {
        name: user.name,
        email: user.email,
        preferredUsername: user.preferred_username,
        tenant: user.tenant,
        securityLevel: user.security_level,
        mfaVerified: user.mfa_verified,
      },
      permissions: user.permissions,
      groups: user.groups,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard)
  getAdminData(@CurrentUser() user: IUserToken) {
    // Simple role check (in Phase 2, we'll use OPA for this)
    if (!user.roles.includes('admin')) {
      return {
        error: 'Forbidden',
        message: 'Admin role required',
        userRoles: user.roles,
      };
    }

    return {
      message: 'This is admin-only data',
      adminData: {
        systemInfo: 'Only admins can see this',
        userCount: 100,
        systemHealth: 'OK',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
