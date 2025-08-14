import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import securityConfig from './config/security.config';

@Module({
  imports: [ConfigModule.forFeature(securityConfig), AuthModule],
  exports: [AuthModule],
})
export class SecurityModule {}
