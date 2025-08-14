import { Module } from '@nestjs/common';
import { AuthTestController } from './auth-test.controller';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [AuthTestController],
})
export class AuthTestModule {}
