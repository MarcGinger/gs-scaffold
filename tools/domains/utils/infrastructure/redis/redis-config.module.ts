import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { LoggerModule } from 'src/shared/logger';
import { RedisUtilityService } from './redis-utility.service';

const getRedisConfig = (configService: ConfigService) => ({
  host: configService.get<string>('REDIS_HOST'),
  port: configService.get<number>('REDIS_PORT'),
  password: configService.get<string>('REDIS_PASSWORD'),
  db: configService.get<number>('REDIS_DB') ?? 0,
});

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        config: getRedisConfig(configService),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: 'RedisModuleOptions',
      useFactory: (configService: ConfigService) => {
        return getRedisConfig(configService);
      },
      inject: [ConfigService],
    },
    RedisUtilityService,
  ],
  exports: [
    RedisModule,
    RedisConfigModule,
    RedisUtilityService,
    'RedisModuleOptions',
  ],
})
export class RedisConfigModule {}
