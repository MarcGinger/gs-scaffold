import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { SecurityConfigService } from '../config/security-config.service';
import { IUserToken } from '../types/user-token.interface';
import { JwtPayload } from '../types/jwt-payload.interface';
import { TokenToUserMapper } from './token-to-user.mapper';
import { AuthErrors } from '../errors/auth.errors';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
      // Built-in secret provider from jwks-rsa (handles cache, ratelimit, rotation)
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        jwksUri: securityConfigService.getJwksUri(),
        cache: true,
        cacheMaxAge: jwtConfig.cacheMaxAge, // ms
        rateLimit: true,
        jwksRequestsPerMinute: jwtConfig.requestsPerMinute,
        timeout: jwtConfig.timeoutMs, // ms
        requestHeaders: { 'User-Agent': 'gs-scaffold-api/1.0.0' },
      }),
      // Tolerate small clock skew to handle real-world clock drift
      jsonWebTokenOptions: {
        clockTolerance: 5, // seconds
      },
    });
  }

  validate(payload: JwtPayload): IUserToken {
    // Base library has already verified signature, exp, iss, aud per strategy options.
    // Keep only domain-specific checks here.
    if (!payload || typeof payload !== 'object') {
      throw AuthErrors.invalidPayload();
    }

    // Domain checks (trim to what your app requires)
    if (!payload.sub) {
      throw AuthErrors.subjectMissing();
    }

    // Map to your IUserToken shape
    try {
      return this.tokenMapper.mapToUserToken(payload);
    } catch {
      // Don't leak details to the client
      throw AuthErrors.tokenMappingFailed();
    }
  }
}
