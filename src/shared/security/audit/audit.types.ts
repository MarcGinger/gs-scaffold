/**
 * Typed obligations for security decisions
 */
export type SecurityObligation =
  | { type: 'mask'; fields: string[] }
  | { type: 'redact'; fields: string[] }
  | { type: 'limit'; count: number }
  | { type: 'audit'; level: 'standard' | 'enhanced' }
  | { type: 'approval'; required: boolean };

/**
 * Reason codes that map 1:1 to OPA policy decisions
 */
export enum SecurityReasonCode {
  // Allow codes
  ALLOW = 'ALLOW',
  CONDITIONAL_ALLOW = 'CONDITIONAL_ALLOW',

  // Deny codes
  DENY = 'DENY',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  INVALID_RESOURCE = 'INVALID_RESOURCE',
  INVALID_ACTION = 'INVALID_ACTION',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  TIME_RESTRICTION = 'TIME_RESTRICTION',
  LOCATION_RESTRICTION = 'LOCATION_RESTRICTION',

  // Error codes
  AUTHZ_ERROR = 'AUTHZ_ERROR',
  POLICY_ERROR = 'POLICY_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Authentication codes
  AUTHENTICATION_SUCCESS = 'AUTHENTICATION_SUCCESS',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',

  // Special access codes
  EMERGENCY_ACCESS_GRANTED = 'EMERGENCY_ACCESS_GRANTED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  ACCESS_DENIED = 'ACCESS_DENIED',
}

/**
 * Enhanced audit log entry with stricter typing
 */
export interface TypedAuditLogEntry {
  readonly eventType: AuditEventType;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly action?: string;
  readonly decision: 'ALLOW' | 'DENY' | 'ERROR';
  readonly reasonCode: SecurityReasonCode;
  readonly reason?: string;
  readonly obligations?: readonly SecurityObligation[];
  readonly obligationsCount?: number;
  readonly rolesCount?: number;
  readonly ipAddressHash?: string;
  readonly userAgentFamily?: string;
  readonly metadata?: Record<string, unknown>;
  readonly policyVersion?: string;
  readonly emergency?: boolean;
  readonly sensitiveOperation?: boolean;
  readonly requiresReview?: boolean;
  readonly sampling?: boolean;
}

export enum AuditEventType {
  AUTHORIZATION_DECISION = 'authorization_decision',
  AUTHENTICATION_SUCCESS = 'authentication_success',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  ACCESS_DENIED = 'access_denied',
  ELEVATED_ACCESS = 'elevated_access',
  POLICY_VIOLATION = 'policy_violation',
  EMERGENCY_ACCESS = 'emergency_access',
}
