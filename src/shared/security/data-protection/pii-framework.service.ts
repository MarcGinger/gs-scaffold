import { Injectable } from '@nestjs/common';
import { PIIDetectorService } from './pii-detector.service';
import { PIIProtectionService } from './pii-protection.service';
import {
  PIIFieldType,
  PIIProtectionAction,
  PIIScanConfig,
  PIIDetectionResult,
  PIIProtectionResult,
} from './pii.types';

/**
 * Comprehensive PII protection framework
 * Combines detection and protection for complete data privacy solution
 */
@Injectable()
export class PIIFrameworkService {
  private readonly defaultConfig: PIIScanConfig = {
    enabledDetectors: [
      PIIFieldType.EMAIL,
      PIIFieldType.PHONE,
      PIIFieldType.SSN,
      PIIFieldType.CREDIT_CARD,
      PIIFieldType.IP_ADDRESS,
      PIIFieldType.USER_AGENT,
      PIIFieldType.PERSONAL_NAME,
      PIIFieldType.DATE_OF_BIRTH,
    ],
    confidenceThreshold: 0.7,
    scanDepth: 5,
    contextAware: true,
    customPatterns: {},
    excludeFields: ['id', 'uuid', 'correlation_id', 'timestamp'],
  };

  constructor(
    private readonly detector: PIIDetectorService,
    private readonly protection: PIIProtectionService,
  ) {}

  /**
   * Complete PII scan and protection workflow
   */
  async scanAndProtect(
    data: unknown,
    config?: Partial<PIIScanConfig>,
    correlationId?: string,
  ): Promise<{
    protectedData: unknown;
    detectionResults: PIIDetectionResult[];
    protectionResults: PIIProtectionResult[];
    summary: PIIProcessingSummary;
  }> {
    const scanConfig = { ...this.defaultConfig, ...config };

    // Step 1: Scan for PII
    const detectionResults = this.detector.scanForPII(data, scanConfig);

    // Step 2: Apply protection
    const { protectedData, results: protectionResults } =
      this.protection.protectData(data, detectionResults, correlationId);

    // Step 3: Generate summary
    const summary = this.generateSummary(detectionResults, protectionResults);

    return {
      protectedData,
      detectionResults,
      protectionResults,
      summary,
    };
  }

  /**
   * Scan data for PII without applying protection
   */
  scanOnly(
    data: unknown,
    config?: Partial<PIIScanConfig>,
  ): PIIDetectionResult[] {
    const scanConfig = { ...this.defaultConfig, ...config };
    return this.detector.scanForPII(data, scanConfig);
  }

  /**
   * Apply protection to already detected PII
   */
  protectOnly(
    data: unknown,
    detectedPII: PIIDetectionResult[],
    correlationId?: string,
  ): { protectedData: unknown; results: PIIProtectionResult[] } {
    return this.protection.protectData(data, detectedPII, correlationId);
  }

  /**
   * Generate processing summary
   */
  private generateSummary(
    detectionResults: PIIDetectionResult[],
    protectionResults: PIIProtectionResult[],
  ): PIIProcessingSummary {
    const fieldTypeCounts: Record<PIIFieldType, number> = {} as Record<
      PIIFieldType,
      number
    >;
    const actionCounts: Record<PIIProtectionAction, number> = {} as Record<
      PIIProtectionAction,
      number
    >;

    // Count field types
    for (const detection of detectionResults) {
      fieldTypeCounts[detection.fieldType] =
        (fieldTypeCounts[detection.fieldType] || 0) + 1;
    }

    // Count protection actions
    for (const protection of protectionResults) {
      actionCounts[protection.action] =
        (actionCounts[protection.action] || 0) + 1;
    }

    return {
      totalFieldsScanned: this.countTotalFields(detectionResults),
      piiFieldsDetected: detectionResults.length,
      protectionActionsApplied: protectionResults.length,
      fieldTypeCounts,
      actionCounts,
      riskScore: this.calculateRiskScore(detectionResults),
      complianceStatus: this.assessComplianceStatus(
        detectionResults,
        protectionResults,
      ),
    };
  }

  /**
   * Calculate risk score based on detected PII
   */
  private calculateRiskScore(detectionResults: PIIDetectionResult[]): number {
    const riskWeights: Record<PIIFieldType, number> = {
      [PIIFieldType.SSN]: 10,
      [PIIFieldType.CREDIT_CARD]: 10,
      [PIIFieldType.FINANCIAL_ACCOUNT]: 9,
      [PIIFieldType.GOVERNMENT_ID]: 9,
      [PIIFieldType.BIOMETRIC]: 10,
      [PIIFieldType.HEALTH_INFO]: 9,
      [PIIFieldType.EMAIL]: 5,
      [PIIFieldType.PHONE]: 5,
      [PIIFieldType.PERSONAL_NAME]: 4,
      [PIIFieldType.ADDRESS]: 6,
      [PIIFieldType.DATE_OF_BIRTH]: 6,
      [PIIFieldType.LOCATION]: 4,
      [PIIFieldType.IP_ADDRESS]: 3,
      [PIIFieldType.USER_AGENT]: 2,
    };

    let totalRisk = 0;
    let maxPossibleRisk = 0;

    for (const detection of detectionResults) {
      const fieldRisk = riskWeights[detection.fieldType] || 1;
      totalRisk += fieldRisk * detection.confidence;
      maxPossibleRisk += fieldRisk;
    }

    // Normalize to 0-100 scale
    return maxPossibleRisk > 0
      ? Math.round((totalRisk / maxPossibleRisk) * 100)
      : 0;
  }

  /**
   * Assess compliance status
   */
  private assessComplianceStatus(
    detectionResults: PIIDetectionResult[],
    protectionResults: PIIProtectionResult[],
  ): ComplianceStatus {
    const unprotectedPII = detectionResults.length - protectionResults.length;
    const hasHighRiskPII = detectionResults.some((d) =>
      [
        PIIFieldType.SSN,
        PIIFieldType.CREDIT_CARD,
        PIIFieldType.BIOMETRIC,
      ].includes(d.fieldType),
    );

    if (unprotectedPII === 0 && !hasHighRiskPII) {
      return 'compliant';
    } else if (unprotectedPII === 0) {
      return 'needs_review';
    } else {
      return 'non_compliant';
    }
  }

  /**
   * Count total fields from detection results
   */
  private countTotalFields(detectionResults: PIIDetectionResult[]): number {
    const uniquePaths = new Set(detectionResults.map((r) => r.fieldPath));
    return uniquePaths.size;
  }
}

/**
 * PII processing summary
 */
export interface PIIProcessingSummary {
  readonly totalFieldsScanned: number;
  readonly piiFieldsDetected: number;
  readonly protectionActionsApplied: number;
  readonly fieldTypeCounts: Record<PIIFieldType, number>;
  readonly actionCounts: Record<PIIProtectionAction, number>;
  readonly riskScore: number; // 0-100
  readonly complianceStatus: ComplianceStatus;
}

/**
 * Compliance assessment status
 */
export type ComplianceStatus = 'compliant' | 'needs_review' | 'non_compliant';
