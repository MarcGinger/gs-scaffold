import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpaClient } from './opa.client';
import { RESOURCE_KEY, ResourceOptions } from './resource.decorator';
import { IUserToken } from '../types/user-token.interface';
import { OpaInput } from './opa.types';
import { AuthErrors } from '../errors/auth.errors';

interface RequestWithUser {
  user: IUserToken;
  ip?: string;
  url?: string;
  method?: string;
  headers: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
  query?: any;
}

@Injectable()
export class OpaGuard implements CanActivate {
  private readonly logger = new Logger(OpaGuard.name);

  constructor(
    private readonly opaClient: OpaClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resourceOptions = this.reflector.get<ResourceOptions>(
      RESOURCE_KEY,
      context.getHandler(),
    );

    if (!resourceOptions) {
      // No resource metadata, allow access (authentication only)
      this.logger.debug('No resource metadata found, allowing access');
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const correlationId = this.extractCorrelationId(request);
    const authContext = {
      correlationId,
      userId: user.sub,
      tenantId: user.tenant,
      resource: resourceOptions.type,
      action: resourceOptions.action,
      timestamp: new Date().toISOString(),
    };

    try {
      // Build OPA input
      const opaInput = this.buildOpaInput(user, resourceOptions, request);

      // Evaluate policy with correlation context
      const decision = await this.opaClient.evaluate(
        'authz.decisions.allow',
        opaInput,
        {
          correlationId,
          tenantId: user.tenant,
          userId: user.sub,
        },
      );

      if (!decision.allow) {
        // Enhanced structured logging
        this.logger.warn(`Access denied by authorization policy`, {
          ...authContext,
          reason_code: decision.reason_code || 'DENY',
          reason: decision.reason || 'Policy violation',
          policy_version: decision.policy_version,
          policy_timestamp: decision.policy_timestamp,
        });

        // Use enhanced error with machine-readable code
        const errorMessage = decision.reason || 'Access denied by policy';
        const forbiddenError = new ForbiddenException({
          message: errorMessage,
          error: 'Forbidden',
          statusCode: 403,
          details: {
            reason_code: decision.reason_code || 'AUTHZ_DENY',
            policy_version: decision.policy_version,
            correlationId,
            timestamp: new Date().toISOString(),
          },
        });

        throw forbiddenError;
      }

      // Log successful authorization with context
      this.logger.debug(`Access granted by authorization policy`, {
        ...authContext,
        reason_code: decision.reason_code || 'ALLOW',
        policy_version: decision.policy_version,
        policy_timestamp: decision.policy_timestamp,
      });

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // Enhanced error logging with full context
      this.logger.error('OPA authorization service error', {
        ...authContext,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return structured error response
      throw AuthErrors.authorizationServiceError();
    }
  }

  private buildOpaInput(
    user: IUserToken,
    resourceOptions: ResourceOptions,
    request: RequestWithUser,
  ): OpaInput {
    // Extract resource information
    const resourceId = resourceOptions.extractId?.(request);
    const resourceAttributes =
      resourceOptions.extractAttributes?.(request) || {};

    const correlationId = this.extractCorrelationId(request);

    return {
      subject: {
        id: user.sub,
        tenant: user.tenant,
        roles: user.roles,
        client_id: user.client_id,
        permissions: user.permissions || [],
      },
      action: {
        type: 'http',
        name: resourceOptions.action,
      },
      resource: {
        type: resourceOptions.type,
        tenant: user.tenant,
        id: resourceId,
        attributes: resourceAttributes,
      },
      context: {
        correlationId,
        time: new Date().toISOString(), // ISO 8601 UTC timestamp
        environment: process.env.NODE_ENV || 'development',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        metadata: {
          requestPath: request.url,
          method: request.method,
          userAgent: request.headers['user-agent'],
        },
      },
    };
  }

  private extractCorrelationId(request: RequestWithUser): string {
    return (
      request.headers['x-correlation-id'] ||
      request.headers['x-request-id'] ||
      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
  }
}
