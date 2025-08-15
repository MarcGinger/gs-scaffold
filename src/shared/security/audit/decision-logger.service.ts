import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { APP_LOGGER } from '../../logging/logging.providers';
import { Log } from '../../logging/structured-logger';
import { OpaInput, OpaDecision } from '../opa/opa.types';
import { IUserToken } from '../types/user-token.interface';

/**
 * Audit event types for security decision logging
 */
export enum AuditEventType {
  AUTHORIZATION_DECISION = 'authorization_decision',
  AUTHENTICATION_SUCCESS = 'authentication_success',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  ACCESS_DENIED = 'access_denied',
  ELEVATED_ACCESS = 'elevated_access',
  POLICY_VIOLATION = 'policy_violation',
  EMERGENCY_ACCESS = 'emergency_access',
}

/**
 * Structured audit log entry
 */
export interface AuditLogEntry {
  readonly eventType: AuditEventType;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly action?: string;
  readonly decision: 'ALLOW' | 'DENY' | 'ERROR';
  readonly reasonCode: string;
  readonly reason?: string;
  readonly obligations?: readonly unknown[];
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly metadata?: Record<string, unknown>;
  readonly policyVersion?: string;
  readonly emergency?: boolean;
  readonly sensitiveOperation?: boolean;
}

/**
 * Decision logging service for security audit trails
 * Provides comprehensive audit logging for authorization decisions and security events
 */
@Injectable()
export class DecisionLoggerService {
  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {}

  /**
   * Log an authorization decision with full context
   */
  logAuthorizationDecision(
    input: OpaInput,
    decision: OpaDecision,
    context?: {
      correlationId?: string;
      ipAddress?: string;
      userAgent?: string;
      emergency?: boolean;
    },
  ): void {
    const auditEntry: AuditLogEntry = {
      eventType: AuditEventType.AUTHORIZATION_DECISION,
      timestamp: new Date().toISOString(),
      correlationId: context?.correlationId || input.context.correlationId,
      userId: input.subject.id,
      tenantId: input.subject.tenant || input.resource.tenant,
      resourceType: input.resource.type,
      resourceId: input.resource.id,
      action: `${input.action.type}.${input.action.name}`,
      decision: decision.allow ? 'ALLOW' : 'DENY',
      reasonCode: decision.reason_code || 'UNKNOWN',
      reason: decision.reason,
      obligations: decision.obligations,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: input.context.metadata,
      policyVersion: decision.policy_version,
      emergency: context?.emergency || !!input.context.emergency_token,
      sensitiveOperation: this.isSensitiveOperation(input),
    };

    // Use different log levels based on decision and sensitivity
    if (
      !decision.allow ||
      auditEntry.emergency ||
      auditEntry.sensitiveOperation
    ) {
      Log.minimal.warn(this.logger, 'Security decision logged', {
        method: 'logAuthorizationDecision',
        audit: auditEntry,
        alertLevel: this.getAlertLevel(auditEntry),
      });
    } else {
      Log.minimal.info(this.logger, 'Authorization decision logged', {
        method: 'logAuthorizationDecision',
        audit: auditEntry,
      });
    }
  }

  /**
   * Log authentication success
   */
  logAuthenticationSuccess(
    user: IUserToken,
    context?: {
      correlationId?: string;
      ipAddress?: string;
      userAgent?: string;
      authMethod?: string;
    },
  ): void {
    const auditEntry: AuditLogEntry = {
      eventType: AuditEventType.AUTHENTICATION_SUCCESS,
      timestamp: new Date().toISOString(),
      correlationId: context?.correlationId || this.generateCorrelationId(),
      userId: user.sub,
      tenantId: user.tenant,
      decision: 'ALLOW',
      reasonCode: 'AUTHENTICATION_SUCCESS',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: {
        authMethod: context?.authMethod,
        roles: user.roles,
        permissions: user.permissions,
      },
    };

    Log.minimal.info(this.logger, 'Authentication success logged', {
      method: 'logAuthenticationSuccess',
      audit: auditEntry,
    });
  }

  /**
   * Log authentication failure
   */
  logAuthenticationFailure(
    reason: string,
    context?: {
      correlationId?: string;
      ipAddress?: string;
      userAgent?: string;
      attemptedUserId?: string;
      authMethod?: string;
    },
  ): void {
    const auditEntry: AuditLogEntry = {
      eventType: AuditEventType.AUTHENTICATION_FAILURE,
      timestamp: new Date().toISOString(),
      correlationId: context?.correlationId || this.generateCorrelationId(),
      userId: context?.attemptedUserId,
      decision: 'DENY',
      reasonCode: 'AUTHENTICATION_FAILED',
      reason,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata: {
        authMethod: context?.authMethod,
      },
    };

    Log.minimal.warn(this.logger, 'Authentication failure logged', {
      method: 'logAuthenticationFailure',
      audit: auditEntry,
      alertLevel: 'medium',
    });
  }

  /**
   * Log access denied events
   */
  logAccessDenied(
    userId: string,
    resource: string,
    action: string,
    reason: string,
    context?: {
      correlationId?: string;
      tenantId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): void {
    const auditEntry: AuditLogEntry = {
      eventType: AuditEventType.ACCESS_DENIED,
      timestamp: new Date().toISOString(),
      correlationId: context?.correlationId || this.generateCorrelationId(),
      userId,
      tenantId: context?.tenantId,
      resourceType: resource,
      action,
      decision: 'DENY',
      reasonCode: 'ACCESS_DENIED',
      reason,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    };

    Log.minimal.warn(this.logger, 'Access denied logged', {
      method: 'logAccessDenied',
      audit: auditEntry,
      alertLevel: 'medium',
    });
  }

  /**
   * Log emergency access usage
   */
  logEmergencyAccess(
    userId: string,
    emergencyToken: string,
    resource: string,
    action: string,
    context?: {
      correlationId?: string;
      tenantId?: string;
      ipAddress?: string;
      userAgent?: string;
      approvalReference?: string;
    },
  ): void {
    const auditEntry: AuditLogEntry = {
      eventType: AuditEventType.EMERGENCY_ACCESS,
      timestamp: new Date().toISOString(),
      correlationId: context?.correlationId || this.generateCorrelationId(),
      userId,
      tenantId: context?.tenantId,
      resourceType: resource,
      action,
      decision: 'ALLOW',
      reasonCode: 'EMERGENCY_ACCESS_GRANTED',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      emergency: true,
      sensitiveOperation: true,
      metadata: {
        emergencyToken: this.maskToken(emergencyToken),
        approvalReference: context?.approvalReference,
      },
    };

    Log.minimal.warn(this.logger, 'Emergency access granted - AUDIT CRITICAL', {
      method: 'logEmergencyAccess',
      audit: auditEntry,
      alertLevel: 'critical',
      requiresReview: true,
    });
  }

  /**
   * Determine if an operation is sensitive based on resource and action
   */
  private isSensitiveOperation(input: OpaInput): boolean {
    const sensitiveResources = ['account', 'transaction', 'user', 'policy'];
    const sensitiveActions = ['delete', 'transfer', 'approve', 'admin'];

    return (
      sensitiveResources.includes(input.resource.type) ||
      sensitiveActions.includes(input.action.type) ||
      !!input.context.emergency_token ||
      !!input.context.approval_token
    );
  }

  /**
   * Get alert level based on audit entry characteristics
   */
  private getAlertLevel(
    entry: AuditLogEntry,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (entry.emergency) return 'critical';
    if (entry.sensitiveOperation && entry.decision === 'DENY') return 'high';
    if (entry.decision === 'DENY') return 'medium';
    if (entry.sensitiveOperation) return 'medium';
    return 'low';
  }

  /**
   * Generate correlation ID if not provided
   */
  private generateCorrelationId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Mask sensitive tokens for logging
   */
  private maskToken(token: string): string {
    if (token.length <= 8) return '***';
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
  }
}
