// Core service
export { DecisionLoggerService } from './decision-logger.service';

// Module registration
export {
  AuditModule,
  PRODUCTION_AUDIT_CONFIG,
  DEVELOPMENT_AUDIT_CONFIG,
} from './audit.module';

// Types and interfaces
export {
  IClock,
  IIdGenerator,
  SystemClock,
  UuidGenerator,
  AuditConfig,
} from './audit.interfaces';

export {
  TypedAuditLogEntry,
  SecurityObligation,
  SecurityReasonCode,
  AuditEventType,
} from './audit.types';

// Utilities
export { RedactionUtil } from './redaction.util';
