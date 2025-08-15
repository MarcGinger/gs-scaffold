import { AuditConfig } from './audit.interfaces';
import { createHash } from 'crypto';

/**
 * Centralized redaction and masking utility for audit logs
 * Ensures consistent PII and sensitive data handling
 */
export class RedactionUtil {
  private readonly config: Required<NonNullable<AuditConfig['redaction']>>;

  constructor(config?: AuditConfig['redaction']) {
    this.config = {
      maskIpAddresses: true,
      maskUserAgents: true,
      maskEmails: true,
      preserveNetworkPrefix: true,
      ...(config || {}),
    };
  }

  /**
   * Redact IP address - hash or show network prefix
   */
  redactIpAddress(ipAddress?: string): string | undefined {
    if (!ipAddress || !this.config.maskIpAddresses) return ipAddress;

    if (this.config.preserveNetworkPrefix) {
      // Show /24 network (e.g., 192.168.1.0/24)
      const parts = ipAddress.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      }
    }

    // Hash the IP
    return this.hashSensitiveData(ipAddress, 'ip');
  }

  /**
   * Redact user agent - hash or show family
   */
  redactUserAgent(userAgent?: string): string | undefined {
    if (!userAgent || !this.config.maskUserAgents) return userAgent;

    // Extract browser family (basic parsing)
    const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)/);
    if (browserMatch) {
      return `${browserMatch[1]}/***`;
    }

    // Fallback to hash
    return this.hashSensitiveData(userAgent, 'ua');
  }

  /**
   * Redact email address
   */
  redactEmail(email?: string): string | undefined {
    if (!email || !this.config.maskEmails) return email;

    const atIndex = email.indexOf('@');
    if (atIndex > 0) {
      const localPart = email.substring(0, atIndex);
      const domain = email.substring(atIndex);

      if (localPart.length <= 2) {
        return `***${domain}`;
      }

      return `${localPart.charAt(0)}***${localPart.charAt(localPart.length - 1)}${domain}`;
    }

    return '***@***';
  }

  /**
   * Mask tokens (preserve prefix/suffix)
   */
  maskToken(token: string): string {
    if (token.length <= 8) return '***';
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
  }

  /**
   * Truncate large text fields
   */
  truncateText(text: string, maxLength: number = 500): string {
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...[TRUNCATED:${text.length}]`;
  }

  /**
   * Limit object size and redact sensitive fields
   */
  redactMetadata(
    metadata: Record<string, unknown>,
    maxSizeBytes: number = 8192,
  ): Record<string, unknown> {
    const redacted = { ...metadata };

    // Redact known sensitive fields
    if (redacted.email && typeof redacted.email === 'string') {
      redacted.email = this.redactEmail(redacted.email);
    }

    if (redacted.ipAddress && typeof redacted.ipAddress === 'string') {
      redacted.ipAddress = this.redactIpAddress(redacted.ipAddress);
    }

    if (redacted.userAgent && typeof redacted.userAgent === 'string') {
      redacted.userAgent = this.redactUserAgent(redacted.userAgent);
    }

    // Mask any field containing 'token', 'secret', 'password', 'key'
    Object.keys(redacted).forEach((key) => {
      if (
        /token|secret|password|key|auth/i.test(key) &&
        typeof redacted[key] === 'string'
      ) {
        redacted[key] = this.maskToken(redacted[key] as string);
      }
    });

    // Check size and truncate if needed
    const serialized = JSON.stringify(redacted);
    if (serialized.length > maxSizeBytes) {
      return {
        ...redacted,
        _truncated: true,
        _originalSize: serialized.length,
        _note: 'Metadata truncated due to size limit',
      };
    }

    return redacted;
  }

  /**
   * Redact arrays for high-volume logging (show counts instead)
   */
  redactArrayToCount(
    arr: readonly unknown[],
    includeFullAtDebug: boolean = true,
  ): { count: number; items?: readonly unknown[] } {
    const result: { count: number; items?: readonly unknown[] } = {
      count: arr.length,
    };

    if (includeFullAtDebug) {
      result.items = arr;
    }

    return result;
  }

  /**
   * Hash sensitive data consistently
   */
  private hashSensitiveData(data: string, prefix: string): string {
    const hash = createHash('sha256').update(data).digest('hex');
    return `${prefix}_${hash.substring(0, 12)}`;
  }
}
