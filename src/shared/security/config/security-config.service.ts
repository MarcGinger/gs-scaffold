import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigManager } from '../../config/config.manager';

interface SecurityConfig {
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
    clientSecret?: string;
  };
  jwt: {
    audience: string;
    issuer: string;
    cacheMaxAge: number;
    requestsPerMinute: number;
    timeoutMs: number;
  };
  cors: {
    allowedOrigins: string[];
    allowCredentials: boolean;
  };
}

@Injectable()
export class SecurityConfigService {
  private readonly configManager: ConfigManager;

  constructor(private readonly configService: ConfigService) {
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Get validated security configuration
   * Combines NestJS config injection with ConfigManager validation
   */
  getValidatedConfig(): SecurityConfig {
    const validation = this.configManager.validateSecurityConfig();
    
    if (!validation.valid) {
      throw new Error(
        `Security configuration validation failed: ${validation.errors.join(', ')}`,
      );
    }

    // Use ConfigManager as source of truth for validated config
    return this.configManager.getSecurityConfig();
  }

  /**
   * Get JWT-specific configuration with validation
   */
  getValidatedJwtConfig() {
    const config = this.getValidatedConfig();
    return config.jwt;
  }

  /**
   * Get Keycloak-specific configuration with validation
   */
  getValidatedKeycloakConfig() {
    const config = this.getValidatedConfig();
    return config.keycloak;
  }

  /**
   * Get CORS configuration with validation
   */
  getValidatedCorsConfig() {
    const config = this.getValidatedConfig();
    return config.cors;
  }

  /**
   * Validate configuration without throwing errors
   * Returns validation result for conditional logic
   */
  validateConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
    return this.configManager.validateSecurityConfig();
  }

  /**
   * Get JWKS URI for JWT verification
   */
  getJwksUri(): string {
    const keycloakConfig = this.getValidatedKeycloakConfig();
    return `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/certs`;
  }

  /**
   * Get issuer URL for JWT validation
   */
  getIssuerUrl(): string {
    const keycloakConfig = this.getValidatedKeycloakConfig();
    return `${keycloakConfig.url}/realms/${keycloakConfig.realm}`;
  }

  /**
   * Check if running in production mode
   */
  isProduction(): boolean {
    return this.configManager.isProduction();
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary() {
    const config = this.getValidatedConfig();
    return {
      environment: this.configManager.getEnvironment(),
      keycloak: {
        url: config.keycloak.url,
        realm: config.keycloak.realm,
        clientId: config.keycloak.clientId,
        hasClientSecret: !!config.keycloak.clientSecret,
      },
      jwt: {
        audience: config.jwt.audience,
        issuer: config.jwt.issuer,
        cacheMaxAge: config.jwt.cacheMaxAge,
        requestsPerMinute: config.jwt.requestsPerMinute,
        timeoutMs: config.jwt.timeoutMs,
      },
      cors: {
        allowedOrigins: config.cors.allowedOrigins,
        allowCredentials: config.cors.allowCredentials,
      },
    };
  }
}
