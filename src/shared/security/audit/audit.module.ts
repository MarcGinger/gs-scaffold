import { Module, DynamicModule, Provider } from '@nestjs/common';
import { DecisionLoggerService } from './decision-logger.service';
import {
  IClock,
  IIdGenerator,
  SystemClock,
  UuidGenerator,
  AuditConfig,
} from './audit.interfaces';

/**
 * Production-ready audit module with dependency injection
 */
@Module({})
export class AuditModule {
  /**
   * Register audit module with default production configuration
   */
  static forRoot(config?: AuditConfig): DynamicModule {
    const providers: Provider[] = [
      DecisionLoggerService,
      {
        provide: 'CLOCK',
        useClass: SystemClock,
      },
      {
        provide: 'ID_GENERATOR',
        useClass: UuidGenerator,
      },
    ];

    if (config) {
      providers.push({
        provide: 'AUDIT_CONFIG',
        useValue: config,
      });
    }

    return {
      module: AuditModule,
      providers,
      exports: [DecisionLoggerService],
      global: true,
    };
  }

  /**
   * Register audit module for testing with mock dependencies
   */
  static forTesting(
    mockClock?: IClock,
    mockIdGenerator?: IIdGenerator,
    config?: AuditConfig,
  ): DynamicModule {
    const providers: Provider[] = [
      DecisionLoggerService,
      {
        provide: 'CLOCK',
        useValue: mockClock || new SystemClock(),
      },
      {
        provide: 'ID_GENERATOR',
        useValue: mockIdGenerator || new UuidGenerator(),
      },
    ];

    if (config) {
      providers.push({
        provide: 'AUDIT_CONFIG',
        useValue: config,
      });
    }

    return {
      module: AuditModule,
      providers,
      exports: [DecisionLoggerService],
    };
  }
}

/**
 * Production-optimized audit configuration
 */
export const PRODUCTION_AUDIT_CONFIG: AuditConfig = {
  sampling: {
    allowDecisions: 5, // 5% sampling for ALLOW decisions
    denyDecisions: 100, // Log all DENY decisions
    errorDecisions: 100, // Log all ERROR decisions
  },
  limits: {
    maxReasonLength: 500,
    maxMetadataSize: 8192, // 8KB
    maxPayloadSize: 16384, // 16KB
  },
  redaction: {
    maskIpAddresses: true,
    maskUserAgents: true,
    maskEmails: true,
    preserveNetworkPrefix: true,
  },
};

/**
 * Development-friendly audit configuration
 */
export const DEVELOPMENT_AUDIT_CONFIG: AuditConfig = {
  sampling: {
    allowDecisions: 100, // Log all decisions in development
    denyDecisions: 100,
    errorDecisions: 100,
  },
  limits: {
    maxReasonLength: 1000,
    maxMetadataSize: 16384, // 16KB
    maxPayloadSize: 32768, // 32KB
  },
  redaction: {
    maskIpAddresses: false, // Less redaction in development
    maskUserAgents: false,
    maskEmails: true, // Still mask emails
    preserveNetworkPrefix: false,
  },
};
