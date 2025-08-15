/**
 * PII data classification levels
 */
export enum PIIClassificationLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
  SENSITIVE = 'sensitive',
}

/**
 * PII field types for automatic detection
 */
export enum PIIFieldType {
  EMAIL = 'email',
  PHONE = 'phone',
  SSN = 'ssn',
  CREDIT_CARD = 'credit_card',
  IP_ADDRESS = 'ip_address',
  USER_AGENT = 'user_agent',
  FINANCIAL_ACCOUNT = 'financial_account',
  GOVERNMENT_ID = 'government_id',
  BIOMETRIC = 'biometric',
  LOCATION = 'location',
  HEALTH_INFO = 'health_info',
  PERSONAL_NAME = 'personal_name',
  ADDRESS = 'address',
  DATE_OF_BIRTH = 'date_of_birth',
}

/**
 * PII protection action types
 */
export enum PIIProtectionAction {
  MASK = 'mask',
  REDACT = 'redact',
  ENCRYPT = 'encrypt',
  HASH = 'hash',
  TOKENIZE = 'tokenize',
  BLOCK = 'block',
  AUDIT_ONLY = 'audit_only',
}

/**
 * PII field metadata for classification and protection
 */
export interface PIIFieldMetadata {
  readonly fieldName: string;
  readonly fieldType: PIIFieldType;
  readonly classificationLevel: PIIClassificationLevel;
  readonly protectionAction: PIIProtectionAction;
  readonly required: boolean;
  readonly patterns?: readonly RegExp[];
  readonly contextRules?: readonly string[];
}

/**
 * PII detection result
 */
export interface PIIDetectionResult {
  readonly fieldPath: string;
  readonly fieldType: PIIFieldType;
  readonly classificationLevel: PIIClassificationLevel;
  readonly confidence: number; // 0-1
  readonly value: string;
  readonly detectionMethod: 'pattern' | 'field_name' | 'context' | 'ml';
  readonly suggestedAction: PIIProtectionAction;
}

/**
 * PII protection result
 */
export interface PIIProtectionResult {
  readonly originalValue: string;
  readonly protectedValue: string;
  readonly action: PIIProtectionAction;
  readonly fieldType: PIIFieldType;
  readonly metadata?: Record<string, unknown>;
}

/**
 * PII scanning configuration
 */
export interface PIIScanConfig {
  readonly enabledDetectors: readonly PIIFieldType[];
  readonly confidenceThreshold: number; // 0-1, minimum confidence to flag as PII
  readonly scanDepth: number; // how deep to scan nested objects
  readonly contextAware: boolean; // use field names and context for detection
  readonly customPatterns: Record<string, RegExp>;
  readonly excludeFields: readonly string[]; // fields to skip scanning
}

/**
 * PII audit event for compliance tracking
 */
export interface PIIAuditEvent {
  readonly timestamp: string;
  readonly correlationId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly operation: 'scan' | 'protect' | 'access' | 'export';
  readonly fieldsProcessed: number;
  readonly piiFieldsDetected: number;
  readonly protectionActions: readonly PIIProtectionAction[];
  readonly complianceRequirement?: string;
  readonly dataSubjectId?: string;
  readonly legalBasis?: string;
  readonly retentionPeriod?: string;
}
