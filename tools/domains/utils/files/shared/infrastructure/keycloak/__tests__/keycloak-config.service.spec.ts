import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeycloakConfigService } from '../keycloak-config.service';
import { PolicyEnforcementMode, TokenValidation } from 'nest-keycloak-connect';

describe('KeycloakConfigService', () => {
  let service: KeycloakConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeycloakConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              const values: Record<string, string> = {
                KEYCLOAK_URL: 'http://localhost:8080',
                KEYCLOAK_REALM: 'test-realm',
                KEYCLOAK_CLIENTID: 'test-client',
                KEYCLOAK_SECRET: 'test-secret',
              };
              return values[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KeycloakConfigService>(KeycloakConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return correct KeycloakConnectOptions', () => {
    const options = service.createKeycloakConnectOptions();
    expect(options).toEqual({
      authServerUrl: 'http://localhost:8080',
      realm: 'test-realm',
      clientId: 'test-client',
      secret: 'test-secret',
      policyEnforcement: PolicyEnforcementMode.PERMISSIVE,
      tokenValidation: TokenValidation.ONLINE,
    });
  });

  it('should use default values if config is missing', () => {
    jest
      .spyOn(configService, 'get')
      .mockImplementation((key: string, def?: string) => def);
    const options = service.createKeycloakConnectOptions();
    expect(options).toEqual({
      authServerUrl: '',
      realm: '',
      clientId: '',
      secret: '',
      policyEnforcement: PolicyEnforcementMode.PERMISSIVE,
      tokenValidation: TokenValidation.ONLINE,
    });
  });
});
