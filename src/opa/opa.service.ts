import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

export interface OpaRequest {
  input: {
    user: {
      sub: string;
      roles: string[];
      groups?: string[];
      tenant?: string;
      client_id?: string;
    };
    resource: {
      path: string;
      method: string;
      service?: string;
    };
    action?: string;
    tenant?: string;
  };
}

export interface OpaResponse {
  result: {
    allow: boolean;
    reason?: string;
    required_roles?: string[];
  };
}

@Injectable()
export class OpaService {
  private readonly logger = new Logger(OpaService.name);
  private readonly opaUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.opaUrl = this.configService.get<string>(
      'OPA_URL',
      'http://localhost:8181',
    );
  }

  async authorize(request: OpaRequest): Promise<OpaResponse> {
    try {
      this.logger.debug(
        `OPA Authorization Request: ${JSON.stringify(request, null, 2)}`,
      );

      const response = await firstValueFrom(
        this.httpService.post<OpaResponse>(
          `${this.opaUrl}/v1/data/authz/allow`,
          request,
        ),
      );

      this.logger.debug(
        `OPA Authorization Response: ${JSON.stringify(response.data, null, 2)}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `OPA authorization failed: ${error.message}`,
        error.stack,
      );
      // Fail secure - deny access if OPA is unreachable
      return {
        result: {
          allow: false,
          reason: 'Authorization service unavailable',
        },
      };
    }
  }

  async checkApiAccess(
    user: any,
    path: string,
    method: string,
  ): Promise<boolean> {
    const request: OpaRequest = {
      input: {
        user: {
          sub: user.sub,
          roles: user.roles || [],
          groups: user.groups || [],
          tenant: user.tenant,
          client_id: user.client_id,
        },
        resource: {
          path,
          method: method.toUpperCase(),
        },
      },
    };

    const response = await this.authorize(request);
    return response.result.allow;
  }

  async checkRoleBasedAccess(
    user: any,
    requiredRoles: string[],
  ): Promise<boolean> {
    const request: OpaRequest = {
      input: {
        user: {
          sub: user.sub,
          roles: user.roles || [],
          groups: user.groups || [],
          tenant: user.tenant,
          client_id: user.client_id,
        },
        resource: {
          path: '/rbac/check',
          method: 'POST',
        },
        action: 'role_check',
      },
    };

    const response = await this.authorize(request);
    return response.result.allow;
  }
}
