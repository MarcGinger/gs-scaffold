import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { JwksClient } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { IUserToken } from '../types/user-token.interface';
import { JwtPayload } from '../types/jwt-payload.interface';
import { TokenToUserMapper } from './token-to-user.mapper';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private jwksClient: JwksClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenMapper: TokenToUserMapper,
  ) {
    const keycloakUrl = configService.get<string>('KEYCLOAK_URL');
    const realm = configService.get<string>('KEYCLOAK_REALM');
    const audience = configService.get<string>('JWT_AUDIENCE');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: `${keycloakUrl}/realms/${realm}`,
      audience: audience,
      algorithms: ['RS256'],
      secretOrKeyProvider: (request, rawJwtToken: string, done) => {
        void this.getSigningKey(rawJwtToken, done);
      },
    });

    this.jwksClient = new JwksClient({
      jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxAge: parseInt(
        this.configService.get<string>('JWKS_CACHE_MAX_AGE', '3600000'),
        10,
      ), // Default 1 hour, configurable for production
      rateLimit: true,
      jwksRequestsPerMinute: parseInt(
        this.configService.get<string>('JWKS_REQUESTS_PER_MINUTE', '10'),
        10,
      ),
      requestHeaders: {
        'User-Agent': 'gs-scaffold-api/1.0.0',
      },
      timeout: parseInt(
        this.configService.get<string>('JWKS_TIMEOUT_MS', '30000'),
        10,
      ),
    });
  }

  private async getSigningKey(
    token: string,
    done: (error: Error | null, key?: string) => void,
  ): Promise<void> {
    try {
      const decoded = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64').toString(),
      ) as { kid?: string };
      const kid = decoded.kid;

      if (!kid) {
        done(new UnauthorizedException('Token missing kid'), undefined);
        return;
      }

      const key = await this.jwksClient.getSigningKey(kid);
      const signingKey = key.getPublicKey();
      done(null, signingKey);
    } catch (error) {
      // Log error for debugging but don't expose internal details
      console.log('JWT Strategy: Token validation failed', error);
      done(new UnauthorizedException('Invalid token signature'), undefined);
    }
  }

  validate(payload: JwtPayload): IUserToken {
    try {
      // Validate payload exists
      if (!payload || typeof payload !== 'object') {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Validate token claims
      this.validateTokenClaims(payload);

      // Map JWT payload to IUserToken
      return this.tokenMapper.mapToUserToken(payload);
    } catch (error) {
      // If it's already an UnauthorizedException, re-throw it
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // For any other error, wrap it in UnauthorizedException
      throw new UnauthorizedException('Token validation failed');
    }
  }

  private validateTokenClaims(payload: JwtPayload): void {
    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (payload.exp && payload.exp < now) {
      throw new UnauthorizedException('Token expired');
    }

    // Check not before
    if (payload.nbf && payload.nbf > now) {
      throw new UnauthorizedException('Token not yet valid');
    }

    // Check issued at
    if (payload.iat && payload.iat > now) {
      throw new UnauthorizedException('Token issued in future');
    }

    // Validate required claims
    if (!payload.sub) {
      throw new UnauthorizedException('Token missing subject');
    }

    // Validate audience claim
    const expectedAudience = this.configService.get<string>('JWT_AUDIENCE');
    if (expectedAudience && payload.aud) {
      const audiences = Array.isArray(payload.aud)
        ? payload.aud
        : [payload.aud];
      if (!audiences.includes(expectedAudience)) {
        throw new UnauthorizedException(
          `Invalid audience: expected ${expectedAudience}`,
        );
      }
    }

    // Validate issuer claim
    const expectedIssuer = `${this.configService.get<string>('KEYCLOAK_URL')}/realms/${this.configService.get<string>('KEYCLOAK_REALM')}`;
    if (payload.iss !== expectedIssuer) {
      throw new UnauthorizedException(
        `Invalid issuer: expected ${expectedIssuer}, got ${payload.iss}`,
      );
    }
  }
}
