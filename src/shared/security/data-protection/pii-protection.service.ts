import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { APP_LOGGER } from '../../logging/logging.providers';
import { createHash, randomBytes } from 'crypto';
import {
  PIIFieldType,
  PIIProtectionAction,
  PIIProtectionResult,
  PIIDetectionResult,
  PIIAuditEvent,
} from './pii.types';
import { PIIDetectorService } from './pii-detector.service';

/**
 * PII protection service that applies data protection actions
 * Handles masking, redaction, encryption, hashing, and tokenization
 */
@Injectable()
export class PIIProtectionService {
  private readonly tokenMap = new Map<string, string>(); // For tokenization
  private readonly logger: Logger;

  constructor(
    @Inject(APP_LOGGER) private readonly baseLogger: Logger,
    private readonly detector: PIIDetectorService,
  ) {
    this.logger = baseLogger.child({
      component: 'PIIProtectionService',
    });
  }

  /**
   * Protect PII data by applying appropriate protection actions
   */
  protectData(
    data: unknown,
    detectedPII: PIIDetectionResult[],
    correlationId?: string,
  ): { protectedData: unknown; results: PIIProtectionResult[] } {
    const results: PIIProtectionResult[] = [];
    let protectedData = this.deepClone(data);

    for (const detection of detectedPII) {
      const protectionResult = this.applyProtection(
        detection.value,
        detection.fieldType,
        detection.suggestedAction,
      );

      results.push(protectionResult);

      // Apply the protection to the actual data
      protectedData = this.updateFieldValue(
        protectedData,
        detection.fieldPath,
        protectionResult.protectedValue,
      );
    }

    // Log audit event
    this.logPIIAuditEvent({
      operation: 'protect',
      fieldsProcessed: this.countFields(data),
      piiFieldsDetected: detectedPII.length,
      protectionActions: results.map((r) => r.action),
      correlationId: correlationId || this.generateCorrelationId(),
    });

    return { protectedData, results };
  }

  /**
   * Apply specific protection action to a value
   */
  private applyProtection(
    value: string,
    fieldType: PIIFieldType,
    action: PIIProtectionAction,
  ): PIIProtectionResult {
    let protectedValue: string;
    const metadata: Record<string, unknown> = {};

    switch (action) {
      case PIIProtectionAction.MASK:
        protectedValue = this.maskValue(value, fieldType);
        break;

      case PIIProtectionAction.REDACT:
        protectedValue = '[REDACTED]';
        metadata.originalLength = value.length;
        break;

      case PIIProtectionAction.HASH:
        protectedValue = this.hashValue(value);
        metadata.algorithm = 'sha256';
        break;

      case PIIProtectionAction.ENCRYPT:
        protectedValue = this.encryptValue(value);
        metadata.encrypted = true;
        break;

      case PIIProtectionAction.TOKENIZE:
        protectedValue = this.tokenizeValue(value);
        metadata.tokenized = true;
        break;

      case PIIProtectionAction.BLOCK:
        protectedValue = '[BLOCKED]';
        metadata.blocked = true;
        break;

      case PIIProtectionAction.AUDIT_ONLY:
      default:
        protectedValue = value;
        metadata.auditOnly = true;
        break;
    }

    return {
      originalValue: value,
      protectedValue,
      action,
      fieldType,
      metadata,
    };
  }

  /**
   * Mask value based on field type
   */
  private maskValue(value: string, fieldType: PIIFieldType): string {
    switch (fieldType) {
      case PIIFieldType.EMAIL: {
        const atIndex = value.indexOf('@');
        if (atIndex > 0) {
          const localPart = value.substring(0, atIndex);
          const domain = value.substring(atIndex);

          if (localPart.length <= 2) {
            return `***${domain}`;
          }

          return `${localPart.charAt(0)}***${localPart.charAt(localPart.length - 1)}${domain}`;
        }
        return '***@***';
      }

      case PIIFieldType.PHONE: {
        if (value.length >= 10) {
          return `***-***-${value.slice(-4)}`;
        }
        return '***-***-****';
      }

      case PIIFieldType.CREDIT_CARD: {
        if (value.length >= 12) {
          return `****-****-****-${value.slice(-4)}`;
        }
        return '****-****-****-****';
      }

      case PIIFieldType.SSN: {
        if (value.length >= 9) {
          return `***-**-${value.slice(-4)}`;
        }
        return '***-**-****';
      }

      case PIIFieldType.PERSONAL_NAME: {
        const parts = value.split(' ');
        if (parts.length > 1) {
          return `${parts[0].charAt(0)}*** ${parts[parts.length - 1].charAt(0)}***`;
        }
        return `${value.charAt(0)}***`;
      }

      case PIIFieldType.ADDRESS: {
        const parts = value.split(',');
        if (parts.length > 1) {
          return `*** ${parts[parts.length - 1].trim()}`; // Keep city/state
        }
        return '***';
      }

      default: {
        if (value.length <= 4) {
          return '***';
        }
        return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
      }
    }
  }

  /**
   * Hash value using SHA-256
   */
  private hashValue(value: string): string {
    const hash = createHash('sha256').update(value).digest('hex');
    return `hash_${hash.substring(0, 16)}`;
  }

  /**
   * Simple encryption (in production, use proper key management)
   */
  private encryptValue(value: string): string {
    // This is a simple example - use proper encryption in production
    const key = this.getEncryptionKey();
    const cipher = createHash('sha256')
      .update(key + value)
      .digest('hex');
    return `enc_${cipher.substring(0, 16)}`;
  }

  /**
   * Tokenize value (replace with token, store mapping)
   */
  private tokenizeValue(value: string): string {
    // Check if already tokenized
    for (const [token, originalValue] of this.tokenMap.entries()) {
      if (originalValue === value) {
        return token;
      }
    }

    // Create new token
    const token = `tok_${randomBytes(8).toString('hex')}`;
    this.tokenMap.set(token, value);
    return token;
  }

  /**
   * Update field value in nested object structure
   */
  private updateFieldValue(
    obj: unknown,
    path: string,
    newValue: string,
  ): unknown {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const pathParts = path.split('.');
    let current: any = obj;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];

      if (part.includes('[') && part.includes(']')) {
        const [arrayField, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''), 10);
        current = current[arrayField][index];
      } else {
        current = current[part];
      }
    }

    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart.includes('[') && lastPart.includes(']')) {
      const [arrayField, indexStr] = lastPart.split('[');
      const index = parseInt(indexStr.replace(']', ''), 10);
      current[arrayField][index] = newValue;
    } else {
      current[lastPart] = newValue;
    }

    return obj;
  }

  /**
   * Deep clone object
   */
  private deepClone(obj: unknown): unknown {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Count total fields in object
   */
  private countFields(obj: unknown): number {
    if (!obj || typeof obj !== 'object') {
      return 1;
    }

    if (Array.isArray(obj)) {
      return obj.reduce((count, item) => count + this.countFields(item), 0);
    }

    return Object.values(obj).reduce(
      (count, value) => count + this.countFields(value),
      0,
    );
  }

  /**
   * Log PII audit event
   */
  private logPIIAuditEvent(event: Partial<PIIAuditEvent>): void {
    const auditEvent: PIIAuditEvent = {
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId || this.generateCorrelationId(),
      operation: event.operation || 'scan',
      fieldsProcessed: event.fieldsProcessed || 0,
      piiFieldsDetected: event.piiFieldsDetected || 0,
      protectionActions: event.protectionActions || [],
      userId: event.userId,
      tenantId: event.tenantId,
      complianceRequirement: event.complianceRequirement,
      dataSubjectId: event.dataSubjectId,
      legalBasis: event.legalBasis,
      retentionPeriod: event.retentionPeriod,
    };

    this.logger.info(
      {
        method: 'logPIIAuditEvent',
        audit: auditEvent,
        alertLevel: auditEvent.piiFieldsDetected > 0 ? 'medium' : 'low',
      },
      `PII ${auditEvent.operation} completed: ${auditEvent.piiFieldsDetected} PII fields found`,
    );
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `pii-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Get encryption key (implement proper key management in production)
   */
  private getEncryptionKey(): string {
    return process.env.PII_ENCRYPTION_KEY || 'default-key-change-in-production';
  }
}
