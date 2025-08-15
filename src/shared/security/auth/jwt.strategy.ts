import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { JwksClient } from 'jwks-rsa';
import { SecurityConfigService } from '../config/security-config.service';
import { IUserToken } from '../types/user-token.interface';
import { JwtPayload } from '../types/jwt-payload.interface';
import { TokenToUserMapper } from './token-to-user.mapper';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private jwksClient: JwksClient;

  constructor(
    private readonly securityConfigService: SecurityConfigService,
    private readonly tokenMapper: TokenToUserMapper,
  ) {
    const jwtConfig = securityConfigService.getValidatedJwtConfig();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      algorithms: ['RS256'],
      secretOrKeyProvider: (request, rawJwtToken: string, done) => {
        void this.getSigningKey(rawJwtToken, done);
      },
    });

    this.jwksClient = new JwksClient({
      jwksUri: securityConfigService.getJwksUri(),
      cache: true,
      cacheMaxAge: jwtConfig.cacheMaxAge,
      rateLimit: true,
      jwksRequestsPerMinute: jwtConfig.requestsPerMinute,
      requestHeaders: {
        'User-Agent': 'gs-scaffold-api/1.0.0',
      },
      timeout: jwtConfig.timeoutMs,
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
    const jwtConfig = this.securityConfigService.getValidatedJwtConfig();
    if (jwtConfig.audience && payload.aud) {
      const audiences = Array.isArray(payload.aud)
        ? payload.aud
        : [payload.aud];
      if (!audiences.includes(jwtConfig.audience)) {
        throw new UnauthorizedException(
          `Invalid audience: expected ${jwtConfig.audience}`,
        );
      }
    }

    // Validate issuer claim
    const expectedIssuer = this.securityConfigService.getIssuerUrl();
    if (payload.iss !== expectedIssuer) {
      throw new UnauthorizedException(
        `Invalid issuer: expected ${expectedIssuer}, got ${payload.iss}`,
      );
    }
  }
}
