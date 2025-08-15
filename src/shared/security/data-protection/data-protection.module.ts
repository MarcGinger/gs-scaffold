import { Module } from '@nestjs/common';
import { LoggingModule } from '../../logging/logging.module';
import { PIIDetectorService } from './pii-detector.service';
import { PIIProtectionService } from './pii-protection.service';
import { PIIFrameworkService } from './pii-framework.service';

/**
 * PII Data Protection Module
 * Provides comprehensive PII detection and protection services
 */
@Module({
  imports: [LoggingModule],
  providers: [PIIDetectorService, PIIProtectionService, PIIFrameworkService],
  exports: [PIIDetectorService, PIIProtectionService, PIIFrameworkService],
})
export class DataProtectionModule {}
