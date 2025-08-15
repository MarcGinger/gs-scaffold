import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { OpaModule } from './opa/opa.module';
import { CompositeSecurityGuard } from './guards/composite-security.guard';
import { SecurityConfigModule } from './config/security-config.module';

@Module({
  imports: [SecurityConfigModule, AuthModule, OpaModule],
  providers: [CompositeSecurityGuard],
  exports: [
    SecurityConfigModule,
    AuthModule,
    OpaModule,
    CompositeSecurityGuard,
  ],
})
export class SecurityModule {}
