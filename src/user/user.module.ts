import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { LoggingModule } from '../shared/logging/logging.module';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';

// Create service-specific logger factory
const userLoggerFactory = createServiceLoggerFactory('user-service');

@Module({
  imports: [LoggingModule],
  controllers: [UserController],
  providers: [
    UserService,
    // Each module can register its own app logger with service name
    userLoggerFactory.createAppLoggerProvider(),
  ],
  exports: [UserService],
})
export class UserModule {}
