import { Module } from '@nestjs/common';
import { AuthTestController } from './auth-test.controller';
import { SecurityModule } from 'src/shared/security';

@Module({
  imports: [SecurityModule],
  controllers: [AuthTestController],
})
export class AuthTestModule {}
