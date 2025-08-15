import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { OpaClient } from '../../opa/opa.client';
import { ConfigManager } from '../../../config/config.manager';
import { APP_LOGGER } from '../../../logging/logging.providers';
import { OpaInput, OpaDecision } from '../../opa/opa.types';
import { AuthErrors } from '../../errors/auth.errors';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('OpaClient', () => {
  let opaClient: OpaClient;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockLogger: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    } as any;

    mockConfigManager = {
      get: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpaClient,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigManager,
          useValue: mockConfigManager,
        },
        {
          provide: APP_LOGGER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    // Mock configuration values
    mockConfigManager.get.mockImplementation(
      (key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          OPA_DECISION_PATH: '/v1/data/authz/allow',
          OPA_BASE_URL: 'http://localhost:8181',
          OPA_REQUEST_TIMEOUT_MS: '5000',
          OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '5',
          OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS: '60000',
        };
        return config[key] || defaultValue || '';
      },
    );

    opaClient = module.get<OpaClient>(OpaClient);
  });

  describe('evaluate', () => {
    const mockInput: OpaInput = {
      subject: {
        id: 'user-123',
        roles: ['user'],
        tenant: 'default',
      },
      action: {
        type: 'read',
        name: 'document.read',
      },
      resource: {
        type: 'document',
        id: 'doc-123',
      },
      context: {
        correlationId: 'test-correlation-123',
        time: new Date().toISOString(),
        environment: 'production',
      },
    };

    it('should return ALLOW decision for successful authorization', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          result: {
            allow: true,
            reason_code: 'ALLOW',
            reason: 'User has required permissions',
            obligations: [],
            policy_version: '1.0.0',
            policy_rules: ['user_read_access'],
            policy_timestamp: new Date().toISOString(),
            policy_checksum: 'abc123',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await opaClient.evaluate('authz.allow', mockInput);

      expect(result).toBeDefined();
      expect(result.allow).toBe(true);
      expect(result.reasonCode).toBe('ALLOW');
    });

    it('should return DENY decision for failed authorization', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          result: {
            allow: false,
            reason_code: 'MISSING_PERMISSION',
            reason: 'User lacks required role',
            obligations: [],
            policy_version: '1.0.0',
            policy_rules: ['user_read_access'],
            policy_timestamp: new Date().toISOString(),
            policy_checksum: 'abc123',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await opaClient.evaluate('authz.allow', mockInput);

      expect(result).toBeDefined();
      expect(result.allow).toBe(false);
      expect(result.reasonCode).toBe('MISSING_PERMISSION');
    });

    it('should handle HTTP errors and return AUTHZ_ERROR', async () => {
      const error = new Error('Network error');
      mockHttpService.post.mockReturnValue(throwError(() => error));

      const result = await opaClient.evaluate('authz.allow', mockInput);

      expect(result).toBeDefined();
      expect(result.allow).toBe(false);
      expect(result.reasonCode).toBe('AUTHZ_ERROR');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle circuit breaker open state', async () => {
      // Force circuit breaker to open by simulating failures
      const error = new Error('Service unavailable');
      mockHttpService.post.mockReturnValue(throwError(() => error));

      // Simulate multiple failures to open circuit breaker
      for (let i = 0; i < 6; i++) {
        await opaClient.evaluate('authz.allow', mockInput);
      }

      // Next call should be circuit breaker response
      const result = await opaClient.evaluate('authz.allow', mockInput);
      expect(result.reasonCode).toBe('AUTHZ_TEMPORARILY_UNAVAILABLE');
    });
  });

  describe('circuit breaker', () => {
    it('should track failure count and open circuit after threshold', async () => {
      const error = new Error('Service error');
      mockHttpService.post.mockReturnValue(throwError(() => error));

      // Make enough failed requests to open circuit
      for (let i = 0; i < 5; i++) {
        await opaClient.checkPermission({} as OpaInput);
      }

      // Verify circuit breaker behavior
      const result = await opaClient.checkPermission({} as OpaInput);
      expect(result.reasonCode).toBe('AUTHZ_TEMPORARILY_UNAVAILABLE');
    });
  });

  describe('configuration', () => {
    it('should use configured OPA endpoints and timeouts', () => {
      expect(mockConfigManager.get).toHaveBeenCalledWith(
        'OPA_BASE_URL',
        'http://localhost:8181',
      );
      expect(mockConfigManager.get).toHaveBeenCalledWith(
        'OPA_DECISION_PATH',
        '/v1/data/authz/allow',
      );
      expect(mockConfigManager.get).toHaveBeenCalledWith(
        'OPA_REQUEST_TIMEOUT_MS',
        '5000',
      );
    });
  });
});
