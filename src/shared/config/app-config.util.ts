/**
 * Application Configuration Utilities
 *
 * Central utilities for environment configuration and deployment context detection.
 */
export class AppConfigUtil {
  /** Normalized environment enumeration */
  static getEnvironment(): 'production' | 'staging' | 'development' | 'test' {
    const env = (process.env.NODE_ENV || 'development').toLowerCase();
    if (env === 'production') return 'production';
    if (env === 'staging') return 'staging';
    if (env === 'test') return 'test';
    return 'development';
  }

  static isProduction(): boolean {
    return this.getEnvironment() === 'production';
  }

  static isStaging(): boolean {
    return this.getEnvironment() === 'staging';
  }

  static isDevelopment(): boolean {
    return this.getEnvironment() === 'development';
  }

  static isTest(): boolean {
    return this.getEnvironment() === 'test';
  }

  /** Prefer explicit public URL for shareable/external addresses */
  static getPublicBaseUrl(): URL | null {
    const raw = process.env.PUBLIC_API_URL?.trim();
    if (!raw) return null;
    try {
      return new URL(raw);
    } catch {
      return null;
    }
  }

  /** Determine protocol (internal). For external links, prefer getPublicBaseUrl() */
  static getProtocol(): 'http' | 'https' {
    const val = (process.env.PROTOCOL || '').toLowerCase();
    if (val === 'http' || val === 'https') return val;
    return this.isProduction() ? 'https' : 'http';
  }

  /** Integer port with fallback */
  static getPort(fallback: number = 80): number {
    const fromEnv = Number(process.env.PORT);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : fallback;
  }

  /** Host detection: explicit HOST first, then container/k8s hints, then localhost */
  static getHost(): string {
    if (process.env.HOST?.trim()) return process.env.HOST.trim();

    // Kubernetes service discovery host usually indicates a cluster environment
    if (process.env.KUBERNETES_SERVICE_HOST?.trim())
      return process.env.KUBERNETES_SERVICE_HOST.trim();

    if (process.env.CONTAINER_HOST?.trim())
      return process.env.CONTAINER_HOST.trim();
    if (process.env.HOSTNAME?.trim()) return process.env.HOSTNAME.trim();

    return 'localhost';
  }

  /** Build a complete URL; prefers PUBLIC_API_URL when present in production */
  static buildUrl(port?: number, path?: string): string {
    const publicUrl = this.getPublicBaseUrl();
    if (publicUrl && this.isProduction()) {
      const url = new URL(publicUrl.toString());
      if (path) url.pathname = this.joinPath(url.pathname, path);
      return url.toString().replace(/\/$/, '');
    }

    const protocol = this.getProtocol();
    const host = this.getHost();
    const actualPort = typeof port === 'number' ? port : this.getPort();

    const url = new URL(`${protocol}://${host}`);
    // Omit default ports
    const isDefault =
      (protocol === 'http' && actualPort === 80) ||
      (protocol === 'https' && actualPort === 443);
    if (!isDefault) url.port = String(actualPort);
    if (path) url.pathname = this.joinPath(url.pathname, path);

    return url.toString().replace(/\/$/, '');
  }

  private static joinPath(base: string, extra: string): string {
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    const e = extra.startsWith('/') ? extra.slice(1) : extra;
    return `${b}/${e}`;
  }

  /** Best-effort containerized detection */
  static isContainerized(): boolean {
    try {
      const fs = require('fs');
      if (fs.existsSync('/.dockerenv')) return true;
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (cgroup && /(docker|kubepods|containerd)/i.test(cgroup)) return true;
    } catch {
      // ignore on non-linux hosts
    }
    return Boolean(
      process.env.KUBERNETES_SERVICE_HOST ||
        process.env.CONTAINER_HOST ||
        process.env.DOCKER_CONTAINER,
    );
  }

  /** Database configuration with sensible defaults */
  static getDatabaseConfig() {
    const port = Number(process.env.DATABASE_PORT || '5432');
    return {
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number.isFinite(port) ? port : 5432,
      database: process.env.DATABASE_NAME || 'postgres',
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      // Common extras
      ssl:
        process.env.DATABASE_SSL?.toLowerCase() === 'true'
          ? {
              rejectUnauthorized:
                process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
            }
          : undefined,
      pool: {
        min: Number(process.env.DATABASE_POOL_MIN || 0),
        max: Number(process.env.DATABASE_POOL_MAX || 10),
      },
      url: process.env.DATABASE_URL || undefined, // if using a single URL
    };
  }

  /** Logging level: single string with a safe default; supports multiple env keys */
  static getLogLevel(): string {
    const level =
      process.env.LOGGER_LEVEL ||
      process.env.LOG_LEVEL ||
      process.env.PINO_LOG_LEVEL ||
      '';
    const normalized = level.toLowerCase().trim();
    // Allow only known levels; default to info
    const allowed = new Set([
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ]);
    return allowed.has(normalized) ? normalized : 'info';
  }

  /** Get logging sink configuration for your production logging strategy */
  static getLogSink(): 'stdout' | 'console' | 'loki' | 'elasticsearch' {
    const sink = (process.env.LOG_SINK || '').toLowerCase().trim();
    const allowed = ['stdout', 'console', 'loki', 'elasticsearch'] as const;
    type LogSink = (typeof allowed)[number];
    return allowed.includes(sink as LogSink) ? (sink as LogSink) : 'stdout';
  }

  /** Get complete logging configuration for your centralized logging */
  static getLoggingConfig() {
    return {
      level: this.getLogLevel(),
      sink: this.getLogSink(),
      pretty: process.env.PRETTY_LOGS?.toLowerCase() === 'true',
      appName: process.env.APP_NAME || 'gs-scaffold',
      appVersion: process.env.APP_VERSION || '0.0.1',
      environment: this.getEnvironment(),
      // Loki configuration
      loki: {
        url: process.env.LOKI_URL,
        basicAuth: process.env.LOKI_BASIC_AUTH,
      },
      // Elasticsearch configuration
      elasticsearch: {
        node: process.env.ES_NODE,
        index: process.env.ES_INDEX || 'app-logs',
      },
    };
  }

  /** Validate logging configuration for production readiness */
  static validateLoggingConfig(): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const config = this.getLoggingConfig();

    // Production-specific validations
    if (this.isProduction()) {
      if (config.sink !== 'stdout') {
        warnings.push(
          `Production LOG_SINK is '${config.sink}', recommended: 'stdout' for better resilience`,
        );
      }

      if (config.pretty) {
        warnings.push(
          'PRETTY_LOGS=true in production will impact performance, set to false',
        );
      }

      if (config.level === 'debug') {
        errors.push(
          'LOG_LEVEL=debug in production will generate excessive logs and impact performance',
        );
      }

      if (!config.appName || config.appName === 'gs-scaffold') {
        errors.push(
          'APP_NAME environment variable should be set to a proper application name',
        );
      }

      if (!config.appVersion || config.appVersion === '0.0.1') {
        warnings.push(
          'APP_VERSION environment variable should be set to actual version',
        );
      }
    }

    // Sink-specific validations
    if (config.sink === 'loki' && !config.loki.url) {
      errors.push('LOKI_URL is required when LOG_SINK=loki');
    }

    if (config.sink === 'elasticsearch' && !config.elasticsearch.node) {
      errors.push('ES_NODE is required when LOG_SINK=elasticsearch');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /** Optional: derive external URL from a request when you trust the proxy */
  static buildUrlFromRequest(
    req: { headers?: Record<string, string | string[] | undefined> },
    path?: string,
  ): string {
    const publicUrl = this.getPublicBaseUrl();
    if (publicUrl) {
      const u = new URL(publicUrl.toString());
      if (path) u.pathname = this.joinPath(u.pathname, path);
      return u.toString().replace(/\/$/, '');
    }
    const xfProto = (req.headers?.['x-forwarded-proto'] || '') as string;
    const proto = (Array.isArray(xfProto) ? xfProto[0] : xfProto)
      .split(',')[0]
      ?.trim();
    const protocol = proto === 'https' ? 'https' : this.getProtocol();

    const xfHost = (req.headers?.['x-forwarded-host'] || '') as string;
    const hostHdr = (Array.isArray(xfHost) ? xfHost[0] : xfHost)
      .split(',')[0]
      ?.trim();

    const host = hostHdr || this.getHost();
    const xfPort = (req.headers?.['x-forwarded-port'] || '') as string;
    const port = Number(
      (Array.isArray(xfPort) ? xfPort[0] : xfPort).split(',')[0]?.trim(),
    );

    const url = new URL(`${protocol}://${host}`);
    const isDefault =
      (protocol === 'http' && port === 80) ||
      (protocol === 'https' && port === 443) ||
      !Number.isFinite(port);
    if (!isDefault) url.port = String(port);
    if (path) url.pathname = this.joinPath(url.pathname, path);
    return url.toString().replace(/\/$/, '');
  }

  /** Server list for docs/OpenAPI */
  static getServerConfigurations(
    port?: number,
  ): Array<{ url: string; description: string }> {
    const servers: Array<{ url: string; description: string }> = [];
    const currentUrl = this.buildUrl(port);
    servers.push({
      url: currentUrl,
      description: `${this.getEnvironment()} server`,
    });

    if (!this.isProduction()) {
      const actualPort = typeof port === 'number' ? port : this.getPort();
      const localUrl = new URL(`http://localhost`);
      if (actualPort !== 80) localUrl.port = String(actualPort);
      const localStr = localUrl.toString().replace(/\/$/, '');
      if (localStr !== currentUrl) {
        servers.push({
          url: localStr,
          description: 'Local development server',
        });
      }
      const staging = process.env.STAGING_API_URL?.trim();
      if (staging) {
        try {
          const s = new URL(staging).toString().replace(/\/$/, '');
          if (!servers.some((x) => x.url === s)) {
            servers.push({ url: s, description: 'Staging server' });
          }
        } catch {
          // ignore invalid URL
        }
      }
    }

    return servers;
  }

  /** Security Configuration */
  static getSecurityConfig() {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
    const realm = process.env.KEYCLOAK_REALM || 'gs-scaffold';
    
    return {
      keycloak: {
        url: keycloakUrl,
        realm: realm,
        clientId: process.env.KEYCLOAK_CLIENT_ID || 'gs-scaffold-api',
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      },
      jwt: {
        audience: process.env.JWT_AUDIENCE || 'gs-scaffold-api',
        issuer: `${keycloakUrl}/realms/${realm}`,
        cacheMaxAge: parseInt(process.env.JWKS_CACHE_MAX_AGE || '3600000', 10), // 1 hour default
        requestsPerMinute: parseInt(process.env.JWKS_REQUESTS_PER_MINUTE || '10', 10),
        timeoutMs: parseInt(process.env.JWKS_TIMEOUT_MS || '30000', 10),
      },
      cors: {
        allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        allowCredentials: process.env.CORS_ALLOW_CREDENTIALS === 'true',
      },
    };
  }

  /** Validate security configuration */
  static validateSecurityConfig(): { 
    valid: boolean; 
    errors: string[]; 
    warnings: string[]; 
  } {
    const config = this.getSecurityConfig();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required configurations
    if (!config.keycloak.url) {
      errors.push('KEYCLOAK_URL is required');
    }
    if (!config.keycloak.realm) {
      errors.push('KEYCLOAK_REALM is required');
    }
    if (!config.jwt.audience) {
      errors.push('JWT_AUDIENCE is required');
    }

    // Validate URLs
    try {
      new URL(config.keycloak.url);
    } catch {
      errors.push('KEYCLOAK_URL must be a valid URL');
    }

    try {
      new URL(config.jwt.issuer);
    } catch {
      errors.push('JWT issuer URL is invalid (derived from KEYCLOAK_URL and KEYCLOAK_REALM)');
    }

    // Production-specific validations
    if (this.isProduction()) {
      if (!config.keycloak.clientSecret) {
        errors.push('KEYCLOAK_CLIENT_SECRET is required in production');
      }
      if (config.keycloak.url.includes('localhost')) {
        warnings.push('Using localhost Keycloak URL in production');
      }
      if (config.cors.allowedOrigins.includes('*')) {
        warnings.push('CORS allows all origins in production');
      }
    }

    // Validate numeric configurations
    if (config.jwt.cacheMaxAge < 60000) { // Less than 1 minute
      warnings.push('JWKS cache max age is very low, may impact performance');
    }
    if (config.jwt.requestsPerMinute > 100) {
      warnings.push('JWKS requests per minute is very high, may be throttled');
    }
    if (config.jwt.timeoutMs < 5000) { // Less than 5 seconds
      warnings.push('JWKS timeout is very low, may cause connection issues');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
