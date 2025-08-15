import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { OpaClient } from './opa.client';
import { OpaGuard } from './opa.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [HttpModule, ConfigModule, AuditModule.forRoot()],
  providers: [OpaClient, OpaGuard],
  exports: [OpaClient, OpaGuard],
})
export class OpaModule {}
