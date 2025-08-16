import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TypeormConfigService } from '../typeorm-config.service';

describe('TypeormConfigService', () => {
  let service: TypeormConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeormConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              const values: Record<string, string> = {
                DATABASE_TYPE: 'postgres',
                DATABASE_HOST: 'localhost',
                DATABASE_PORT: '5432',
                DATABASE_NAME: 'testdb',
                DATABASE_USER: 'testuser',
                DATABASE_PASSWORD: 'testpass',
                DATABASE_SYNCHRONIZE: 'true',
                DATABASE_DROPSCHEMA: 'false',
                DATABASE_AUTOLOADENTITIES: 'true',
              };
              return values[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TypeormConfigService>(TypeormConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return correct TypeOrmModuleOptions from config', () => {
    const options = service.createTypeOrmOptions();
    expect(options).toEqual({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'testuser',
      password: 'testpass',
      entities: ['dist/src/**/*.js'],
      migrations: ['dist/migrations/*.{ts,js}'],
      migrationsTableName: 'typeorm_migrations',
      logger: 'file',
      synchronize: true,
      dropSchema: false,
      autoLoadEntities: true,
    });
  });

  it('should use default values if config is missing', () => {
    jest
      .spyOn(configService, 'get')
      .mockImplementation((key: string, def?: string) => def);
    const options = service.createTypeOrmOptions();
    expect(options).toEqual({
      type: 'postgres',
      host: '',
      port: 0,
      database: '',
      username: '',
      password: '',
      entities: ['dist/src/**/*.js'],
      migrations: ['dist/migrations/*.{ts,js}'],
      migrationsTableName: 'typeorm_migrations',
      logger: 'file',
      synchronize: false,
      dropSchema: false,
      autoLoadEntities: undefined,
    });
  });
});
