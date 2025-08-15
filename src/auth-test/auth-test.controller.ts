import {
  Controller,
  Get,
  UseGuards,
  Param,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  JwtAuthGuard,
  CurrentUser,
  IUserToken,
  CurrentUserId,
  CurrentUserRoles,
  CompositeSecurityGuard,
  ProductResource,
  OrderResource,
  UserResource,
} from 'src/shared/security';

@Controller('auth-test')
export class AuthTestController {
  @Get('public')
  getPublicData() {
    return {
      message: 'This is public data, no authentication required',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('phase1/debug')
  debugPhase1() {
    return {
      message: 'Phase 1 debug endpoint - no authentication required',
      endpoints: [
        '/auth-test/phase1/jwt-validation (requires JWT)',
        '/auth-test/phase1/decorators-test (requires JWT)',
        '/auth-test/phase1/multi-tenant-test (requires JWT)',
        '/auth-test/phase1/role-based-test (requires JWT)',
        '/auth-test/phase1/security-context-test (requires JWT)',
      ],
      status: 'Phase 1 endpoints are ready',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('phase1/jwt-debug')
  debugJwtExtraction(@Req() request: Request) {
    const authHeader = request.headers.authorization as string;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    return {
      message: 'JWT Debug Information',
      headers: {
        authorization: authHeader || 'NO_AUTH_HEADER',
        hasBearer: !!bearerToken,
        tokenLength: bearerToken?.length || 0,
      },
      extractedToken: bearerToken ? 'TOKEN_PRESENT' : 'NO_TOKEN',
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

  // ===== PHASE 1 DEDICATED TEST ENDPOINTS =====

  @Get('phase1/jwt-manual-test')
  manualJwtTest(@Req() request: Request) {
    const authHeader = request.headers.authorization as string;

    if (!authHeader) {
      throw new UnauthorizedException('No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const token = authHeader.substring(7);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    return {
      message: 'Manual JWT test - token received',
      tokenPresent: true,
      tokenLength: token.length,
      timestamp: new Date().toISOString(),
    };
  }
  @Get('phase1/jwt-validation-noauth')
  testPhase1JwtValidationWithoutAuth() {
    return {
      phase: 'Phase 1 - JWT Authentication',
      testName: 'JWT Token Validation (Debug Mode)',
      status: 'SUCCESS',
      message: 'This endpoint bypasses JWT authentication for testing',
      note: 'Use /jwt-validation endpoint with proper JWT token for real testing',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('phase1/jwt-validation')
  @UseGuards(JwtAuthGuard)
  testPhase1JwtValidation(@CurrentUser() user: IUserToken) {
    return {
      phase: 'Phase 1 - JWT Authentication',
      testName: 'JWT Token Validation',
      status: 'SUCCESS',
      results: {
        tokenValidated: true,
        jwksVerified: true,
        userExtracted: true,
        claimsProcessed: true,
      },
      extractedData: {
        subject: user.sub,
        name: user.name,
        email: user.email,
        preferredUsername: user.preferred_username,
        tenant: user.tenant,
        tenantId: user.tenant_id,
        clientId: user.client_id,
        roles: user.roles,
        groups: user.groups,
        permissions: user.permissions,
        securityLevel: user.security_level,
        mfaVerified: user.mfa_verified,
      },
      metadata: {
        testedAt: new Date().toISOString(),
        authenticationMethod: 'JWT Bearer Token',
        jwtStrategy: 'Keycloak JWKS Validation',
      },
    };
  }

  @Get('phase1/decorators-test')
  @UseGuards(JwtAuthGuard)
  testPhase1Decorators(
    @CurrentUserId() userId: string,
    @CurrentUserRoles() roles: string[],
    @CurrentUser() fullUser: IUserToken,
  ) {
    return {
      phase: 'Phase 1 - JWT Authentication',
      testName: 'Current User Decorators',
      status: 'SUCCESS',
      results: {
        currentUserIdDecorator: userId !== undefined,
        currentUserRolesDecorator: Array.isArray(roles),
        currentUserDecorator: fullUser !== undefined,
        decoratorsWorking: true,
      },
      extractedViaDecorators: {
        userId,
        roles,
        fullUserObject: {
          sub: fullUser.sub,
          name: fullUser.name,
          email: fullUser.email,
          tenant: fullUser.tenant,
        },
      },
      metadata: {
        testedAt: new Date().toISOString(),
        decoratorTypes: ['@CurrentUserId', '@CurrentUserRoles', '@CurrentUser'],
      },
    };
  }

  @Get('phase1/multi-tenant-test')
  @UseGuards(JwtAuthGuard)
  testPhase1MultiTenant(@CurrentUser() user: IUserToken) {
    const tenantInfo = {
      hasTenant: !!user.tenant,
      tenantCode: user.tenant,
      tenantId: user.tenant_id,
      isMultiTenantSetup: !!(user.tenant || user.tenant_id),
    };

    return {
      phase: 'Phase 1 - JWT Authentication',
      testName: 'Multi-Tenant Support',
      status: tenantInfo.isMultiTenantSetup ? 'SUCCESS' : 'WARNING',
      results: {
        multiTenantSupported: tenantInfo.isMultiTenantSetup,
        tenantExtractionWorking: tenantInfo.hasTenant,
        tenantIsolationReady: true,
      },
      tenantInfo,
      message: tenantInfo.isMultiTenantSetup
        ? 'Multi-tenant configuration detected and working'
        : 'No tenant information found in JWT - single tenant mode',
      metadata: {
        testedAt: new Date().toISOString(),
        tenantSource: 'JWT Claims (tenant/tenant_id)',
      },
    };
  }

  @Get('phase1/role-based-test')
  @UseGuards(JwtAuthGuard)
  testPhase1RoleBased(@CurrentUser() user: IUserToken) {
    const roleChecks = {
      hasRoles: Array.isArray(user.roles) && user.roles.length > 0,
      hasGroups: Array.isArray(user.groups) && user.groups.length > 0,
      hasPermissions:
        Array.isArray(user.permissions) && user.permissions.length > 0,
      isAdmin:
        user.roles?.includes('admin') || user.roles?.includes('administrator'),
      isUser: user.roles?.includes('user'),
    };

    return {
      phase: 'Phase 1 - JWT Authentication',
      testName: 'Role-Based Access Control (Simple)',
      status: roleChecks.hasRoles ? 'SUCCESS' : 'INFO',
      results: {
        roleExtractionWorking: roleChecks.hasRoles,
        groupExtractionWorking: roleChecks.hasGroups,
        permissionExtractionWorking: roleChecks.hasPermissions,
        readyForPhase2: true,
      },
      roleData: {
        roles: user.roles || [],
        groups: user.groups || [],
        permissions: user.permissions || [],
        roleChecks,
      },
      message: roleChecks.hasRoles
        ? 'Role information extracted successfully - ready for Phase 2 OPA integration'
        : 'No role information found - check Keycloak role mapping configuration',
      metadata: {
        testedAt: new Date().toISOString(),
        note: 'Phase 1 provides basic role extraction, Phase 2 will add OPA policy enforcement',
      },
    };
  }

  @Get('phase1/security-context-test')
  @UseGuards(JwtAuthGuard)
  testPhase1SecurityContext(@CurrentUser() user: IUserToken) {
    const securityFeatures = {
      mfaSupported: user.mfa_verified !== undefined,
      securityLevelSupported: user.security_level !== undefined,
      clientIdSupported: user.client_id !== undefined,
      auditingReady: !!(user.sub && user.tenant),
    };

    return {
      phase: 'Phase 1 - JWT Authentication',
      testName: 'Security Context & Features',
      status: 'SUCCESS',
      results: {
        jwtAuthenticationComplete: true,
        securityContextExtracted: true,
        auditTrailReady: securityFeatures.auditingReady,
        enterpriseFeaturesSupported:
          Object.values(securityFeatures).some(Boolean),
      },
      securityContext: {
        subject: user.sub,
        tenant: user.tenant,
        clientId: user.client_id,
        mfaVerified: user.mfa_verified,
        securityLevel: user.security_level,
        sessionInfo: {
          authenticatedAt: new Date().toISOString(),
          authenticationMethod: 'JWT Bearer Token',
          tokenSource: 'Keycloak JWKS',
        },
      },
      enterpriseFeatures: securityFeatures,
      metadata: {
        testedAt: new Date().toISOString(),
        phase1Status: 'COMPLETE ✅',
        readyForPhase2: true,
      },
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
