import { Injectable } from '@nestjs/common';
import {
  PIIFieldType,
  PIIClassificationLevel,
  PIIProtectionAction,
  PIIDetectionResult,
  PIIScanConfig,
} from './pii.types';

/**
 * PII pattern detection service
 * Identifies PII data using patterns, field names, and context
 */
@Injectable()
export class PIIDetectorService {
  private readonly defaultPatterns: Record<PIIFieldType, RegExp[]> = {
    [PIIFieldType.EMAIL]: [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ],
    [PIIFieldType.PHONE]: [
      /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    ],
    [PIIFieldType.SSN]: [/\b\d{3}-?\d{2}-?\d{4}\b/g, /\b\d{9}\b/g],
    [PIIFieldType.CREDIT_CARD]: [
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    ],
    [PIIFieldType.IP_ADDRESS]: [
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    ],
    [PIIFieldType.USER_AGENT]: [/Mozilla\/\d+\.\d+.*\(.*\)/g],
    [PIIFieldType.FINANCIAL_ACCOUNT]: [
      /\b\d{10,17}\b/g, // Bank account numbers
    ],
    [PIIFieldType.GOVERNMENT_ID]: [
      /\b[A-Z]{1,2}\d{6,8}\b/g, // Passport-like patterns
    ],
    [PIIFieldType.DATE_OF_BIRTH]: [
      /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,
      /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
    ],
    [PIIFieldType.BIOMETRIC]: [],
    [PIIFieldType.LOCATION]: [],
    [PIIFieldType.HEALTH_INFO]: [],
    [PIIFieldType.PERSONAL_NAME]: [],
    [PIIFieldType.ADDRESS]: [],
  };

  private readonly fieldNamePatterns: Record<PIIFieldType, RegExp[]> = {
    [PIIFieldType.EMAIL]: [/email|mail|e-mail/i],
    [PIIFieldType.PHONE]: [/phone|tel|telephone|mobile|cell/i],
    [PIIFieldType.SSN]: [/ssn|social.?security|tax.?id/i],
    [PIIFieldType.CREDIT_CARD]: [/card|credit|payment|cc/i],
    [PIIFieldType.IP_ADDRESS]: [/ip|address|host/i],
    [PIIFieldType.USER_AGENT]: [/user.?agent|browser|client/i],
    [PIIFieldType.FINANCIAL_ACCOUNT]: [/account|bank|routing|iban/i],
    [PIIFieldType.GOVERNMENT_ID]: [/passport|license|id|identification/i],
    [PIIFieldType.DATE_OF_BIRTH]: [/birth|dob|born/i],
    [PIIFieldType.PERSONAL_NAME]: [/name|first|last|full.?name/i],
    [PIIFieldType.ADDRESS]: [/address|street|city|zip|postal/i],
    [PIIFieldType.BIOMETRIC]: [/biometric|fingerprint|retina|face/i],
    [PIIFieldType.LOCATION]: [/location|lat|lng|coordinates|gps/i],
    [PIIFieldType.HEALTH_INFO]: [/health|medical|diagnosis|treatment/i],
  };

  /**
   * Scan data for PII fields
   */
  scanForPII(
    data: unknown,
    config: PIIScanConfig,
    path: string = '',
  ): PIIDetectionResult[] {
    const results: PIIDetectionResult[] = [];

    if (path.split('.').length > config.scanDepth) {
      return results;
    }

    if (typeof data === 'string') {
      results.push(...this.scanStringValue(data, path, config));
    } else if (Array.isArray(data)) {
      data.forEach((item, index) => {
        results.push(...this.scanForPII(item, config, `${path}[${index}]`));
      });
    } else if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        const fieldPath = path ? `${path}.${key}` : key;

        if (!config.excludeFields.includes(fieldPath)) {
          results.push(...this.scanForPII(value, config, fieldPath));
        }
      });
    }

    return results;
  }

  /**
   * Scan a string value for PII patterns
   */
  private scanStringValue(
    value: string,
    fieldPath: string,
    config: PIIScanConfig,
  ): PIIDetectionResult[] {
    const results: PIIDetectionResult[] = [];

    for (const fieldType of config.enabledDetectors) {
      // Pattern-based detection
      const patterns = [
        ...this.defaultPatterns[fieldType],
        ...(config.customPatterns[fieldType]
          ? [config.customPatterns[fieldType]]
          : []),
      ];

      for (const pattern of patterns) {
        const matches = value.match(pattern);
        if (matches) {
          results.push({
            fieldPath,
            fieldType,
            classificationLevel: this.getClassificationLevel(fieldType),
            confidence: 0.9, // High confidence for pattern matches
            value,
            detectionMethod: 'pattern',
            suggestedAction: this.getSuggestedAction(fieldType),
          });
          break; // Don't double-detect the same field
        }
      }

      // Field name-based detection (if no pattern match)
      if (config.contextAware && results.length === 0) {
        const fieldNamePatterns = this.fieldNamePatterns[fieldType];
        const fieldName = fieldPath.split('.').pop() || '';

        for (const namePattern of fieldNamePatterns) {
          if (namePattern.test(fieldName)) {
            results.push({
              fieldPath,
              fieldType,
              classificationLevel: this.getClassificationLevel(fieldType),
              confidence: 0.7, // Lower confidence for field name matches
              value,
              detectionMethod: 'field_name',
              suggestedAction: this.getSuggestedAction(fieldType),
            });
            break;
          }
        }
      }
    }

    return results.filter(
      (result) => result.confidence >= config.confidenceThreshold,
    );
  }

  /**
   * Get classification level for field type
   */
  private getClassificationLevel(
    fieldType: PIIFieldType,
  ): PIIClassificationLevel {
    const classificationMap: Record<PIIFieldType, PIIClassificationLevel> = {
      [PIIFieldType.EMAIL]: PIIClassificationLevel.CONFIDENTIAL,
      [PIIFieldType.PHONE]: PIIClassificationLevel.CONFIDENTIAL,
      [PIIFieldType.SSN]: PIIClassificationLevel.SENSITIVE,
      [PIIFieldType.CREDIT_CARD]: PIIClassificationLevel.SENSITIVE,
      [PIIFieldType.IP_ADDRESS]: PIIClassificationLevel.INTERNAL,
      [PIIFieldType.USER_AGENT]: PIIClassificationLevel.INTERNAL,
      [PIIFieldType.FINANCIAL_ACCOUNT]: PIIClassificationLevel.SENSITIVE,
      [PIIFieldType.GOVERNMENT_ID]: PIIClassificationLevel.SENSITIVE,
      [PIIFieldType.DATE_OF_BIRTH]: PIIClassificationLevel.CONFIDENTIAL,
      [PIIFieldType.PERSONAL_NAME]: PIIClassificationLevel.CONFIDENTIAL,
      [PIIFieldType.ADDRESS]: PIIClassificationLevel.CONFIDENTIAL,
      [PIIFieldType.BIOMETRIC]: PIIClassificationLevel.SENSITIVE,
      [PIIFieldType.LOCATION]: PIIClassificationLevel.CONFIDENTIAL,
      [PIIFieldType.HEALTH_INFO]: PIIClassificationLevel.SENSITIVE,
    };

    return classificationMap[fieldType] || PIIClassificationLevel.INTERNAL;
  }

  /**
   * Get suggested protection action for field type
   */
  private getSuggestedAction(fieldType: PIIFieldType): PIIProtectionAction {
    const actionMap: Record<PIIFieldType, PIIProtectionAction> = {
      [PIIFieldType.EMAIL]: PIIProtectionAction.MASK,
      [PIIFieldType.PHONE]: PIIProtectionAction.MASK,
      [PIIFieldType.SSN]: PIIProtectionAction.REDACT,
      [PIIFieldType.CREDIT_CARD]: PIIProtectionAction.REDACT,
      [PIIFieldType.IP_ADDRESS]: PIIProtectionAction.HASH,
      [PIIFieldType.USER_AGENT]: PIIProtectionAction.HASH,
      [PIIFieldType.FINANCIAL_ACCOUNT]: PIIProtectionAction.REDACT,
      [PIIFieldType.GOVERNMENT_ID]: PIIProtectionAction.REDACT,
      [PIIFieldType.DATE_OF_BIRTH]: PIIProtectionAction.MASK,
      [PIIFieldType.PERSONAL_NAME]: PIIProtectionAction.MASK,
      [PIIFieldType.ADDRESS]: PIIProtectionAction.MASK,
      [PIIFieldType.BIOMETRIC]: PIIProtectionAction.BLOCK,
      [PIIFieldType.LOCATION]: PIIProtectionAction.HASH,
      [PIIFieldType.HEALTH_INFO]: PIIProtectionAction.REDACT,
    };

    return actionMap[fieldType] || PIIProtectionAction.AUDIT_ONLY;
  }
}
