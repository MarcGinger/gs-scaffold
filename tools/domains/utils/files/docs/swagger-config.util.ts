import { DocumentBuilder } from '@nestjs/swagger';
import { AppConfigUtil } from '../shared/config/app-config.util';

/**
 * Swagger Configuration Utilities
 *
 * Specialized utilities for Swagger server configuration, extending base application configuration
 */
export class SwaggerConfigUtil extends AppConfigUtil {
  /**
   * Dynamically determine the server URL for Swagger documentation
   * with Swagger-specific environment variable overrides
   */
  static getServerUrl(port: string | number): string {
    // Allow Swagger-specific protocol override
    const protocol = process.env.SWAGGER_PROTOCOL || super.getProtocol();

    // Allow Swagger-specific host override
    const host = process.env.SWAGGER_HOST || super.getHost();

    // For production environments with load balancers or reverse proxies
    if (super.isProduction()) {
      // Priority: PUBLIC_API_URL > computed URL
      return process.env.PUBLIC_API_URL || `${protocol}://${host}:${port}`;
    }

    // For development and staging
    return `${protocol}://${host}:${port}`;
  }

  /**
   * Get multiple server configurations for Swagger documentation
   */
  static getServerConfigurations(
    port: string | number,
  ): Array<{ url: string; description: string }> {
    const servers: Array<{ url: string; description: string }> = [];

    // Always include the current environment server
    servers.push({
      url: SwaggerConfigUtil.getServerUrl(port),
      description: `${super.getEnvironment()} server`,
    });

    // Add additional servers based on environment
    if (!super.isProduction()) {
      // Development servers
      if (SwaggerConfigUtil.getServerUrl(port) !== `http://localhost:${port}`) {
        servers.push({
          url: `http://localhost:${port}`,
          description: 'Local development server',
        });
      }

      // Staging server (if configured)
      if (process.env.STAGING_API_URL) {
        servers.push({
          url: process.env.STAGING_API_URL,
          description: 'Staging server',
        });
      }
    }

    return servers;
  }

  /**
   * Apply server configurations to DocumentBuilder
   */
  static addServers(
    builder: DocumentBuilder,
    port: string | number,
  ): DocumentBuilder {
    const servers = SwaggerConfigUtil.getServerConfigurations(port);

    servers.forEach((server) => {
      builder.addServer(server.url, server.description);
    });

    return builder;
  }
}
