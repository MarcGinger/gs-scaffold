import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { SafeJwtAuthGuard } from '../shared/security/auth/safe-jwt-auth.guard';
import { OpaService } from './opa.service';
import { CurrentUser } from '../shared/security/auth/current-user.decorator';

@Controller('opa-test')
@UseGuards(SafeJwtAuthGuard)
export class OpaController {
  constructor(private readonly opaService: OpaService) {}

  @Get('admin/users')
  async getAdminUsers(@CurrentUser() user: any, @Req() req: Request) {
    const authorized = await this.opaService.checkApiAccess(
      user,
      '/admin/users',
      'GET',
    );

    if (!authorized) {
      return {
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
        statusCode: 403,
      };
    }

    return {
      message: 'Admin users endpoint',
      user: user,
      users: [
        { id: 1, name: 'Admin User 1', role: 'admin' },
        { id: 2, name: 'Admin User 2', role: 'admin' },
      ],
    };
  }

  @Get('public/info')
  async getPublicInfo(@CurrentUser() user: any) {
    const authorized = await this.opaService.checkApiAccess(
      user,
      '/public/info',
      'GET',
    );

    return {
      message: 'Public information',
      authorized: authorized,
      user: user,
      info: {
        version: '1.0.0',
        status: 'operational',
      },
    };
  }

  @Post('role-check')
  async checkRoles(@CurrentUser() user: any) {
    const hasAdminRole = await this.opaService.checkRoleBasedAccess(user, [
      'admin',
    ]);

    const hasUserRole = await this.opaService.checkRoleBasedAccess(user, [
      'user',
    ]);

    return {
      message: 'Role check results',
      user: user,
      permissions: {
        hasAdminRole,
        hasUserRole,
        userRoles: user.roles || [],
      },
    };
  }

  @Get('debug/user')
  async debugUser(@CurrentUser() user: any) {
    return {
      message: 'Debug user information',
      user: user,
      userKeys: Object.keys(user || {}),
    };
  }
}
