import { Injectable, Inject, Optional } from '@nestjs/common';
import { Logger } from 'pino';
import { APP_LOGGER } from '../../logging/logging.providers';
import { OpaInput, OpaDecision } from '../opa/opa.types';
import { IUserToken } from '../types/user-token.interface';
import {
  IClock,
  IIdGenerator,
  SystemClock,
  UuidGenerator,
  AuditConfig,
} from './audit.interfaces';
import { RedactionUtil } from './redaction.util';
import {
  TypedAuditLogEntry,
  SecurityObligation,
  SecurityReasonCode,
  AuditEventType,
} from './audit.types';

/**
 * Enhanced decision logging service for security audit trails
 * Production-ready with PII protection, sampling, and bounded logging
 */
@Injectable()
export class DecisionLoggerService {
  private readonly auditLogger: Logger;
  private readonly redactionUtil: RedactionUtil;
  private readonly config: Required<AuditConfig>;

  constructor(
    @Inject(APP_LOGGER) private readonly logger: Logger,
    @Optional()
    @Inject('CLOCK')
    private readonly clock: IClock = new SystemClock(),
    @Optional()
    @Inject('ID_GENERATOR')
    private readonly idGenerator: IIdGenerator = new UuidGenerator(),
    @Optional() @Inject('AUDIT_CONFIG') auditConfig?: AuditConfig,
  ) {
    // Create child logger with base bindings for security audit
    this.auditLogger = logger.child({
      component: 'DecisionLoggerService',
      auditType: 'security',
    });

    // Default configuration with production-safe defaults
    this.config = {
      sampling: {
        allowDecisions: 10, // 10% sampling for ALLOW decisions
        denyDecisions: 100, // Log all DENY decisions
        errorDecisions: 100, // Log all ERROR decisions
        ...(auditConfig?.sampling || {}),
      },
      limits: {
        maxReasonLength: 500,
        maxMetadataSize: 8192, // 8KB max
        maxPayloadSize: 16384, // 16KB max per log entry
        ...(auditConfig?.limits || {}),
      },
      redaction: {
        maskIpAddresses: true,
        maskUserAgents: true,
        maskEmails: true,
        preserveNetworkPrefix: true,
        ...(auditConfig?.redaction || {}),
      },
    };

    this.redactionUtil = new RedactionUtil(this.config.redaction);
  }

  /**
   * Log an authorization decision with full context, PII protection, and sampling
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
    const reasonCode = this.mapToSecurityReasonCode(decision);
    const isSampled = this.shouldSample(decision.allow ? 'ALLOW' : 'DENY');

    if (!isSampled) return;

    const auditEntry: TypedAuditLogEntry = {
      eventType: AuditEventType.AUTHORIZATION_DECISION,
      timestamp: this.clock.toISOString(),
      correlationId:
        context?.correlationId ||
        input.context.correlationId ||
        this.idGenerator.generateCorrelationId(),
      userId: input.subject.id,
      tenantId: input.subject.tenant || input.resource.tenant,
      resourceType: input.resource.type,
      resourceId: input.resource.id,
      action: `${input.action.type}.${input.action.name}`,
      decision: decision.allow ? 'ALLOW' : 'DENY',
      reasonCode,
      reason: decision.reason
        ? this.redactionUtil.truncateText(
            decision.reason,
            this.config.limits.maxReasonLength,
          )
        : undefined,
      obligations: this.mapObligations(decision.obligations || []),
      obligationsCount: decision.obligations?.length || 0,
      rolesCount: input.subject.roles?.length || 0,
      ipAddressHash: this.redactionUtil.redactIpAddress(context?.ipAddress),
      userAgentFamily: this.redactionUtil.redactUserAgent(context?.userAgent),
      metadata: this.redactionUtil.redactMetadata(
        input.context.metadata || {},
        this.config.limits.maxMetadataSize,
      ),
      policyVersion: decision.policy_version,
      emergency: context?.emergency || !!input.context.emergency_token,
      sensitiveOperation: this.isSensitiveOperation(input),
      requiresReview: context?.emergency || !!input.context.emergency_token,
      sampling: isSampled,
    };

    this.logWithBindings(auditEntry);
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
    const auditEntry: TypedAuditLogEntry = {
      eventType: AuditEventType.AUTHENTICATION_SUCCESS,
      timestamp: this.clock.toISOString(),
      correlationId:
        context?.correlationId || this.idGenerator.generateCorrelationId(),
      userId: user.sub,
      tenantId: user.tenant,
      decision: 'ALLOW',
      reasonCode: SecurityReasonCode.AUTHENTICATION_SUCCESS,
      ipAddressHash: this.redactionUtil.redactIpAddress(context?.ipAddress),
      userAgentFamily: this.redactionUtil.redactUserAgent(context?.userAgent),
      rolesCount: user.roles?.length || 0,
      metadata: this.redactionUtil.redactMetadata(
        {
          authMethod: context?.authMethod,
          permissionsCount: user.permissions?.length || 0,
        },
        this.config.limits.maxMetadataSize,
      ),
    };

    this.logWithBindings(auditEntry);
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
    const auditEntry: TypedAuditLogEntry = {
      eventType: AuditEventType.AUTHENTICATION_FAILURE,
      timestamp: this.clock.toISOString(),
      correlationId:
        context?.correlationId || this.idGenerator.generateCorrelationId(),
      userId: context?.attemptedUserId,
      decision: 'DENY',
      reasonCode: SecurityReasonCode.AUTHENTICATION_FAILED,
      reason: this.redactionUtil.truncateText(
        reason,
        this.config.limits.maxReasonLength,
      ),
      ipAddressHash: this.redactionUtil.redactIpAddress(context?.ipAddress),
      userAgentFamily: this.redactionUtil.redactUserAgent(context?.userAgent),
      metadata: this.redactionUtil.redactMetadata(
        {
          authMethod: context?.authMethod,
        },
        this.config.limits.maxMetadataSize,
      ),
    };

    this.logWithBindings(auditEntry);
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
    const auditEntry: TypedAuditLogEntry = {
      eventType: AuditEventType.ACCESS_DENIED,
      timestamp: this.clock.toISOString(),
      correlationId:
        context?.correlationId || this.idGenerator.generateCorrelationId(),
      userId,
      tenantId: context?.tenantId,
      resourceType: resource,
      action,
      decision: 'DENY',
      reasonCode: SecurityReasonCode.ACCESS_DENIED,
      reason: this.redactionUtil.truncateText(
        reason,
        this.config.limits.maxReasonLength,
      ),
      ipAddressHash: this.redactionUtil.redactIpAddress(context?.ipAddress),
      userAgentFamily: this.redactionUtil.redactUserAgent(context?.userAgent),
    };

    this.logWithBindings(auditEntry);
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
    const auditEntry: TypedAuditLogEntry = {
      eventType: AuditEventType.EMERGENCY_ACCESS,
      timestamp: this.clock.toISOString(),
      correlationId:
        context?.correlationId || this.idGenerator.generateCorrelationId(),
      userId,
      tenantId: context?.tenantId,
      resourceType: resource,
      action,
      decision: 'ALLOW',
      reasonCode: SecurityReasonCode.EMERGENCY_ACCESS_GRANTED,
      ipAddressHash: this.redactionUtil.redactIpAddress(context?.ipAddress),
      userAgentFamily: this.redactionUtil.redactUserAgent(context?.userAgent),
      emergency: true,
      sensitiveOperation: true,
      requiresReview: true,
      metadata: this.redactionUtil.redactMetadata(
        {
          emergencyToken: this.redactionUtil.maskToken(emergencyToken),
          approvalReference: context?.approvalReference,
        },
        this.config.limits.maxMetadataSize,
      ),
    };

    this.logWithBindings(auditEntry);
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
   * Map OPA decision to security reason code
   */
  private mapToSecurityReasonCode(decision: OpaDecision): SecurityReasonCode {
    if (decision.allow) {
      return decision.obligations && decision.obligations.length > 0
        ? SecurityReasonCode.CONDITIONAL_ALLOW
        : SecurityReasonCode.ALLOW;
    }

    // Map common OPA reason codes to security codes
    switch (decision.reason_code) {
      case 'INSUFFICIENT_PERMISSIONS':
        return SecurityReasonCode.INSUFFICIENT_PERMISSIONS;
      case 'INVALID_RESOURCE':
        return SecurityReasonCode.INVALID_RESOURCE;
      case 'INVALID_ACTION':
        return SecurityReasonCode.INVALID_ACTION;
      case 'TENANT_MISMATCH':
        return SecurityReasonCode.TENANT_MISMATCH;
      case 'TIME_RESTRICTION':
        return SecurityReasonCode.TIME_RESTRICTION;
      case 'LOCATION_RESTRICTION':
        return SecurityReasonCode.LOCATION_RESTRICTION;
      case 'POLICY_ERROR':
        return SecurityReasonCode.POLICY_ERROR;
      case 'SERVICE_UNAVAILABLE':
        return SecurityReasonCode.SERVICE_UNAVAILABLE;
      default:
        return SecurityReasonCode.DENY;
    }
  }

  /**
   * Map unknown obligations to typed security obligations
   */
  private mapObligations(
    obligations: readonly unknown[],
  ): readonly SecurityObligation[] {
    return obligations
      .map((obligation): SecurityObligation | null => {
        if (typeof obligation === 'object' && obligation !== null) {
          const obj = obligation as Record<string, unknown>;

          if (obj.type === 'mask' && Array.isArray(obj.fields)) {
            return { type: 'mask', fields: obj.fields as string[] };
          }

          if (obj.type === 'redact' && Array.isArray(obj.fields)) {
            return { type: 'redact', fields: obj.fields as string[] };
          }

          if (obj.type === 'limit' && typeof obj.count === 'number') {
            return { type: 'limit', count: obj.count };
          }

          if (
            obj.type === 'audit' &&
            (obj.level === 'standard' || obj.level === 'enhanced')
          ) {
            return { type: 'audit', level: obj.level };
          }

          if (obj.type === 'approval' && typeof obj.required === 'boolean') {
            return { type: 'approval', required: obj.required };
          }
        }

        // Default to audit obligation for unknown types
        return { type: 'audit', level: 'standard' };
      })
      .filter(
        (obligation): obligation is SecurityObligation => obligation !== null,
      );
  }

  /**
   * Determine if decision should be sampled
   */
  private shouldSample(decisionType: 'ALLOW' | 'DENY' | 'ERROR'): boolean {
    const rate =
      this.config.sampling[
        `${decisionType.toLowerCase()}Decisions` as keyof typeof this.config.sampling
      ] || 100;
    return Math.random() * 100 < rate;
  }

  /**
   * Log audit entry with proper bindings and alert levels
   */
  private logWithBindings(entry: TypedAuditLogEntry): void {
    const alertLevel = this.getAlertLevel(entry);
    const logLevel = this.getLogLevel(entry);

    // Create per-entry bindings for better querying
    const entryLogger = this.auditLogger.child({
      correlationId: entry.correlationId,
      tenantId: entry.tenantId,
      userId: entry.userId,
      eventType: entry.eventType,
    });

    const logData = {
      method: 'audit',
      audit: entry,
      alertLevel,
      requiresReview: entry.requiresReview,
    };

    switch (logLevel) {
      case 'error':
        entryLogger.error(logData, this.getLogMessage(entry));
        break;
      case 'warn':
        entryLogger.warn(logData, this.getLogMessage(entry));
        break;
      case 'info':
      default:
        entryLogger.info(logData, this.getLogMessage(entry));
        break;
    }
  }

  /**
   * Get alert level based on audit entry characteristics
   */
  private getAlertLevel(
    entry: TypedAuditLogEntry,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (entry.emergency) return 'critical';
    if (entry.sensitiveOperation && entry.decision === 'DENY') return 'high';
    if (entry.decision === 'DENY') return 'medium';
    if (entry.sensitiveOperation) return 'medium';
    return 'low';
  }

  /**
   * Get log level based on audit entry
   */
  private getLogLevel(entry: TypedAuditLogEntry): 'info' | 'warn' | 'error' {
    if (entry.emergency || entry.decision === 'ERROR') return 'error';
    if (entry.decision === 'DENY' || entry.sensitiveOperation) return 'warn';
    return 'info';
  }

  /**
   * Generate human-readable log message
   */
  private getLogMessage(entry: TypedAuditLogEntry): string {
    switch (entry.eventType) {
      case AuditEventType.AUTHORIZATION_DECISION:
        return `Authorization ${entry.decision} for ${entry.action} on ${entry.resourceType}`;
      case AuditEventType.AUTHENTICATION_SUCCESS:
        return `Authentication success for user ${entry.userId}`;
      case AuditEventType.AUTHENTICATION_FAILURE:
        return `Authentication failure: ${entry.reason}`;
      case AuditEventType.ACCESS_DENIED:
        return `Access denied for ${entry.action} on ${entry.resourceType}`;
      case AuditEventType.EMERGENCY_ACCESS:
        return `CRITICAL: Emergency access granted for ${entry.action} on ${entry.resourceType}`;
      default:
        return `Security event: ${entry.eventType}`;
    }
  }
}
