export * from './auth';
export * from './opa';
export * from './guards';
export * from './types';
export * from './errors';
export * from './config/security.config';
export * from './config/security-config.service';
export * from './config/security-config.module';
export * from './security.module';

// Enhanced Security Framework
export * from './audit';
export * from './data-protection/pii.types';
export * from './data-protection/pii-detector.service';
export * from './data-protection/pii-protection.service';
export * from './data-protection/pii-framework.service';
export * from './data-protection/data-protection.module';
export * from './monitoring/security-monitoring.service';
export * from './monitoring/monitoring.module';

// Framework configuration
export interface SecurityFrameworkConfig {
  audit?: import('./audit').AuditConfig;
  piiDetection?: {
    enabledDetectors?: import('./data-protection/pii.types').PIIFieldType[];
    confidenceThreshold?: number;
    scanDepth?: number;
  };
  monitoring?: {
    authDenialThreshold?: number;
    authFailureThreshold?: number;
    errorRateThreshold?: number;
  };
}
