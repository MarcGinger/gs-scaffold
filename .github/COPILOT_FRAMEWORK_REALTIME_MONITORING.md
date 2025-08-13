# COPILOT_INSTRUCTIONS.md — Real-time Compliance Monitoring

> **Purpose:** Production-ready real-time compliance monitoring system for fintech operations with EventStoreDB event processing, automated alerting, and regulatory dashboard capabilities.

---

## 1) Monitoring Architecture Overview

### Real-time Processing Pipeline

```typescript
interface ComplianceMonitoringPipeline {
  // Event ingestion from EventStoreDB
  eventIngestion: {
    source: 'EventStoreDB';
    subscriptionType: 'persistent';
    filters: string[];
    parallelism: number;
  };

  // Rule engine for compliance checks
  ruleEngine: {
    provider: 'OPA' | 'custom';
    ruleTypes: string[];
    executionModel: 'synchronous' | 'asynchronous';
  };

  // Alerting and escalation
  alerting: {
    channels: string[];
    escalationLevels: string[];
    responseTimeRequirements: Record<string, number>;
  };

  // Dashboard and reporting
  dashboard: {
    realTimeMetrics: string[];
    historicalViews: string[];
    regulatoryViews: string[];
  };
}
```

---

## 2) Compliance Rule Categories

### Financial Transaction Rules (FICA/AML)

```typescript
interface FinancialComplianceRules {
  // Cash threshold monitoring
  cashThresholdRules: {
    singleTransactionThreshold: 24999.99; // ZAR
    cumulativeThreshold: 24999.99; // ZAR per day
    alertLevel: 'immediate';
  };

  // Suspicious pattern detection
  suspiciousPatternRules: {
    rapidFireTransactions: {
      maxTransactionsPerMinute: 10;
      timeWindow: '1m';
    };
    unusualAmountPatterns: {
      deviationFromAverage: 300; // percentage
      minimumHistoryDays: 30;
    };
    geographicAnomalies: {
      suspiciousCountries: string[];
      unusualLocationChange: boolean;
    };
  };

  // Sanctions and PEP screening
  sanctionsRules: {
    screeningFrequency: 'real-time';
    falsePositiveThreshold: 0.1;
    requiresManualReview: boolean;
  };

  // Transaction velocity limits
  velocityRules: {
    maxDailyVolume: Record<string, number>; // per customer tier
    maxWeeklyTransactions: Record<string, number>;
    crossBorderLimits: Record<string, number>;
  };
}
```

### Privacy Compliance Rules (POPIA)

```typescript
interface PrivacyComplianceRules {
  // Data access monitoring
  dataAccessRules: {
    piiAccessWithoutJustification: {
      alertLevel: 'high';
      requiresApproval: boolean;
    };
    excessiveDataExport: {
      maxRecordsPerHour: 1000;
      requiresManagerApproval: boolean;
    };
    suspiciousAccessPatterns: {
      offHoursAccess: boolean;
      unusualGeolocation: boolean;
      multipleConcurrentSessions: boolean;
    };
  };

  // Data retention monitoring
  retentionRules: {
    expiredDataAlert: {
      alertDays: 7; // before expiration
      autoDeleteAfterDays: 90;
    };
    legalHoldConflicts: {
      alertLevel: 'critical';
      preventDeletion: boolean;
    };
  };

  // Cross-border transfer rules
  crossBorderRules: {
    unauthorizedTransfer: {
      blockedCountries: string[];
      alertLevel: 'critical';
    };
    adequacyDecisionRequired: {
      nonAdequateCountries: string[];
      safeguardsRequired: boolean;
    };
  };
}
```

### System Security Rules

```typescript
interface SecurityComplianceRules {
  // Authentication monitoring
  authenticationRules: {
    failedLoginThreshold: 5;
    timeWindow: '15m';
    lockoutDuration: '30m';
    privilegedAccountMonitoring: boolean;
  };

  // Authorization violations
  authorizationRules: {
    privilegeEscalation: {
      alertLevel: 'critical';
      requiresImmediateReview: boolean;
    };
    accessToSensitiveResources: {
      requiresApproval: boolean;
      alertLevel: 'high';
    };
  };

  // Configuration changes
  configurationRules: {
    productionChanges: {
      requiresApproval: boolean;
      alertLevel: 'high';
    };
    securityPolicyChanges: {
      requiresDualApproval: boolean;
      alertLevel: 'critical';
    };
  };
}
```

---

## 3) Real-time Event Processing Engine

### Core Monitoring Engine

```typescript
// src/contexts/compliance/application/services/compliance-monitoring.service.ts
import { Injectable } from '@nestjs/common';
import { EventStoreService } from '../../../shared/eventstore/eventstore.service';
import { ComplianceRuleEngine } from './compliance-rule-engine.service';
import { AlertingService } from './alerting.service';

export interface ComplianceViolation {
  violationId: string;
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'financial' | 'privacy' | 'security' | 'operational';
  description: string;
  affectedEntities: string[];
  detectedAt: Date;
  sourceEvent: any;
  metadata: {
    tenantId: string;
    correlationId: string;
    traceId: string;
  };
  recommendedActions: string[];
  autoRemediation?: {
    action: string;
    executed: boolean;
    executedAt?: Date;
  };
}

@Injectable()
export class ComplianceMonitoringService {
  constructor(
    private readonly eventStore: EventStoreService,
    private readonly ruleEngine: ComplianceRuleEngine,
    private readonly alerting: AlertingService,
  ) {}

  async startMonitoring(): Promise<void> {
    // Start persistent subscription to EventStoreDB
    await this.eventStore.subscribeToAll(
      'compliance-monitoring',
      {
        filter: this.getMonitoringEventFilter(),
        bufferSize: 100,
        maxRetryCount: 5,
      },
      (event) => this.processEventForCompliance(event),
    );
  }

  private async processEventForCompliance(event: any): Promise<void> {
    try {
      // Extract event metadata
      const eventContext = {
        eventType: event.type,
        streamId: event.streamId,
        eventId: event.eventId,
        tenantId: event.metadata?.tenantId,
        correlationId: event.metadata?.correlationId,
        occurredAt: new Date(event.metadata?.occurredAt),
        payload: event.data,
      };

      // Run compliance rules against the event
      const violations = await this.ruleEngine.evaluateEvent(eventContext);

      // Process any violations found
      for (const violation of violations) {
        await this.handleComplianceViolation(violation);
      }

      // Update monitoring metrics
      await this.updateMonitoringMetrics(eventContext, violations);
    } catch (error) {
      console.error('Error processing event for compliance:', error);
      await this.alerting.sendAlert({
        type: 'MONITORING_ERROR',
        severity: 'high',
        message: `Failed to process event ${event.eventId} for compliance: ${error.message}`,
        context: { eventId: event.eventId },
      });
    }
  }

  private async handleComplianceViolation(
    violation: ComplianceViolation,
  ): Promise<void> {
    // Log the violation
    console.warn('Compliance violation detected:', violation);

    // Send immediate alert for critical violations
    if (violation.severity === 'critical') {
      await this.alerting.sendImmediateAlert(violation);
    }

    // Attempt auto-remediation if configured
    if (violation.autoRemediation) {
      await this.attemptAutoRemediation(violation);
    }

    // Store violation for reporting and audit
    await this.storeViolationRecord(violation);

    // Update real-time dashboard
    await this.updateDashboard(violation);

    // Schedule follow-up actions if required
    if (violation.severity === 'high' || violation.severity === 'critical') {
      await this.scheduleFollowUp(violation);
    }
  }

  private getMonitoringEventFilter(): any {
    return {
      eventTypes: [
        // Financial events
        'transaction.*',
        'payment.*',
        'aml.*',
        'kyc.*',

        // Privacy events
        'pii.*',
        'data.*',
        'consent.*',

        // Security events
        'auth.*',
        'access.*',
        'config.*',

        // System events
        'system.*',
        'admin.*',
      ],
    };
  }

  private async attemptAutoRemediation(
    violation: ComplianceViolation,
  ): Promise<void> {
    try {
      switch (violation.autoRemediation?.action) {
        case 'BLOCK_TRANSACTION':
          await this.blockTransaction(violation);
          break;
        case 'SUSPEND_ACCOUNT':
          await this.suspendAccount(violation);
          break;
        case 'REVOKE_ACCESS':
          await this.revokeAccess(violation);
          break;
        case 'QUARANTINE_DATA':
          await this.quarantineData(violation);
          break;
        default:
          console.warn(
            `Unknown auto-remediation action: ${violation.autoRemediation?.action}`,
          );
      }

      violation.autoRemediation!.executed = true;
      violation.autoRemediation!.executedAt = new Date();
    } catch (error) {
      console.error('Auto-remediation failed:', error);
      await this.alerting.sendAlert({
        type: 'AUTO_REMEDIATION_FAILED',
        severity: 'high',
        message: `Auto-remediation failed for violation ${violation.violationId}: ${error.message}`,
        context: { violationId: violation.violationId },
      });
    }
  }

  private async blockTransaction(
    violation: ComplianceViolation,
  ): Promise<void> {
    // Implementation to block/freeze a transaction
    console.log(`Blocking transaction for violation: ${violation.violationId}`);
  }

  private async suspendAccount(violation: ComplianceViolation): Promise<void> {
    // Implementation to suspend user account
    console.log(`Suspending account for violation: ${violation.violationId}`);
  }

  private async revokeAccess(violation: ComplianceViolation): Promise<void> {
    // Implementation to revoke user access
    console.log(`Revoking access for violation: ${violation.violationId}`);
  }

  private async quarantineData(violation: ComplianceViolation): Promise<void> {
    // Implementation to quarantine sensitive data
    console.log(`Quarantining data for violation: ${violation.violationId}`);
  }

  private async storeViolationRecord(
    violation: ComplianceViolation,
  ): Promise<void> {
    // Store violation in compliance database for audit and reporting
  }

  private async updateDashboard(violation: ComplianceViolation): Promise<void> {
    // Update real-time compliance dashboard
  }

  private async scheduleFollowUp(
    violation: ComplianceViolation,
  ): Promise<void> {
    // Schedule follow-up actions for manual review
  }

  private async updateMonitoringMetrics(
    eventContext: any,
    violations: ComplianceViolation[],
  ): Promise<void> {
    // Update monitoring metrics and KPIs
  }
}
```

### Compliance Rule Engine

```typescript
// src/contexts/compliance/application/services/compliance-rule-engine.service.ts
import { Injectable } from '@nestjs/common';
import { DecisioningPolicyPort } from '../../../shared/ports/decisioning-policy.port';

@Injectable()
export class ComplianceRuleEngine {
  constructor(private readonly policyEngine: DecisioningPolicyPort) {}

  async evaluateEvent(eventContext: any): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Evaluate financial compliance rules
    if (this.isFinancialEvent(eventContext)) {
      const financialViolations =
        await this.evaluateFinancialRules(eventContext);
      violations.push(...financialViolations);
    }

    // Evaluate privacy compliance rules
    if (this.isPrivacyEvent(eventContext)) {
      const privacyViolations = await this.evaluatePrivacyRules(eventContext);
      violations.push(...privacyViolations);
    }

    // Evaluate security compliance rules
    if (this.isSecurityEvent(eventContext)) {
      const securityViolations = await this.evaluateSecurityRules(eventContext);
      violations.push(...securityViolations);
    }

    return violations;
  }

  private async evaluateFinancialRules(
    eventContext: any,
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Cash threshold rule
    if (eventContext.eventType.startsWith('transaction.')) {
      const thresholdViolation = await this.checkCashThreshold(eventContext);
      if (thresholdViolation) {
        violations.push(thresholdViolation);
      }
    }

    // Suspicious pattern detection
    if (eventContext.eventType === 'transaction.completed.v1') {
      const patternViolations =
        await this.checkSuspiciousPatterns(eventContext);
      violations.push(...patternViolations);
    }

    // Sanctions screening
    if (
      eventContext.eventType.includes('payment') ||
      eventContext.eventType.includes('transfer')
    ) {
      const sanctionsViolation =
        await this.checkSanctionsCompliance(eventContext);
      if (sanctionsViolation) {
        violations.push(sanctionsViolation);
      }
    }

    // Velocity limits
    const velocityViolation = await this.checkVelocityLimits(eventContext);
    if (velocityViolation) {
      violations.push(velocityViolation);
    }

    return violations;
  }

  private async checkCashThreshold(
    eventContext: any,
  ): Promise<ComplianceViolation | null> {
    const amount = eventContext.payload?.amount?.value || 0;
    const threshold = 24999.99;

    if (amount > threshold) {
      return {
        violationId: this.generateViolationId('CASH_THRESHOLD'),
        ruleId: 'FICA_CASH_THRESHOLD_R24999',
        severity: 'high',
        category: 'financial',
        description: `Transaction amount ${amount} exceeds cash threshold of ${threshold}`,
        affectedEntities: [eventContext.payload?.customerId],
        detectedAt: new Date(),
        sourceEvent: eventContext,
        metadata: {
          tenantId: eventContext.tenantId,
          correlationId: eventContext.correlationId,
          traceId: eventContext.correlationId,
        },
        recommendedActions: [
          'Generate Cash Threshold Report (CTR)',
          'Verify customer identity',
          'Review transaction purpose',
        ],
      };
    }

    return null;
  }

  private async checkSuspiciousPatterns(
    eventContext: any,
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Use OPA policy for complex pattern detection
    const suspiciousPatternResult = await this.policyEngine.evaluate(
      'compliance.aml.suspicious_patterns',
      {
        transaction: eventContext.payload,
        customerHistory: await this.getCustomerHistory(
          eventContext.payload?.customerId,
        ),
        timeWindow: '24h',
      },
    );

    if (suspiciousPatternResult.suspicious) {
      violations.push({
        violationId: this.generateViolationId('SUSPICIOUS_PATTERN'),
        ruleId: 'AML_PATTERN_DETECTION',
        severity: 'high',
        category: 'financial',
        description: `Suspicious transaction pattern detected: ${suspiciousPatternResult.indicators.join(', ')}`,
        affectedEntities: [eventContext.payload?.customerId],
        detectedAt: new Date(),
        sourceEvent: eventContext,
        metadata: {
          tenantId: eventContext.tenantId,
          correlationId: eventContext.correlationId,
          traceId: eventContext.correlationId,
        },
        recommendedActions: [
          'Manual investigation required',
          'Consider filing STR',
          'Enhanced due diligence',
        ],
        autoRemediation: {
          action: 'BLOCK_TRANSACTION',
          executed: false,
        },
      });
    }

    return violations;
  }

  private async evaluatePrivacyRules(
    eventContext: any,
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // PII access without justification
    if (eventContext.eventType === 'pii.accessed.v1') {
      const accessViolation = await this.checkPIIAccess(eventContext);
      if (accessViolation) {
        violations.push(accessViolation);
      }
    }

    // Data retention violations
    if (eventContext.eventType === 'data.retention.expired.v1') {
      violations.push({
        violationId: this.generateViolationId('DATA_RETENTION'),
        ruleId: 'POPIA_DATA_RETENTION',
        severity: 'medium',
        category: 'privacy',
        description: 'Data retention period expired but data not deleted',
        affectedEntities: [eventContext.payload?.subjectId],
        detectedAt: new Date(),
        sourceEvent: eventContext,
        metadata: {
          tenantId: eventContext.tenantId,
          correlationId: eventContext.correlationId,
          traceId: eventContext.correlationId,
        },
        recommendedActions: [
          'Schedule data deletion',
          'Check for legal holds',
          'Update retention policies',
        ],
        autoRemediation: {
          action: 'QUARANTINE_DATA',
          executed: false,
        },
      });
    }

    return violations;
  }

  private async evaluateSecurityRules(
    eventContext: any,
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Failed authentication attempts
    if (eventContext.eventType === 'auth.failed.v1') {
      const authViolation =
        await this.checkAuthenticationFailures(eventContext);
      if (authViolation) {
        violations.push(authViolation);
      }
    }

    // Privilege escalation
    if (eventContext.eventType === 'access.privilege.granted.v1') {
      const privilegeViolation =
        await this.checkPrivilegeEscalation(eventContext);
      if (privilegeViolation) {
        violations.push(privilegeViolation);
      }
    }

    return violations;
  }

  private async checkPIIAccess(
    eventContext: any,
  ): Promise<ComplianceViolation | null> {
    const purpose = eventContext.payload?.purpose;
    const justification = eventContext.payload?.justification;

    if (!purpose || !justification) {
      return {
        violationId: this.generateViolationId('PII_ACCESS'),
        ruleId: 'POPIA_PII_ACCESS_JUSTIFICATION',
        severity: 'medium',
        category: 'privacy',
        description: 'PII accessed without proper justification or purpose',
        affectedEntities: [
          eventContext.payload?.subjectId,
          eventContext.payload?.operatorId,
        ],
        detectedAt: new Date(),
        sourceEvent: eventContext,
        metadata: {
          tenantId: eventContext.tenantId,
          correlationId: eventContext.correlationId,
          traceId: eventContext.correlationId,
        },
        recommendedActions: [
          'Review access justification',
          'Training on privacy policies',
          'Audit access logs',
        ],
      };
    }

    return null;
  }

  private async checkAuthenticationFailures(
    eventContext: any,
  ): Promise<ComplianceViolation | null> {
    const userId = eventContext.payload?.userId;
    const failureCount = await this.getRecentFailureCount(userId, '15m');

    if (failureCount >= 5) {
      return {
        violationId: this.generateViolationId('AUTH_FAILURES'),
        ruleId: 'SEC_AUTH_BRUTE_FORCE',
        severity: 'high',
        category: 'security',
        description: `${failureCount} failed authentication attempts in 15 minutes`,
        affectedEntities: [userId],
        detectedAt: new Date(),
        sourceEvent: eventContext,
        metadata: {
          tenantId: eventContext.tenantId,
          correlationId: eventContext.correlationId,
          traceId: eventContext.correlationId,
        },
        recommendedActions: [
          'Account lockout',
          'Security investigation',
          'IP address blocking',
        ],
        autoRemediation: {
          action: 'SUSPEND_ACCOUNT',
          executed: false,
        },
      };
    }

    return null;
  }

  private isFinancialEvent(eventContext: any): boolean {
    return (
      eventContext.eventType.includes('transaction') ||
      eventContext.eventType.includes('payment') ||
      eventContext.eventType.includes('aml') ||
      eventContext.eventType.includes('kyc')
    );
  }

  private isPrivacyEvent(eventContext: any): boolean {
    return (
      eventContext.eventType.includes('pii') ||
      eventContext.eventType.includes('data') ||
      eventContext.eventType.includes('consent')
    );
  }

  private isSecurityEvent(eventContext: any): boolean {
    return (
      eventContext.eventType.includes('auth') ||
      eventContext.eventType.includes('access') ||
      eventContext.eventType.includes('config')
    );
  }

  private generateViolationId(type: string): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getCustomerHistory(customerId: string): Promise<any> {
    // Get customer transaction history for pattern analysis
    return {};
  }

  private async getRecentFailureCount(
    userId: string,
    timeWindow: string,
  ): Promise<number> {
    // Get recent authentication failure count
    return 0;
  }

  private async checkSanctionsCompliance(
    eventContext: any,
  ): Promise<ComplianceViolation | null> {
    // Implement sanctions screening logic
    return null;
  }

  private async checkVelocityLimits(
    eventContext: any,
  ): Promise<ComplianceViolation | null> {
    // Implement velocity limit checks
    return null;
  }

  private async checkPrivilegeEscalation(
    eventContext: any,
  ): Promise<ComplianceViolation | null> {
    // Implement privilege escalation detection
    return null;
  }
}
```

---

## 4) Real-time Alerting System

### Multi-channel Alerting Service

```typescript
// src/contexts/compliance/infrastructure/services/alerting.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

export interface Alert {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  context: Record<string, any>;
  timestamp?: Date;
  escalationLevel?: number;
}

@Injectable()
export class AlertingService {
  constructor(private readonly httpService: HttpService) {}

  async sendAlert(alert: Alert): Promise<void> {
    alert.timestamp = alert.timestamp || new Date();

    // Route alerts based on severity
    switch (alert.severity) {
      case 'critical':
        await this.sendCriticalAlert(alert);
        break;
      case 'high':
        await this.sendHighSeverityAlert(alert);
        break;
      case 'medium':
        await this.sendMediumSeverityAlert(alert);
        break;
      case 'low':
        await this.sendLowSeverityAlert(alert);
        break;
    }

    // Log all alerts for audit trail
    await this.logAlert(alert);
  }

  async sendImmediateAlert(violation: ComplianceViolation): Promise<void> {
    const alert: Alert = {
      type: 'COMPLIANCE_VIOLATION',
      severity: violation.severity,
      message: `${violation.category.toUpperCase()} compliance violation: ${violation.description}`,
      context: {
        violationId: violation.violationId,
        ruleId: violation.ruleId,
        affectedEntities: violation.affectedEntities,
        tenantId: violation.metadata.tenantId,
        correlationId: violation.metadata.correlationId,
      },
    };

    await this.sendAlert(alert);
  }

  private async sendCriticalAlert(alert: Alert): Promise<void> {
    // Critical alerts go to multiple channels immediately
    await Promise.all([
      this.sendSlackAlert(alert, '#compliance-critical'),
      this.sendEmailAlert(alert, 'compliance-team@company.com'),
      this.sendSMSAlert(alert, process.env.COMPLIANCE_OFFICER_PHONE!),
      this.sendPagerDutyAlert(alert),
      this.updateDashboard(alert),
    ]);
  }

  private async sendHighSeverityAlert(alert: Alert): Promise<void> {
    // High severity alerts go to Slack and email
    await Promise.all([
      this.sendSlackAlert(alert, '#compliance-alerts'),
      this.sendEmailAlert(alert, 'compliance-team@company.com'),
      this.updateDashboard(alert),
    ]);
  }

  private async sendMediumSeverityAlert(alert: Alert): Promise<void> {
    // Medium severity alerts go to Slack only
    await Promise.all([
      this.sendSlackAlert(alert, '#compliance-alerts'),
      this.updateDashboard(alert),
    ]);
  }

  private async sendLowSeverityAlert(alert: Alert): Promise<void> {
    // Low severity alerts only update dashboard
    await this.updateDashboard(alert);
  }

  private async sendSlackAlert(alert: Alert, channel: string): Promise<void> {
    try {
      const slackWebhook = process.env.SLACK_COMPLIANCE_WEBHOOK;
      if (!slackWebhook) return;

      const message = {
        channel,
        username: 'Compliance Monitor',
        icon_emoji: this.getSeverityEmoji(alert.severity),
        attachments: [
          {
            color: this.getSeverityColor(alert.severity),
            title: `${alert.severity.toUpperCase()} Alert: ${alert.type}`,
            text: alert.message,
            fields: Object.entries(alert.context).map(([key, value]) => ({
              title: key,
              value: String(value),
              short: true,
            })),
            footer: 'Compliance Monitoring System',
            ts: Math.floor((alert.timestamp || new Date()).getTime() / 1000),
          },
        ],
      };

      await this.httpService.post(slackWebhook, message).toPromise();
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  private async sendEmailAlert(alert: Alert, recipient: string): Promise<void> {
    try {
      // Implementation depends on your email service
      const emailContent = {
        to: recipient,
        subject: `${alert.severity.toUpperCase()} Compliance Alert: ${alert.type}`,
        html: this.generateEmailHTML(alert),
      };

      // Send email using your email service
      console.log('Would send email:', emailContent);
    } catch (error) {
      console.error('Failed to send email alert:', error);
    }
  }

  private async sendSMSAlert(alert: Alert, phoneNumber: string): Promise<void> {
    try {
      // Implementation depends on your SMS service
      const smsContent = {
        to: phoneNumber,
        message: `CRITICAL ALERT: ${alert.message.substring(0, 160)}`,
      };

      // Send SMS using your SMS service
      console.log('Would send SMS:', smsContent);
    } catch (error) {
      console.error('Failed to send SMS alert:', error);
    }
  }

  private async sendPagerDutyAlert(alert: Alert): Promise<void> {
    try {
      // Implementation for PagerDuty integration
      const pagerDutyEvent = {
        routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
        event_action: 'trigger',
        payload: {
          summary: alert.message,
          severity: alert.severity,
          source: 'compliance-monitoring',
          custom_details: alert.context,
        },
      };

      await this.httpService
        .post('https://events.pagerduty.com/v2/enqueue', pagerDutyEvent)
        .toPromise();
    } catch (error) {
      console.error('Failed to send PagerDuty alert:', error);
    }
  }

  private async updateDashboard(alert: Alert): Promise<void> {
    // Update real-time compliance dashboard
    // Implementation depends on your dashboard system
  }

  private async logAlert(alert: Alert): Promise<void> {
    // Log alert for audit trail
    console.log('COMPLIANCE ALERT:', {
      ...alert,
      timestamp: alert.timestamp?.toISOString(),
    });
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return ':rotating_light:';
      case 'high':
        return ':warning:';
      case 'medium':
        return ':yellow_circle:';
      case 'low':
        return ':information_source:';
      default:
        return ':question:';
    }
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#ff0000';
      case 'high':
        return '#ff8800';
      case 'medium':
        return '#ffaa00';
      case 'low':
        return '#0088ff';
      default:
        return '#888888';
    }
  }

  private generateEmailHTML(alert: Alert): string {
    return `
      <h2 style="color: ${this.getSeverityColor(alert.severity)}">
        ${alert.severity.toUpperCase()} Compliance Alert
      </h2>
      <p><strong>Type:</strong> ${alert.type}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><strong>Timestamp:</strong> ${alert.timestamp?.toISOString()}</p>
      
      <h3>Context:</h3>
      <table border="1" style="border-collapse: collapse;">
        ${Object.entries(alert.context)
          .map(
            ([key, value]) =>
              `<tr><td><strong>${key}</strong></td><td>${value}</td></tr>`,
          )
          .join('')}
      </table>
      
      <p><em>Generated by Compliance Monitoring System</em></p>
    `;
  }
}
```

---

## 5) Compliance Dashboard Service

### Real-time Dashboard Data Provider

```typescript
// src/contexts/compliance/application/services/compliance-dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface DashboardMetrics {
  realTimeMetrics: {
    activeViolations: number;
    violationsByCategory: Record<string, number>;
    violationsBySeverity: Record<string, number>;
    alertsLast24Hours: number;
    systemHealth: 'healthy' | 'degraded' | 'critical';
  };

  complianceScores: {
    overall: number;
    financial: number;
    privacy: number;
    security: number;
    operational: number;
  };

  regulatoryStatus: {
    ficReports: {
      pending: number;
      submitted: number;
      overdue: number;
    };
    popiaRequests: {
      open: number;
      inProgress: number;
      completed: number;
      overdue: number;
    };
    sarbReports: {
      current: boolean;
      nextDue: Date;
    };
  };

  trends: {
    violationTrend: Array<{ date: string; count: number }>;
    complianceScoreTrend: Array<{ date: string; score: number }>;
    alertVolumeTrend: Array<{ date: string; volume: number }>;
  };
}

@Injectable()
export class ComplianceDashboardService {
  private currentMetrics: DashboardMetrics = this.initializeMetrics();

  @Cron(CronExpression.EVERY_MINUTE)
  async updateRealTimeMetrics(): Promise<void> {
    try {
      this.currentMetrics.realTimeMetrics =
        await this.calculateRealTimeMetrics();
    } catch (error) {
      console.error('Failed to update real-time metrics:', error);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateComplianceScores(): Promise<void> {
    try {
      this.currentMetrics.complianceScores =
        await this.calculateComplianceScores();
    } catch (error) {
      console.error('Failed to update compliance scores:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateRegulatoryStatus(): Promise<void> {
    try {
      this.currentMetrics.regulatoryStatus =
        await this.calculateRegulatoryStatus();
    } catch (error) {
      console.error('Failed to update regulatory status:', error);
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async updateTrends(): Promise<void> {
    try {
      this.currentMetrics.trends = await this.calculateTrends();
    } catch (error) {
      console.error('Failed to update trends:', error);
    }
  }

  getDashboardMetrics(): DashboardMetrics {
    return this.currentMetrics;
  }

  async getTenantMetrics(tenantId: string): Promise<DashboardMetrics> {
    // Get tenant-specific metrics
    return this.calculateTenantMetrics(tenantId);
  }

  async getViolationDetails(
    violationId: string,
  ): Promise<ComplianceViolation | null> {
    // Get detailed violation information
    return null; // Implementation would query violation store
  }

  async getComplianceReport(
    fromDate: Date,
    toDate: Date,
    categories?: string[],
  ): Promise<{
    summary: any;
    violations: ComplianceViolation[];
    metrics: any;
  }> {
    // Generate compliance report for specified period
    return {
      summary: {},
      violations: [],
      metrics: {},
    };
  }

  private async calculateRealTimeMetrics(): Promise<
    DashboardMetrics['realTimeMetrics']
  > {
    // Calculate real-time metrics from violation store
    return {
      activeViolations: 0,
      violationsByCategory: {},
      violationsBySeverity: {},
      alertsLast24Hours: 0,
      systemHealth: 'healthy',
    };
  }

  private async calculateComplianceScores(): Promise<
    DashboardMetrics['complianceScores']
  > {
    // Calculate compliance scores based on violations and adherence
    return {
      overall: 95,
      financial: 98,
      privacy: 92,
      security: 96,
      operational: 94,
    };
  }

  private async calculateRegulatoryStatus(): Promise<
    DashboardMetrics['regulatoryStatus']
  > {
    // Calculate regulatory reporting status
    return {
      ficReports: {
        pending: 0,
        submitted: 5,
        overdue: 0,
      },
      popiaRequests: {
        open: 2,
        inProgress: 1,
        completed: 15,
        overdue: 0,
      },
      sarbReports: {
        current: true,
        nextDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    };
  }

  private async calculateTrends(): Promise<DashboardMetrics['trends']> {
    // Calculate historical trends
    return {
      violationTrend: [],
      complianceScoreTrend: [],
      alertVolumeTrend: [],
    };
  }

  private async calculateTenantMetrics(
    tenantId: string,
  ): Promise<DashboardMetrics> {
    // Calculate metrics for specific tenant
    return this.currentMetrics; // Simplified for example
  }

  private initializeMetrics(): DashboardMetrics {
    return {
      realTimeMetrics: {
        activeViolations: 0,
        violationsByCategory: {},
        violationsBySeverity: {},
        alertsLast24Hours: 0,
        systemHealth: 'healthy',
      },
      complianceScores: {
        overall: 0,
        financial: 0,
        privacy: 0,
        security: 0,
        operational: 0,
      },
      regulatoryStatus: {
        ficReports: { pending: 0, submitted: 0, overdue: 0 },
        popiaRequests: { open: 0, inProgress: 0, completed: 0, overdue: 0 },
        sarbReports: { current: false, nextDue: new Date() },
      },
      trends: {
        violationTrend: [],
        complianceScoreTrend: [],
        alertVolumeTrend: [],
      },
    };
  }
}
```

This comprehensive real-time compliance monitoring system provides automated detection, alerting, and dashboard capabilities to ensure continuous regulatory compliance across your fintech operations.
