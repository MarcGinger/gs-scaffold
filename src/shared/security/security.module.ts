import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { OpaModule } from './opa/opa.module';
import { CompositeSecurityGuard } from './guards/composite-security.guard';
import securityConfig from './config/security.config';

@Module({
  imports: [ConfigModule.forFeature(securityConfig), AuthModule, OpaModule],
  providers: [CompositeSecurityGuard],
  exports: [AuthModule, OpaModule, CompositeSecurityGuard],
})
export class SecurityModule {}
