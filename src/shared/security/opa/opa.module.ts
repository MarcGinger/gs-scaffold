import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { OpaClient } from './opa.client';
import { OpaGuard } from './opa.guard';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [OpaClient, OpaGuard],
  exports: [OpaClient, OpaGuard],
})
export class OpaModule {}
