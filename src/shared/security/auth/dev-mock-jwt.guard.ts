import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Buffer } from 'node:buffer';
import { AuthErrors } from '../errors/auth.errors';

/**
 * Development-only JWT Mock Guard
 *
 * WARNING: THIS IS FOR DEVELOPMENT/TESTING ONLY!
 * - Demonstrates proper base64url decoding with Node.js Buffer
 * - Does NOT verify JWT signatures (unsafe for production)
 * - Should only be used for local development testing
 *
 * For production, use SafeJwtAuthGuard which delegates to Passport JWT strategy.
 */
@Injectable()
export class DevMockJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers?: { authorization?: string }; user?: unknown }>();

    const auth = req.headers?.authorization;

    // Header validation (same as SafeJwtAuthGuard)
    if (!auth) throw AuthErrors.missingAuthorizationHeader();
    if (!auth.startsWith('Bearer '))
      throw AuthErrors.invalidAuthorizationHeader();

    const token = auth.slice(7);
    if (!token) throw AuthErrors.missingToken();

    // Validate token format (3 parts separated by dots)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw AuthErrors.invalidTokenFormat();
    }

    try {
      // Proper base64url decoding using Node.js Buffer (not atob)
      const header = this.decodeBase64Url(tokenParts[0]);
      const payload = this.decodeBase64Url(tokenParts[1]);

      const headerObj = JSON.parse(header) as { kid?: string };
      const payloadObj = JSON.parse(payload) as {
        sub?: string;
        name?: string;
        email?: string;
        tenant?: string;
        roles?: string[];
        groups?: string[];
        permissions?: string[];
      };

      // Basic structure validation
      if (!headerObj.kid || !payloadObj.sub) {
        throw AuthErrors.invalidTokenStructure();
      }

      // Mock user for development testing
      req.user = {
        sub: payloadObj.sub,
        name: payloadObj.name || 'Dev User',
        email: payloadObj.email || 'dev@example.com',
        tenant: payloadObj.tenant || 'dev-tenant',
        roles: payloadObj.roles || ['user'],
        groups: payloadObj.groups || [],
        permissions: payloadObj.permissions || [],
      };

      return true;
    } catch {
      throw AuthErrors.invalidTokenStructure();
    }
  }

  /**
   * Proper base64url decoding using Node.js Buffer
   * This is the correct way to decode JWT parts (not atob which is browser-only)
   */
  private decodeBase64Url(str: string): string {
    // Add padding if needed for proper base64 decoding
    const pad = 4 - (str.length % 4);
    const padded = pad === 4 ? str : str + '='.repeat(pad);

    // Convert base64url to base64 (replace - with + and _ with /)
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

    // Use Node.js Buffer for proper decoding
    return Buffer.from(base64, 'base64').toString('utf8');
  }
}
