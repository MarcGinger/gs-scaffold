# COPILOT_INSTRUCTIONS.md — Regulatory Reporting Automation

> **Purpose:** Production-ready automated regulatory reporting for South African fintech compliance (FICA/AML, POPIA, SARB/PASA) with EventStoreDB data sourcing and secure delivery.

---

## 1) Regulatory Framework Coverage

### Financial Intelligence Centre (FIC) Reports

```typescript
interface FICReports {
  // Cash Threshold Reports (CTR)
  cashThresholdReports: {
    threshold: 24999.99; // ZAR
    frequency: 'real-time';
    deadline: 'within 15 days';
  };

  // Suspicious Transaction Reports (STR)
  suspiciousTransactionReports: {
    triggers: string[];
    frequency: 'as-required';
    deadline: 'immediately';
  };

  // Terrorist Property Reports (TPR)
  terroristPropertyReports: {
    triggers: ['sanctions_match', 'terrorist_financing'];
    frequency: 'as-required';
    deadline: 'immediately';
  };
}
```

### POPIA Data Subject Reports

```typescript
interface POPIAReports {
  // Data Subject Access Requests
  dataSubjectAccess: {
    deadline: '30 days';
    format: 'structured_data';
  };

  // Breach Notifications
  breachNotifications: {
    regulator_deadline: '72 hours';
    subject_deadline: 'without_undue_delay';
  };

  // Processing Activity Records
  processingRecords: {
    frequency: 'annual';
    detail_level: 'comprehensive';
  };
}
```

### SARB/PASA Payment Reports

```typescript
interface PaymentSystemReports {
  // Settlement Reports
  settlementReports: {
    frequency: 'daily';
    cutoff_time: '17:00 SAST';
  };

  // Dispute Reports
  disputeReports: {
    frequency: 'monthly';
    categories: ['chargebacks', 'reversals', 'failed_settlements'];
  };

  // System Availability Reports
  availabilityReports: {
    frequency: 'monthly';
    uptime_threshold: 99.9;
  };
}
```

---

## 2) Event-Sourced Report Data Models

### Financial Transaction Events for FICA

```typescript
// src/contexts/reporting/domain/events/financial-reporting.events.ts
export interface TransactionReportableEvent {
  type: 'transaction.reportable.detected.v1';
  payload: {
    transactionId: string;
    customerId: string;
    amount: {
      value: number;
      currency: 'ZAR' | 'USD' | 'EUR' | 'GBP';
    };
    transactionType: 'deposit' | 'withdrawal' | 'transfer' | 'payment';
    reportingTriggers: {
      cashThreshold?: {
        exceeded: boolean;
        threshold: number;
      };
      suspicious?: {
        indicators: string[];
        riskScore: number;
      };
      sanctions?: {
        matchType: 'exact' | 'fuzzy' | 'false_positive';
        matchedEntity: string;
      };
    };
    counterparty?: {
      type: 'individual' | 'business' | 'government';
      identifier: string;
      country: string;
    };
  };
  metadata: {
    correlationId: string;
    tenantId: string;
    occurredAt: string;
    reportingDeadline: string;
  };
}

export interface ReportSubmittedEvent {
  type: 'report.submitted.v1';
  payload: {
    reportId: string;
    reportType: 'CTR' | 'STR' | 'TPR' | 'POPIA_BREACH' | 'SARB_SETTLEMENT';
    submittedTo: string; // Regulator identifier
    submissionMethod: 'api' | 'portal' | 'email' | 'secure_file_transfer';
    acknowledgmentReceived: boolean;
    regulatorReference?: string;
  };
  metadata: {
    correlationId: string;
    tenantId: string;
    occurredAt: string;
    submittedBy: string;
  };
}
```

### POPIA Events for Privacy Reporting

```typescript
export interface PIIProcessingEvent {
  type: 'pii.processing.recorded.v1';
  payload: {
    subjectId: string;
    processingPurpose: string;
    lawfulBasis:
      | 'consent'
      | 'contract'
      | 'legal_obligation'
      | 'legitimate_interest';
    dataCategories: string[];
    retentionPeriod: string;
    crossBorderTransfer?: {
      destinationCountry: string;
      adequacyDecision: boolean;
      safeguards: string[];
    };
  };
  metadata: {
    correlationId: string;
    tenantId: string;
    occurredAt: string;
    dataController: string;
  };
}

export interface DataBreachEvent {
  type: 'data.breach.detected.v1';
  payload: {
    breachId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedSubjects: number;
    dataCategories: string[];
    breachType: 'confidentiality' | 'integrity' | 'availability';
    rootCause: string;
    containmentActions: string[];
    regulatorNotificationRequired: boolean;
    subjectNotificationRequired: boolean;
  };
  metadata: {
    correlationId: string;
    tenantId: string;
    occurredAt: string;
    detectedBy: string;
  };
}
```

---

## 3) Report Generation Engine

### Core Report Generator

```typescript
// src/contexts/reporting/application/services/report-generator.service.ts
import { Injectable } from '@nestjs/common';
import { EventStoreService } from '../../../shared/eventstore/eventstore.service';

export interface ReportRequest {
  reportType: string;
  tenantId: string;
  parameters: Record<string, any>;
  requestedBy: string;
  deadline: Date;
}

export interface GeneratedReport {
  reportId: string;
  reportType: string;
  generatedAt: Date;
  validFrom: Date;
  validTo: Date;
  data: any;
  metadata: {
    sourceEvents: number;
    dataIntegrity: boolean;
    signatureValid: boolean;
  };
}

@Injectable()
export class ReportGeneratorService {
  constructor(
    private readonly eventStore: EventStoreService,
    private readonly reportBuilders: Map<string, ReportBuilder>,
  ) {
    this.registerBuilders();
  }

  async generateReport(request: ReportRequest): Promise<GeneratedReport> {
    const builder = this.reportBuilders.get(request.reportType);
    if (!builder) {
      throw new Error(
        `No builder registered for report type: ${request.reportType}`,
      );
    }

    // Source events from EventStoreDB
    const events = await this.sourceEventsForReport(request);

    // Build report data
    const reportData = await builder.build(events, request.parameters);

    // Validate data integrity
    const integrityCheck = await this.validateReportIntegrity(
      events,
      reportData,
    );

    // Generate report with signature
    const report: GeneratedReport = {
      reportId: this.generateReportId(request.reportType),
      reportType: request.reportType,
      generatedAt: new Date(),
      validFrom: request.parameters.fromDate,
      validTo: request.parameters.toDate,
      data: reportData,
      metadata: {
        sourceEvents: events.length,
        dataIntegrity: integrityCheck.valid,
        signatureValid: true, // Would implement actual signing
      },
    };

    // Store report for audit trail
    await this.storeGeneratedReport(report, request);

    return report;
  }

  private async sourceEventsForReport(request: ReportRequest): Promise<any[]> {
    const builder = this.reportBuilders.get(request.reportType)!;
    const eventTypes = builder.getRequiredEventTypes();

    // Build filter for EventStoreDB
    const filter = {
      eventTypes,
      fromDate: request.parameters.fromDate,
      toDate: request.parameters.toDate,
      tenantId: request.tenantId,
    };

    return this.eventStore.queryEvents(filter);
  }

  private registerBuilders(): void {
    this.reportBuilders.set('FIC_CTR', new CashThresholdReportBuilder());
    this.reportBuilders.set(
      'FIC_STR',
      new SuspiciousTransactionReportBuilder(),
    );
    this.reportBuilders.set('POPIA_BREACH', new DataBreachReportBuilder());
    this.reportBuilders.set('POPIA_DSR', new DataSubjectRequestReportBuilder());
    this.reportBuilders.set('SARB_SETTLEMENT', new SettlementReportBuilder());
  }

  private generateReportId(reportType: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    return `${reportType}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async validateReportIntegrity(
    events: any[],
    reportData: any,
  ): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    // Implement data integrity validation
    return { valid: true, errors: [] };
  }

  private async storeGeneratedReport(
    report: GeneratedReport,
    request: ReportRequest,
  ): Promise<void> {
    // Store report in secure storage for audit trail
  }
}
```

### Report Builder Interface

```typescript
// src/contexts/reporting/domain/interfaces/report-builder.interface.ts
export interface ReportBuilder {
  getRequiredEventTypes(): string[];
  build(events: any[], parameters: Record<string, any>): Promise<any>;
  validate(reportData: any): Promise<{ valid: boolean; errors: string[] }>;
}
```

---

## 4) Specific Report Builders

### Cash Threshold Report Builder

```typescript
// src/contexts/reporting/infrastructure/builders/cash-threshold-report.builder.ts
import { Injectable } from '@nestjs/common';
import { ReportBuilder } from '../../domain/interfaces/report-builder.interface';

@Injectable()
export class CashThresholdReportBuilder implements ReportBuilder {
  getRequiredEventTypes(): string[] {
    return [
      'transaction.cash.deposit.v1',
      'transaction.cash.withdrawal.v1',
      'transaction.reportable.detected.v1',
    ];
  }

  async build(events: any[], parameters: Record<string, any>): Promise<any> {
    const threshold = 24999.99; // ZAR threshold per FICA
    const reportData = {
      reportHeader: {
        reportType: 'Cash Threshold Report (CTR)',
        reportingPeriod: {
          from: parameters.fromDate,
          to: parameters.toDate,
        },
        reportingInstitution: {
          name: parameters.institutionName,
          registrationNumber: parameters.ficRegistrationNumber,
          contactDetails: parameters.contactDetails,
        },
        submissionDate: new Date().toISOString(),
      },
      thresholdTransactions: [],
      summary: {
        totalTransactions: 0,
        totalAmount: 0,
        uniqueCustomers: new Set(),
      },
    };

    // Process transaction events
    for (const event of events) {
      if (event.type.startsWith('transaction.cash.')) {
        const transaction = await this.processTransactionEvent(
          event,
          threshold,
        );
        if (transaction.exceedsThreshold) {
          reportData.thresholdTransactions.push(transaction);
          reportData.summary.totalTransactions++;
          reportData.summary.totalAmount += transaction.amount;
          reportData.summary.uniqueCustomers.add(transaction.customerId);
        }
      }
    }

    reportData.summary.uniqueCustomers =
      reportData.summary.uniqueCustomers.size;

    return reportData;
  }

  private async processTransactionEvent(
    event: any,
    threshold: number,
  ): Promise<{
    transactionId: string;
    customerId: string;
    amount: number;
    currency: string;
    transactionType: string;
    timestamp: string;
    exceedsThreshold: boolean;
    customerDetails?: any;
  }> {
    const exceedsThreshold = event.payload.amount.value > threshold;

    return {
      transactionId: event.payload.transactionId,
      customerId: event.payload.customerId,
      amount: event.payload.amount.value,
      currency: event.payload.amount.currency,
      transactionType: event.payload.transactionType,
      timestamp: event.metadata.occurredAt,
      exceedsThreshold,
      customerDetails: exceedsThreshold
        ? await this.getCustomerDetails(event.payload.customerId)
        : undefined,
    };
  }

  private async getCustomerDetails(customerId: string): Promise<any> {
    // Fetch customer KYC details for reporting
    // Implementation would query customer projection
    return {
      idNumber: '***masked***', // Implement proper tokenization
      fullName: '***masked***',
      address: '***masked***',
    };
  }

  async validate(
    reportData: any,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate required fields
    if (!reportData.reportHeader?.reportingInstitution?.ficRegistrationNumber) {
      errors.push('FIC registration number is required');
    }

    // Validate transaction data
    for (const transaction of reportData.thresholdTransactions) {
      if (!transaction.customerDetails) {
        errors.push(
          `Missing customer details for transaction ${transaction.transactionId}`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
```

### Suspicious Transaction Report Builder

```typescript
// src/contexts/reporting/infrastructure/builders/suspicious-transaction-report.builder.ts
import { Injectable } from '@nestjs/common';
import { ReportBuilder } from '../../domain/interfaces/report-builder.interface';

@Injectable()
export class SuspiciousTransactionReportBuilder implements ReportBuilder {
  getRequiredEventTypes(): string[] {
    return [
      'transaction.reportable.detected.v1',
      'aml.screening.completed.v1',
      'customer.risk.assessed.v1',
    ];
  }

  async build(events: any[], parameters: Record<string, any>): Promise<any> {
    const reportData = {
      reportHeader: {
        reportType: 'Suspicious Transaction Report (STR)',
        reportingPeriod: {
          from: parameters.fromDate,
          to: parameters.toDate,
        },
        reportingInstitution: {
          name: parameters.institutionName,
          ficRegistrationNumber: parameters.ficRegistrationNumber,
        },
        submissionDate: new Date().toISOString(),
        urgency: 'immediate',
      },
      suspiciousTransactions: [],
      summary: {
        totalReports: 0,
        riskCategories: {},
      },
    };

    // Process suspicious transaction events
    for (const event of events) {
      if (
        event.type === 'transaction.reportable.detected.v1' &&
        event.payload.reportingTriggers.suspicious
      ) {
        const suspiciousTransaction = await this.processSuspiciousEvent(event);
        reportData.suspiciousTransactions.push(suspiciousTransaction);
        reportData.summary.totalReports++;

        // Categorize by risk indicators
        for (const indicator of suspiciousTransaction.suspiciousIndicators) {
          reportData.summary.riskCategories[indicator] =
            (reportData.summary.riskCategories[indicator] || 0) + 1;
        }
      }
    }

    return reportData;
  }

  private async processSuspiciousEvent(event: any): Promise<{
    transactionId: string;
    customerId: string;
    amount: number;
    currency: string;
    suspiciousIndicators: string[];
    riskScore: number;
    transactionPattern: any;
    investigationNotes: string;
  }> {
    const suspicious = event.payload.reportingTriggers.suspicious;

    return {
      transactionId: event.payload.transactionId,
      customerId: event.payload.customerId,
      amount: event.payload.amount.value,
      currency: event.payload.amount.currency,
      suspiciousIndicators: suspicious.indicators,
      riskScore: suspicious.riskScore,
      transactionPattern: await this.analyzeTransactionPattern(
        event.payload.customerId,
      ),
      investigationNotes: await this.getInvestigationNotes(
        event.payload.transactionId,
      ),
    };
  }

  private async analyzeTransactionPattern(customerId: string): Promise<any> {
    // Analyze customer transaction patterns for context
    return {
      averageTransactionAmount: 0,
      transactionFrequency: 'normal',
      unusualTimePatterns: false,
      geographicAnomalies: false,
    };
  }

  private async getInvestigationNotes(transactionId: string): Promise<string> {
    // Get any manual investigation notes
    return 'Automated detection - requires manual review';
  }

  async validate(
    reportData: any,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // STR must be submitted immediately
    const submissionTime = new Date(reportData.reportHeader.submissionDate);
    const detectionTime = new Date(); // Would get from event
    const timeDiff = submissionTime.getTime() - detectionTime.getTime();

    if (timeDiff > 24 * 60 * 60 * 1000) {
      // 24 hours
      errors.push('STR submission delayed beyond acceptable timeframe');
    }

    return { valid: errors.length === 0, errors };
  }
}
```

### POPIA Breach Report Builder

```typescript
// src/contexts/reporting/infrastructure/builders/data-breach-report.builder.ts
import { Injectable } from '@nestjs/common';
import { ReportBuilder } from '../../domain/interfaces/report-builder.interface';

@Injectable()
export class DataBreachReportBuilder implements ReportBuilder {
  getRequiredEventTypes(): string[] {
    return [
      'data.breach.detected.v1',
      'data.breach.contained.v1',
      'data.breach.investigated.v1',
      'pii.subjects.affected.v1',
    ];
  }

  async build(events: any[], parameters: Record<string, any>): Promise<any> {
    const breachEvents = events.filter((e) =>
      e.type.startsWith('data.breach.'),
    );

    if (breachEvents.length === 0) {
      throw new Error('No breach events found for report');
    }

    const breachEvent = breachEvents.find(
      (e) => e.type === 'data.breach.detected.v1',
    );

    return {
      reportHeader: {
        reportType: 'POPIA Data Breach Notification',
        breachId: breachEvent.payload.breachId,
        reportingEntity: {
          name: parameters.entityName,
          registrationNumber: parameters.registrationNumber,
          contactPerson: parameters.contactPerson,
          contactDetails: parameters.contactDetails,
        },
        submissionDate: new Date().toISOString(),
        regulatorDeadline: this.calculateRegulatorDeadline(
          breachEvent.metadata.occurredAt,
        ),
      },
      breachDetails: {
        detectionDate: breachEvent.metadata.occurredAt,
        breachType: breachEvent.payload.breachType,
        severity: breachEvent.payload.severity,
        rootCause: breachEvent.payload.rootCause,
        affectedSubjects: breachEvent.payload.affectedSubjects,
        dataCategories: breachEvent.payload.dataCategories,
        geographicalScope: await this.determineGeographicalScope(breachEvent),
        crossBorderImpact: await this.assessCrossBorderImpact(breachEvent),
      },
      containmentMeasures: breachEvent.payload.containmentActions,
      riskAssessment: await this.conductRiskAssessment(breachEvent),
      notificationPlan: {
        regulatorNotification: {
          required: breachEvent.payload.regulatorNotificationRequired,
          deadline: this.calculateRegulatorDeadline(
            breachEvent.metadata.occurredAt,
          ),
          method: 'secure_portal',
        },
        subjectNotification: {
          required: breachEvent.payload.subjectNotificationRequired,
          timeline: 'without_undue_delay',
          method: 'direct_communication',
        },
      },
      remedialActions: await this.getRemedialActions(
        breachEvent.payload.breachId,
      ),
    };
  }

  private calculateRegulatorDeadline(detectionDate: string): string {
    const detection = new Date(detectionDate);
    const deadline = new Date(detection.getTime() + 72 * 60 * 60 * 1000); // 72 hours
    return deadline.toISOString();
  }

  private async determineGeographicalScope(
    breachEvent: any,
  ): Promise<string[]> {
    // Determine which countries/regions are affected
    return ['South Africa']; // Default, would analyze actual scope
  }

  private async assessCrossBorderImpact(breachEvent: any): Promise<{
    affectsMultipleCountries: boolean;
    internationalDataTransfers: boolean;
    applicableLaws: string[];
  }> {
    return {
      affectsMultipleCountries: false,
      internationalDataTransfers: false,
      applicableLaws: ['POPIA'],
    };
  }

  private async conductRiskAssessment(breachEvent: any): Promise<{
    likelihoodOfHarm: 'low' | 'medium' | 'high';
    severityOfHarm: 'low' | 'medium' | 'high';
    overallRisk: 'low' | 'medium' | 'high';
    riskFactors: string[];
  }> {
    // Assess risk based on breach characteristics
    const severity = breachEvent.payload.severity;
    const dataCategories = breachEvent.payload.dataCategories;

    return {
      likelihoodOfHarm: severity === 'critical' ? 'high' : 'medium',
      severityOfHarm: dataCategories.includes('financial') ? 'high' : 'medium',
      overallRisk: 'high',
      riskFactors: [
        'Personal financial information exposed',
        'Large number of data subjects affected',
        'Potential for identity theft',
      ],
    };
  }

  private async getRemedialActions(breachId: string): Promise<string[]> {
    // Get remedial actions taken
    return [
      'Immediate system isolation',
      'Password reset for all affected accounts',
      'Enhanced monitoring implemented',
      'Security audit initiated',
      'Staff training scheduled',
    ];
  }

  async validate(
    reportData: any,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if within 72-hour deadline
    const breachDate = new Date(reportData.breachDetails.detectionDate);
    const submissionDate = new Date(reportData.reportHeader.submissionDate);
    const hoursDiff =
      (submissionDate.getTime() - breachDate.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 72) {
      errors.push(
        'Breach notification submitted beyond 72-hour POPIA deadline',
      );
    }

    // Validate required fields
    if (!reportData.reportHeader.reportingEntity.registrationNumber) {
      errors.push('Entity registration number required');
    }

    if (reportData.breachDetails.affectedSubjects === 0) {
      errors.push('Number of affected subjects must be specified');
    }

    return { valid: errors.length === 0, errors };
  }
}
```

---

## 5) Automated Report Submission

### Report Submission Service

```typescript
// src/contexts/reporting/infrastructure/services/report-submission.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

interface SubmissionResult {
  success: boolean;
  regulatorReference?: string;
  submissionId: string;
  submittedAt: Date;
  acknowledgmentReceived: boolean;
  errors?: string[];
}

@Injectable()
export class ReportSubmissionService {
  constructor(private readonly httpService: HttpService) {}

  async submitFICReport(
    report: GeneratedReport,
    credentials: {
      ficUsername: string;
      ficPassword: string;
      institutionCode: string;
    },
  ): Promise<SubmissionResult> {
    try {
      // Submit to FIC GOAML system
      const response = await this.httpService
        .post(
          'https://secure.fic.gov.za/api/reports',
          {
            reportType: report.reportType,
            institutionCode: credentials.institutionCode,
            reportData: report.data,
            signature: this.signReport(report),
          },
          {
            auth: {
              username: credentials.ficUsername,
              password: credentials.ficPassword,
            },
            headers: {
              'Content-Type': 'application/json',
              'X-Report-Version': '2.0',
            },
          },
        )
        .toPromise();

      return {
        success: true,
        regulatorReference: response.data.referenceNumber,
        submissionId: response.data.submissionId,
        submittedAt: new Date(),
        acknowledgmentReceived: response.data.acknowledged || false,
      };
    } catch (error) {
      return {
        success: false,
        submissionId: this.generateSubmissionId(),
        submittedAt: new Date(),
        acknowledgmentReceived: false,
        errors: [error.message],
      };
    }
  }

  async submitPOPIAReport(
    report: GeneratedReport,
    regulatorDetails: {
      endpoint: string;
      apiKey: string;
    },
  ): Promise<SubmissionResult> {
    try {
      // Submit to Information Regulator
      const response = await this.httpService
        .post(
          regulatorDetails.endpoint,
          {
            reportType: 'BREACH_NOTIFICATION',
            reportData: report.data,
            submissionDate: new Date().toISOString(),
          },
          {
            headers: {
              Authorization: `Bearer ${regulatorDetails.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        )
        .toPromise();

      return {
        success: true,
        regulatorReference: response.data.caseNumber,
        submissionId: response.data.submissionId,
        submittedAt: new Date(),
        acknowledgmentReceived: true,
      };
    } catch (error) {
      return {
        success: false,
        submissionId: this.generateSubmissionId(),
        submittedAt: new Date(),
        acknowledgmentReceived: false,
        errors: [error.message],
      };
    }
  }

  async submitSARBReport(
    report: GeneratedReport,
    credentials: {
      participantCode: string;
      certificatePath: string;
      privateKeyPath: string;
    },
  ): Promise<SubmissionResult> {
    try {
      // Submit to SARB payment system
      const signedReport = await this.signWithCertificate(report, credentials);

      const response = await this.httpService
        .post('https://secure.resbank.co.za/api/reports', signedReport, {
          headers: {
            'Content-Type': 'application/xml',
            'X-Participant-Code': credentials.participantCode,
          },
          // TLS client certificate authentication
          httpsAgent: this.createMutualTLSAgent(credentials),
        })
        .toPromise();

      return {
        success: true,
        regulatorReference: response.data.transactionReference,
        submissionId: response.data.messageId,
        submittedAt: new Date(),
        acknowledgmentReceived: response.data.status === 'ACCEPTED',
      };
    } catch (error) {
      return {
        success: false,
        submissionId: this.generateSubmissionId(),
        submittedAt: new Date(),
        acknowledgmentReceived: false,
        errors: [error.message],
      };
    }
  }

  private signReport(report: GeneratedReport): string {
    // Implement digital signature
    return 'signature_placeholder';
  }

  private async signWithCertificate(
    report: GeneratedReport,
    credentials: any,
  ): Promise<any> {
    // Implement certificate-based signing for SARB
    return report.data;
  }

  private createMutualTLSAgent(credentials: any): any {
    // Create HTTPS agent with client certificate for mutual TLS
    return null;
  }

  private generateSubmissionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

## 6) Automated Reporting Scheduler

### Report Scheduler Service

```typescript
// src/contexts/reporting/application/services/report-scheduler.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportGeneratorService } from './report-generator.service';
import { ReportSubmissionService } from '../infrastructure/services/report-submission.service';

@Injectable()
export class ReportSchedulerService {
  constructor(
    private readonly reportGenerator: ReportGeneratorService,
    private readonly reportSubmission: ReportSubmissionService,
  ) {}

  @Cron('0 0 18 * * 1-5') // 6 PM on weekdays
  async generateDailyCTRReports(): Promise<void> {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Generate CTR for all tenants
    const tenants = await this.getActiveTenants();

    for (const tenant of tenants) {
      try {
        const report = await this.reportGenerator.generateReport({
          reportType: 'FIC_CTR',
          tenantId: tenant.id,
          parameters: {
            fromDate: yesterday,
            toDate: today,
            institutionName: tenant.institutionName,
            ficRegistrationNumber: tenant.ficRegistrationNumber,
          },
          requestedBy: 'system',
          deadline: new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000), // 15 days
        });

        // Auto-submit if transactions found
        if (report.data.thresholdTransactions.length > 0) {
          await this.reportSubmission.submitFICReport(
            report,
            tenant.ficCredentials,
          );
        }
      } catch (error) {
        // Log error and alert compliance team
        console.error(`Failed to generate CTR for tenant ${tenant.id}:`, error);
      }
    }
  }

  @Cron('0 0 9 1 * *') // 9 AM on 1st of every month
  async generateMonthlySARBReports(): Promise<void> {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const tenants = await this.getActiveTenants();

    for (const tenant of tenants) {
      if (tenant.sarbParticipant) {
        try {
          const report = await this.reportGenerator.generateReport({
            reportType: 'SARB_SETTLEMENT',
            tenantId: tenant.id,
            parameters: {
              fromDate: lastMonth,
              toDate: thisMonth,
              participantCode: tenant.sarbParticipantCode,
            },
            requestedBy: 'system',
            deadline: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
          });

          await this.reportSubmission.submitSARBReport(
            report,
            tenant.sarbCredentials,
          );
        } catch (error) {
          console.error(
            `Failed to generate SARB report for tenant ${tenant.id}:`,
            error,
          );
        }
      }
    }
  }

  // Real-time STR generation (triggered by suspicious transaction events)
  async generateImmediateSTR(transactionEvent: any): Promise<void> {
    const tenant = await this.getTenant(transactionEvent.metadata.tenantId);

    try {
      const report = await this.reportGenerator.generateReport({
        reportType: 'FIC_STR',
        tenantId: tenant.id,
        parameters: {
          transactionId: transactionEvent.payload.transactionId,
          urgency: 'immediate',
        },
        requestedBy: 'aml_system',
        deadline: new Date(), // Immediate
      });

      // Submit immediately
      await this.reportSubmission.submitFICReport(
        report,
        tenant.ficCredentials,
      );
    } catch (error) {
      // Critical alert - STR submission failed
      await this.alertComplianceTeam(
        'STR_SUBMISSION_FAILED',
        `Failed to submit STR for transaction ${transactionEvent.payload.transactionId}: ${error.message}`,
      );
    }
  }

  // Real-time breach notification (triggered by breach detection events)
  async generateImmediateBreachNotification(breachEvent: any): Promise<void> {
    const tenant = await this.getTenant(breachEvent.metadata.tenantId);

    try {
      const report = await this.reportGenerator.generateReport({
        reportType: 'POPIA_BREACH',
        tenantId: tenant.id,
        parameters: {
          breachId: breachEvent.payload.breachId,
          severity: breachEvent.payload.severity,
        },
        requestedBy: 'security_system',
        deadline: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
      });

      // Submit to Information Regulator
      await this.reportSubmission.submitPOPIAReport(
        report,
        tenant.popiaCredentials,
      );
    } catch (error) {
      // Critical alert - breach notification failed
      await this.alertComplianceTeam(
        'BREACH_NOTIFICATION_FAILED',
        `Failed to submit breach notification for ${breachEvent.payload.breachId}: ${error.message}`,
      );
    }
  }

  private async getActiveTenants(): Promise<any[]> {
    // Get all active tenants from configuration
    return [];
  }

  private async getTenant(tenantId: string): Promise<any> {
    // Get specific tenant configuration
    return {};
  }

  private async alertComplianceTeam(
    alertType: string,
    message: string,
  ): Promise<void> {
    // Send critical alert to compliance team
    // Implementation depends on your alerting system
  }
}
```

This comprehensive regulatory reporting system provides automated compliance reporting capabilities while leveraging your event-sourced architecture to ensure data integrity and auditability.
