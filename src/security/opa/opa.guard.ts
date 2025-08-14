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

interface RequestWithUser {
  user: IUserToken;
  ip?: string;
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

    try {
      // Build OPA input
      const opaInput = this.buildOpaInput(user, resourceOptions, request);

      // Evaluate policy
      const decision = await this.opaClient.evaluate(
        'authz.decisions.allow',
        opaInput,
      );

      if (!decision.allow) {
        this.logger.warn(
          `Access denied for user ${user.sub}: ${decision.reason || 'Policy violation'}`,
        );
        throw new ForbiddenException(
          decision.reason || 'Access denied by policy',
        );
      }

      this.logger.debug(`Access granted for user ${user.sub}`);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error('OPA authorization error', error);
      throw new ForbiddenException('Authorization service error');
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
        correlationId: this.extractCorrelationId(request),
        time: new Date().toISOString(),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
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
