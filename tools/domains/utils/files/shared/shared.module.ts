import { Module } from '@nestjs/common';
import { LoggerModule } from 'src/shared/logger';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [CqrsModule, ConfigModule.forRoot(), LoggerModule],
  providers: [ConfigService],
  exports: [CqrsModule, ConfigModule, ConfigService, LoggerModule],
})
export class SharedModule {}
