import { Module } from '@nestjs/common';
import { PinoLogger } from './logger.service';

@Module({
  providers: [
    // Make PinoLogger available for injection throughout the application
    PinoLogger,
    // Also provide it as a NestJS LoggerService using token
    {
      provide: 'ILogger',
      useClass: PinoLogger,
    },
  ],
  exports: ['ILogger'],
})
export class LoggerModule {}
