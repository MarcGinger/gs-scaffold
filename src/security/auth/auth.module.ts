import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { TokenToUserMapper } from './token-to-user.mapper';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), ConfigModule],
  providers: [JwtStrategy, TokenToUserMapper, JwtAuthGuard],
  exports: [JwtStrategy, TokenToUserMapper, JwtAuthGuard],
})
export class AuthModule {}
