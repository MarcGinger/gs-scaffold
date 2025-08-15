import { Module } from '@nestjs/common';
import { SecurityMonitoringService } from './security-monitoring.service';

/**
 * Security Monitoring Module
 * Provides security metrics collection and alerting
 */
@Module({
  providers: [SecurityMonitoringService],
  exports: [SecurityMonitoringService],
})
export class SecurityMonitoringModule {}
