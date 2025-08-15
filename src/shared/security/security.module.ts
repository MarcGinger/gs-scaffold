import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { OpaModule } from './opa/opa.module';
import { CompositeSecurityGuard } from './guards/composite-security.guard';
import { SecurityConfigModule } from './config/security-config.module';
import { DataProtectionModule } from './data-protection/data-protection.module';
import { SecurityMonitoringModule } from './monitoring/security-monitoring.module';

@Module({
  imports: [
    SecurityConfigModule,
    AuthModule,
    OpaModule,
    DataProtectionModule,
    SecurityMonitoringModule,
  ],
  providers: [CompositeSecurityGuard],
  exports: [
    SecurityConfigModule,
    AuthModule,
    OpaModule,
    CompositeSecurityGuard,
    DataProtectionModule,
    SecurityMonitoringModule,
  ],
})
export class SecurityModule {}
