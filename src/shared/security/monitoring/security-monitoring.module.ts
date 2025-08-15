import { Module } from '@nestjs/common';
import { LoggingModule } from '../../logging/logging.module';
import { SecurityMonitoringService } from './security-monitoring.service';

@Module({
  imports: [LoggingModule],
  providers: [SecurityMonitoringService],
  exports: [SecurityMonitoringService],
})
export class SecurityMonitoringModule {}
