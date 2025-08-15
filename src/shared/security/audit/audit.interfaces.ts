/**
 * Time source interface for deterministic testing
 */
export interface IClock {
  now(): Date;
  toISOString(): string;
}

/**
 * ID generation interface for deterministic testing
 */
export interface IIdGenerator {
  generateCorrelationId(): string;
  generateAuditId(): string;
}

/**
 * Default implementations
 */
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }

  toISOString(): string {
    return new Date().toISOString();
  }
}

export class UuidGenerator implements IIdGenerator {
  generateCorrelationId(): string {
    return `audit-${this.generateUuid()}`;
  }

  generateAuditId(): string {
    return this.generateUuid();
  }

  private generateUuid(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

/**
 * Audit configuration interface
 */
export interface AuditConfig {
  sampling?: {
    allowDecisions?: number; // Percentage (0-100)
    denyDecisions?: number;
    errorDecisions?: number;
  };
  limits?: {
    maxReasonLength?: number;
    maxMetadataSize?: number;
    maxPayloadSize?: number;
  };
  redaction?: {
    maskIpAddresses?: boolean;
    maskUserAgents?: boolean;
    maskEmails?: boolean;
    preserveNetworkPrefix?: boolean; // For IP: show /24 network
  };
}
