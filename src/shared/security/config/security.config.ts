import { registerAs } from '@nestjs/config';

export default registerAs('security', () => ({
  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'gs-scaffold',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'gs-scaffold-api',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  },
  jwt: {
    audience: process.env.JWT_AUDIENCE || 'gs-scaffold-api',
    issuer: `${process.env.KEYCLOAK_URL || 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM || 'gs-scaffold'}`,
    cacheMaxAge: parseInt(process.env.JWKS_CACHE_MAX_AGE || '3600000', 10), // 1 hour default
    requestsPerMinute: parseInt(
      process.env.JWKS_REQUESTS_PER_MINUTE || '10',
      10,
    ),
    timeoutMs: parseInt(process.env.JWKS_TIMEOUT_MS || '30000', 10),
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
    ],
    allowCredentials: process.env.CORS_ALLOW_CREDENTIALS === 'true',
  },
}));
