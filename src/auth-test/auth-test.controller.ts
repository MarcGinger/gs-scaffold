import { Controller, Get, UseGuards, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../security/auth/jwt-auth.guard';
import { CompositeSecurityGuard } from '../security/guards/composite-security.guard';
import {
  ProductResource,
  OrderResource,
  UserResource,
} from '../security/opa/resource.decorator';
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

  // New OPA-protected endpoints
  @Get('products/:id')
  @UseGuards(CompositeSecurityGuard)
  @ProductResource('view')
  getProduct(@Param('id') id: string, @CurrentUser() user: IUserToken) {
    return {
      message: 'Product data (OPA authorized)',
      productId: id,
      user: user.sub,
      tenant: user.tenant,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('orders/:id')
  @UseGuards(CompositeSecurityGuard)
  @OrderResource('view')
  getOrder(@Param('id') id: string, @CurrentUser() user: IUserToken) {
    return {
      message: 'Order data (OPA authorized)',
      orderId: id,
      user: user.sub,
      tenant: user.tenant,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('users/:id')
  @UseGuards(CompositeSecurityGuard)
  @UserResource('view')
  getUser(@Param('id') id: string, @CurrentUser() user: IUserToken) {
    return {
      message: 'User data (OPA authorized)',
      userId: id,
      requestedBy: user.sub,
      tenant: user.tenant,
      timestamp: new Date().toISOString(),
    };
  }
}
