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
import { DecisionLoggerService } from '../audit/decision-logger.service';

type HeaderValue = string | string[] | undefined;

interface RequestWithUser {
  user?: IUserToken;
  ip?: string;
  url?: string;
  method?: string;
  headers: Record<string, HeaderValue>;
  params?: Record<string, string>;
  body?: unknown;
  query?: unknown;
}

@Injectable()
export class OpaGuard implements CanActivate {
  private readonly logger = new Logger(OpaGuard.name);

  constructor(
    private readonly opaClient: OpaClient,
    private readonly reflector: Reflector,
    private readonly decisionLogger: DecisionLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resourceOptions = this.reflector.getAllAndOverride<ResourceOptions>(
      RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No resource metadata → authN only
    if (!resourceOptions) {
      this.logger.debug('No resource metadata found, allowing access');
      return true;
    }

    const request = this.getRequest(context);
    const user = request.user;
    if (!user) {
      throw AuthErrors.userNotFound();
    }

    const correlationId = this.pickHeader(request, [
      'x-correlation-id',
      'x-request-id',
    ]);
    const ts = new Date().toISOString();

    const authContext = {
      correlationId,
      userId: user.sub,
      tenantId: user.tenant,
      resource: resourceOptions.type,
      action: resourceOptions.action,
      timestamp: ts,
    };

    try {
      const opaInput = await this.buildOpaInput(
        user,
        resourceOptions,
        request,
        ts,
        correlationId,
      );

      const decision = await this.opaClient.evaluate(
        'authz.decisions.allow',
        opaInput,
        { correlationId, tenantId: user.tenant, userId: user.sub },
      );

      // Log authorization decision for audit trail
      this.decisionLogger.logAuthorizationDecision(opaInput, decision, {
        correlationId,
        ipAddress: request.ip,
        userAgent: this.getHeader(request, 'user-agent') as string,
        emergency: !!opaInput.context.emergency_token,
      });

      if (!decision.allow) {
        this.logger.warn('Access denied by authorization policy', {
          ...authContext,
          reason_code: decision.reason_code ?? 'AUTHZ_DENY',
          reason: decision.reason ?? 'Policy violation',
          policy_version: decision.policy_version,
          policy_timestamp: decision.policy_timestamp,
        });

        throw new ForbiddenException({
          message: decision.reason ?? 'Access denied by policy',
          error: 'Forbidden',
          statusCode: 403,
          details: {
            reason_code: decision.reason_code ?? 'AUTHZ_DENY',
            policy_version: decision.policy_version,
            correlationId,
            timestamp: ts,
          },
        });
      }

      this.logger.debug('Access granted by authorization policy', {
        ...authContext,
        reason_code: decision.reason_code ?? 'ALLOW',
        policy_version: decision.policy_version,
        policy_timestamp: decision.policy_timestamp,
      });

      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;

      this.logger.error('OPA authorization service error', {
        ...authContext,
        error: err instanceof Error ? err.message : String(err),
      });

      throw AuthErrors.authorizationServiceError();
    }
  }

  // --- helpers ---

  private getRequest(context: ExecutionContext): RequestWithUser {
    // HTTP only for now; add GraphQL/WS if needed
    return context.switchToHttp().getRequest<RequestWithUser>();
  }

  private pickHeader(req: RequestWithUser, keys: string[]): string {
    for (const k of keys) {
      const v = req.headers[k.toLowerCase()];
      if (typeof v === 'string' && v) return v;
      if (Array.isArray(v) && v.length) return v[0];
    }
    // soft fallback; ideally set this in middleware, not here
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private getHeader(req: RequestWithUser, key: string): string | undefined {
    const v = req.headers[key.toLowerCase()];
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v[0];
    return undefined;
  }

  private async buildOpaInput(
    user: IUserToken,
    resourceOptions: ResourceOptions,
    request: RequestWithUser,
    tsIso: string,
    correlationId: string,
  ): Promise<OpaInput> {
    const resourceId = await Promise.resolve(
      resourceOptions.extractId?.(request),
    );
    const resourceAttributes =
      (await Promise.resolve(resourceOptions.extractAttributes?.(request))) ??
      {};

    return {
      subject: {
        id: user.sub,
        tenant: user.tenant,
        roles: user.roles ?? [],
        client_id: user.client_id,
        permissions: user.permissions ?? [],
      },
      action: {
        type: (request.method ?? 'GET').toUpperCase(),
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
        time: tsIso,
        environment: process.env.NODE_ENV || 'development',
        ipAddress: request.ip,
        userAgent: this.getHeader(request, 'user-agent'),
        metadata: {
          requestPath: request.url,
          method: request.method,
        },
        // Optional: pass through break-glass tokens if you use them
        // emergency_token: this.getHeader(request, 'x-emergency-token'),
        // approval_token: this.getHeader(request, 'x-approval-token'),
      },
    };
  }
}
