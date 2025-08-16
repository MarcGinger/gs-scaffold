/**
 * Application Configuration Utilities
 *
 * Central utilities for environment configuration and deployment context detection.
 * This provides common configuration patterns used across the application.
 */
export class AppConfigUtil {
  /**
   * Determine if the application is running in production environment
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Determine if the application is running in development environment
   */
  static isDevelopment(): boolean {
    return !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  }

  /**
   * Determine if the application is running in staging environment
   */
  static isStaging(): boolean {
    return process.env.NODE_ENV === 'staging';
  }

  /**
   * Get the current environment name
   */
  static getEnvironment(): string {
    return process.env.NODE_ENV || 'development';
  }

  /**
   * Determine the appropriate host based on environment variables and deployment context
   */
  static getHost(): string {
    // Environment-specific host detection with priority order
    if (process.env.HOST) {
      return process.env.HOST;
    }

    // Container/Cloud environments
    if (process.env.HOSTNAME) {
      return process.env.HOSTNAME;
    }

    // Kubernetes service discovery
    if (process.env.KUBERNETES_SERVICE_HOST) {
      return process.env.KUBERNETES_SERVICE_HOST;
    }

    // Docker container hostname
    if (process.env.CONTAINER_HOST) {
      return process.env.CONTAINER_HOST;
    }

    // Default fallback
    return 'localhost';
  }

  /**
   * Determine the appropriate protocol based on environment
   */
  static getProtocol(): string {
    // Production typically uses HTTPS
    if (AppConfigUtil.isProduction()) {
      return process.env.PROTOCOL || 'https';
    }

    // Development/staging defaults to HTTP unless specified
    return process.env.PROTOCOL || 'http';
  }

  /**
   * Get the application port with fallback
   */
  static getPort(fallback: string | number = '80'): string {
    return process.env.PORT || String(fallback);
  }

  /**
   * Build a complete URL from protocol, host, and port
   */
  static buildUrl(port?: string | number, path?: string): string {
    const protocol = AppConfigUtil.getProtocol();
    const host = AppConfigUtil.getHost();
    const actualPort = port || AppConfigUtil.getPort();

    // For production with load balancers, check for public URL override
    if (AppConfigUtil.isProduction() && process.env.PUBLIC_API_URL) {
      const baseUrl = process.env.PUBLIC_API_URL;
      return path ? `${baseUrl}/${path.replace(/^\//, '')}` : baseUrl;
    }

    // Build URL with port (omit port 80 for HTTP and port 443 for HTTPS in production)
    let url = `${protocol}://${host}`;

    if (
      actualPort &&
      !(
        (protocol === 'http' && actualPort === '80') ||
        (protocol === 'https' && actualPort === '443')
      )
    ) {
      url += `:${actualPort}`;
    }

    return path ? `${url}/${path.replace(/^\//, '')}` : url;
  }

  /**
   * Check if running in a containerized environment
   */
  static isContainerized(): boolean {
    return !!(
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.CONTAINER_HOST ||
      process.env.HOSTNAME ||
      process.env.DOCKER_CONTAINER
    );
  }

  /**
   * Get database configuration with environment-aware defaults
   */
  static getDatabaseConfig() {
    return {
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'postgres',
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || '',
    };
  }

  /**
   * Get log level configuration
   */
  static getLogLevel(): string[] {
    const level = process.env.LOGGER_LEVEL;
    return level ? level.split(',') : [];
  }

  /**
   * Get multiple server configurations for different environments
   * This is useful for APIs that need to expose multiple endpoint options
   */
  static getServerConfigurations(port?: string | number): Array<{
    url: string;
    description: string;
  }> {
    const servers: Array<{ url: string; description: string }> = [];
    const actualPort = port || AppConfigUtil.getPort();

    // Always include the current environment server
    servers.push({
      url: AppConfigUtil.buildUrl(actualPort),
      description: `${AppConfigUtil.getEnvironment()} server`,
    });

    // Add additional servers based on environment
    if (!AppConfigUtil.isProduction()) {
      // Development servers - add localhost if not already the primary
      const localhostUrl = `http://localhost:${actualPort}`;
      if (AppConfigUtil.buildUrl(actualPort) !== localhostUrl) {
        servers.push({
          url: localhostUrl,
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
}
