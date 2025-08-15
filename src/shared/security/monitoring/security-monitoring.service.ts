import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { APP_LOGGER } from '../../logging/logging.providers';

/**
 * Mutable security metrics for internal tracking
 */
interface MutableSecurityMetrics {
  authorizationRequests: number;
  authorizationDenials: number;
  authenticationFailures: number;
  emergencyAccess: number;
  piiFieldsDetected: number;
  suspiciousActivity: number;
  policyViolations: number;
  errorRate: number;
  averageResponseTime: number;
}

/**
 * Security metrics for monitoring and alerting
 */
export interface SecurityMetrics {
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly tenantId?: string;
  readonly metrics: {
    readonly authorizationRequests: number;
    readonly authorizationDenials: number;
    readonly authenticationFailures: number;
    readonly emergencyAccess: number;
    readonly piiFieldsDetected: number;
    readonly suspiciousActivity: number;
    readonly policyViolations: number;
    readonly errorRate: number;
    readonly averageResponseTime: number;
  };
  readonly alertLevel: 'low' | 'medium' | 'high' | 'critical';
  readonly trends: {
    readonly authDenialRate: number; // percentage
    readonly errorTrend: 'increasing' | 'stable' | 'decreasing';
    readonly activitySpike: boolean;
  };
}

/**
 * Security alert configuration
 */
export interface SecurityAlertConfig {
  readonly authDenialThreshold: number; // percentage
  readonly authFailureThreshold: number; // count per minute
  readonly errorRateThreshold: number; // percentage
  readonly responseTimeThreshold: number; // milliseconds
  readonly piiDetectionThreshold: number; // count per hour
  readonly emergencyAccessAlert: boolean;
  readonly alertCooldown: number; // minutes
}

/**
 * Security monitoring service for metrics collection and alerting
 * Provides real-time security posture monitoring
 */
@Injectable()
export class SecurityMonitoringService {
  private readonly logger: Logger;
  private metrics: MutableSecurityMetrics = {
    authorizationRequests: 0,
    authorizationDenials: 0,
    authenticationFailures: 0,
    emergencyAccess: 0,
    piiFieldsDetected: 0,
    suspiciousActivity: 0,
    policyViolations: 0,
    errorRate: 0,
    averageResponseTime: 0,
  };

  private readonly alertConfig: SecurityAlertConfig = {
    authDenialThreshold: 20, // 20% denial rate triggers alert
    authFailureThreshold: 10, // 10 failures per minute
    errorRateThreshold: 5, // 5% error rate
    responseTimeThreshold: 2000, // 2 seconds
    piiDetectionThreshold: 50, // 50 PII fields per hour
    emergencyAccessAlert: true,
    alertCooldown: 5, // 5 minutes between similar alerts
  };

  private readonly recentEvents: Array<{
    type: string;
    timestamp: number;
    data: unknown;
  }> = [];

  private readonly alertHistory = new Map<string, number>(); // alertType -> lastAlertTime

  constructor(@Inject(APP_LOGGER) private readonly baseLogger: Logger) {
    this.logger = baseLogger.child({
      component: 'SecurityMonitoringService',
    });
  }

  /**
   * Record authorization decision for metrics
   */
  recordAuthorizationDecision(
    allowed: boolean,
    responseTime: number,
    correlationId?: string,
    tenantId?: string,
  ): void {
    this.metrics.authorizationRequests++;

    if (!allowed) {
      this.metrics.authorizationDenials++;
    }

    this.updateResponseTime(responseTime);
    this.addEvent('authorization_decision', {
      allowed,
      responseTime,
      correlationId,
      tenantId,
    });

    // Check for alerts
    this.checkAuthorizationAlerts(correlationId, tenantId);
  }

  /**
   * Record authentication failure
   */
  recordAuthenticationFailure(
    reason: string,
    correlationId?: string,
    tenantId?: string,
  ): void {
    this.metrics.authenticationFailures++;
    this.addEvent('authentication_failure', {
      reason,
      correlationId,
      tenantId,
    });

    // Check for alerts
    this.checkAuthenticationAlerts(correlationId, tenantId);
  }

  /**
   * Record emergency access usage
   */
  recordEmergencyAccess(
    userId: string,
    resource: string,
    correlationId?: string,
    tenantId?: string,
  ): void {
    this.metrics.emergencyAccess++;
    this.addEvent('emergency_access', {
      userId,
      resource,
      correlationId,
      tenantId,
    });

    // Always alert on emergency access
    if (this.alertConfig.emergencyAccessAlert) {
      this.triggerAlert('emergency_access', {
        message: 'Emergency access granted',
        userId,
        resource,
        correlationId,
        tenantId,
        alertLevel: 'critical',
      });
    }
  }

  /**
   * Record PII detection event
   */
  recordPIIDetection(
    fieldCount: number,
    riskScore: number,
    correlationId?: string,
    tenantId?: string,
  ): void {
    this.metrics.piiFieldsDetected += fieldCount;
    this.addEvent('pii_detection', {
      fieldCount,
      riskScore,
      correlationId,
      tenantId,
    });

    // Check for PII detection alerts
    this.checkPIIAlerts(fieldCount, riskScore, correlationId, tenantId);
  }

  /**
   * Record policy violation
   */
  recordPolicyViolation(
    policyId: string,
    reason: string,
    correlationId?: string,
    tenantId?: string,
  ): void {
    this.metrics.policyViolations++;
    this.addEvent('policy_violation', {
      policyId,
      reason,
      correlationId,
      tenantId,
    });

    this.triggerAlert('policy_violation', {
      message: 'Policy violation detected',
      policyId,
      reason,
      correlationId,
      tenantId,
      alertLevel: 'high',
    });
  }

  /**
   * Record error for error rate calculation
   */
  recordError(
    errorType: string,
    errorMessage: string,
    correlationId?: string,
    tenantId?: string,
  ): void {
    this.addEvent('error', {
      errorType,
      errorMessage,
      correlationId,
      tenantId,
    });
    this.updateErrorRate();

    // Check for error rate alerts
    this.checkErrorRateAlerts(correlationId, tenantId);
  }

  /**
   * Get current security metrics
   */
  getMetrics(correlationId?: string, tenantId?: string): SecurityMetrics {
    const trends = this.calculateTrends();
    const alertLevel = this.calculateAlertLevel(trends);

    return {
      timestamp: new Date().toISOString(),
      correlationId,
      tenantId,
      metrics: { ...this.metrics },
      alertLevel,
      trends,
    };
  }

  /**
   * Reset metrics (called periodically)
   */
  resetMetrics(): void {
    Object.keys(this.metrics).forEach((key) => {
      (this.metrics as any)[key] = 0;
    });

    // Keep only recent events (last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.recentEvents.splice(
      0,
      this.recentEvents.findIndex((event) => event.timestamp > oneHourAgo),
    );
  }

  /**
   * Check authorization-related alerts
   */
  private checkAuthorizationAlerts(
    correlationId?: string,
    tenantId?: string,
  ): void {
    const denialRate = this.calculateDenialRate();

    if (denialRate > this.alertConfig.authDenialThreshold) {
      this.triggerAlert('high_denial_rate', {
        message: `High authorization denial rate: ${denialRate.toFixed(1)}%`,
        denialRate,
        threshold: this.alertConfig.authDenialThreshold,
        correlationId,
        tenantId,
        alertLevel: 'high',
      });
    }
  }

  /**
   * Check authentication-related alerts
   */
  private checkAuthenticationAlerts(
    correlationId?: string,
    tenantId?: string,
  ): void {
    const recentFailures = this.getRecentEventCount(
      'authentication_failure',
      60000,
    ); // last minute

    if (recentFailures > this.alertConfig.authFailureThreshold) {
      this.triggerAlert('high_auth_failures', {
        message: `High authentication failure rate: ${recentFailures} failures in last minute`,
        failureCount: recentFailures,
        threshold: this.alertConfig.authFailureThreshold,
        correlationId,
        tenantId,
        alertLevel: 'medium',
      });
    }
  }

  /**
   * Check PII detection alerts
   */
  private checkPIIAlerts(
    fieldCount: number,
    riskScore: number,
    correlationId?: string,
    tenantId?: string,
  ): void {
    const hourlyPIICount = this.getRecentEventCount('pii_detection', 3600000); // last hour

    if (hourlyPIICount > this.alertConfig.piiDetectionThreshold) {
      this.triggerAlert('high_pii_detection', {
        message: `High PII detection rate: ${hourlyPIICount} fields in last hour`,
        hourlyCount: hourlyPIICount,
        threshold: this.alertConfig.piiDetectionThreshold,
        correlationId,
        tenantId,
        alertLevel: 'medium',
      });
    }

    if (riskScore > 80) {
      this.triggerAlert('high_risk_pii', {
        message: `High-risk PII detected: risk score ${riskScore}`,
        riskScore,
        fieldCount,
        correlationId,
        tenantId,
        alertLevel: 'high',
      });
    }
  }

  /**
   * Check error rate alerts
   */
  private checkErrorRateAlerts(
    correlationId?: string,
    tenantId?: string,
  ): void {
    if (this.metrics.errorRate > this.alertConfig.errorRateThreshold) {
      this.triggerAlert('high_error_rate', {
        message: `High error rate: ${this.metrics.errorRate.toFixed(1)}%`,
        errorRate: this.metrics.errorRate,
        threshold: this.alertConfig.errorRateThreshold,
        correlationId,
        tenantId,
        alertLevel: 'medium',
      });
    }
  }

  /**
   * Trigger security alert
   */
  private triggerAlert(
    alertType: string,
    alertData: Record<string, unknown>,
  ): void {
    const now = Date.now();
    const lastAlertTime = this.alertHistory.get(alertType) || 0;
    const cooldownPeriod = this.alertConfig.alertCooldown * 60 * 1000; // Convert to milliseconds

    // Check cooldown
    if (now - lastAlertTime < cooldownPeriod) {
      return; // Still in cooldown period
    }

    this.alertHistory.set(alertType, now);

    this.logger.warn(
      {
        method: 'triggerAlert',
        alertType,
        alertData,
        timestamp: new Date().toISOString(),
      },
      `Security Alert: ${alertData.message}`,
    );
  }

  /**
   * Add event to recent events buffer
   */
  private addEvent(type: string, data: unknown): void {
    this.recentEvents.push({
      type,
      timestamp: Date.now(),
      data,
    });

    // Keep only last 1000 events
    if (this.recentEvents.length > 1000) {
      this.recentEvents.shift();
    }
  }

  /**
   * Get count of recent events of specific type
   */
  private getRecentEventCount(eventType: string, timeWindowMs: number): number {
    const cutoff = Date.now() - timeWindowMs;
    return this.recentEvents.filter(
      (event) => event.type === eventType && event.timestamp > cutoff,
    ).length;
  }

  /**
   * Calculate denial rate
   */
  private calculateDenialRate(): number {
    if (this.metrics.authorizationRequests === 0) return 0;
    return (
      (this.metrics.authorizationDenials / this.metrics.authorizationRequests) *
      100
    );
  }

  /**
   * Update response time average
   */
  private updateResponseTime(responseTime: number): void {
    const currentAvg = this.metrics.averageResponseTime;
    const requestCount = this.metrics.authorizationRequests;

    this.metrics.averageResponseTime =
      (currentAvg * (requestCount - 1) + responseTime) / requestCount;
  }

  /**
   * Update error rate
   */
  private updateErrorRate(): void {
    const recentErrors = this.getRecentEventCount('error', 300000); // last 5 minutes
    const recentRequests = this.getRecentEventCount(
      'authorization_decision',
      300000,
    );

    if (recentRequests > 0) {
      this.metrics.errorRate = (recentErrors / recentRequests) * 100;
    }
  }

  /**
   * Calculate security trends
   */
  private calculateTrends(): SecurityMetrics['trends'] {
    const denialRate = this.calculateDenialRate();
    const recentEvents = this.recentEvents.slice(-50); // Last 50 events
    const normalActivityThreshold = 20; // events per 5 minutes

    return {
      authDenialRate: denialRate,
      errorTrend: this.calculateErrorTrend(),
      activitySpike: recentEvents.length > normalActivityThreshold,
    };
  }

  /**
   * Calculate error trend
   */
  private calculateErrorTrend(): 'increasing' | 'stable' | 'decreasing' {
    const recent5Min = this.getRecentEventCount('error', 300000);
    const previous5Min = this.getRecentEventCount('error', 600000) - recent5Min;

    if (recent5Min > previous5Min * 1.2) return 'increasing';
    if (recent5Min < previous5Min * 0.8) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate overall alert level
   */
  private calculateAlertLevel(
    trends: SecurityMetrics['trends'],
  ): SecurityMetrics['alertLevel'] {
    if (this.metrics.emergencyAccess > 0) return 'critical';
    if (trends.authDenialRate > 50 || this.metrics.errorRate > 10)
      return 'high';
    if (
      trends.authDenialRate > 20 ||
      this.metrics.errorRate > 5 ||
      trends.activitySpike
    )
      return 'medium';
    return 'low';
  }
}
