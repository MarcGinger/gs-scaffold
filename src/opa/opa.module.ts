import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { OpaService } from './opa.service';
import { OpaController } from './opa.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [OpaService],
  controllers: [OpaController],
  exports: [OpaService],
})
export class OpaModule {}
