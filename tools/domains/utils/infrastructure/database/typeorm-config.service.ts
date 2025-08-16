import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';

@Injectable()
export class TypeormConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  public createTypeOrmOptions(): TypeOrmModuleOptions {
    const autoLoadEntities =
      this.configService.get<string>('DATABASE_AUTOLOADENTITIES', 'false') ===
      'true';

    return {
      type:
        (this.configService.get<string>('DATABASE_TYPE') as 'postgres') ||
        'postgres',
      host: this.configService.get<string>('DATABASE_HOST', ''),
      port: Number(this.configService.get<string>('DATABASE_PORT', '0')),
      database: this.configService.get<string>('DATABASE_NAME', ''),
      username: this.configService.get<string>('DATABASE_USER', ''),
      password: this.configService.get<string>('DATABASE_PASSWORD', ''),
      entities: ['dist/src/**/*.js'],
      migrations: ['dist/migrations/*.{ts,js}'],
      migrationsTableName: 'typeorm_migrations',
      logger: 'file',
      synchronize:
        this.configService.get<string>('DATABASE_SYNCHRONIZE', 'false') ===
        'true',
      dropSchema:
        this.configService.get<string>('DATABASE_DROPSCHEMA', 'false') ===
        'true',
      autoLoadEntities: autoLoadEntities ? true : undefined,
    };
  }
}
