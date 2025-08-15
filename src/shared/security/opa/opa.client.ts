import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import {
  OpaInput,
  OpaDecision,
  CircuitBreakerState,
  OpaClientMetrics,
} from './opa.types';

@Injectable()
export class OpaClient {
  private readonly logger = new Logger(OpaClient.name);
  private readonly opaUrl: string;
  private readonly requestTimeout: number;

  // Circuit breaker state
  private circuitBreakerState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: Date;
  private successCount = 0;

  // Configuration
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly successThreshold: number;

  // Metrics
  private metrics: OpaClientMetrics = {
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    circuitBreakerState: CircuitBreakerState.CLOSED,
    averageResponseTime: 0,
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.opaUrl =
      this.configService.get<string>('OPA_URL') || 'http://localhost:8181';
    this.requestTimeout =
      this.configService.get<number>('OPA_TIMEOUT_MS') || 5000;
    this.failureThreshold =
      this.configService.get<number>('OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD') ||
      5;
    this.recoveryTimeoutMs =
      this.configService.get<number>(
        'OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS',
      ) || 60000;
    this.successThreshold =
      this.configService.get<number>('OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD') ||
      3;
  }

  async evaluate(policy: string, input: OpaInput): Promise<OpaDecision> {
    this.metrics.totalRequests++;

    try {
      // Check circuit breaker state
      if (this.isCircuitBreakerOpen()) {
        this.metrics.errorCount++;
        return this.createFailureDecision(
          'Authorization service temporarily unavailable',
        );
      }

      // Make the request
      const url = `${this.opaUrl}/v1/data/${policy.replace(/\./g, '/')}`;
      const response = await firstValueFrom(
        this.httpService.post(url, { input }).pipe(
          timeout(this.requestTimeout),
          catchError((error) => {
            this.logger.error('OPA request failed', error.message);
            return throwError(() => error);
          }),
        ),
      );

      // Record success
      this.recordSuccess();

      // Process response
      const decision = this.processOpaResponse(response.data);
      return decision;
    } catch (error) {
      this.recordFailure(error);
      return this.createFailureDecision('Authorization service error');
    }
  }

  async evaluateBatch(
    policy: string,
    inputs: OpaInput[],
  ): Promise<OpaDecision[]> {
    this.metrics.totalRequests++;

    try {
      if (this.isCircuitBreakerOpen()) {
        this.metrics.errorCount++;
        return inputs.map(() =>
          this.createFailureDecision(
            'Authorization service temporarily unavailable',
          ),
        );
      }

      const url = `${this.opaUrl}/v1/data/${policy.replace(/\./g, '/')}`;
      const response = await firstValueFrom(
        this.httpService.post(url, { inputs }).pipe(
          timeout(this.requestTimeout * 2),
          catchError((error) => {
            this.logger.error('OPA batch request failed', error.message);
            return throwError(() => error);
          }),
        ),
      );

      this.recordSuccess();
      return this.processBatchOpaResponse(response.data);
    } catch (error) {
      this.recordFailure(error);
      return inputs.map(() =>
        this.createFailureDecision('Authorization service error'),
      );
    }
  }

  getMetrics(): OpaClientMetrics {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreakerState,
    };
  }

  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
      return false;
    }

    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      // Check if we should transition to half-open
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime.getTime() > this.recoveryTimeoutMs
      ) {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
        this.logger.debug('Circuit breaker transitioned to HALF_OPEN');
        return false;
      }
      return true;
    }

    // HALF_OPEN state
    return false;
  }

  private recordSuccess(): void {
    this.metrics.successCount++;

    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.circuitBreakerState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.logger.log('Circuit breaker transitioned to CLOSED');
      }
    } else if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
      this.failureCount = 0; // Reset failure count on success
    }
  }

  private recordFailure(error: any): void {
    this.metrics.errorCount++;
    this.metrics.lastError =
      error instanceof Error ? error.message : 'Unknown error';
    this.metrics.lastErrorTime = new Date();

    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
      if (this.failureCount >= this.failureThreshold) {
        this.circuitBreakerState = CircuitBreakerState.OPEN;
        this.logger.warn('Circuit breaker transitioned to OPEN');
      }
    } else if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      this.logger.warn('Circuit breaker transitioned back to OPEN');
    }
  }

  private processOpaResponse(data: any): OpaDecision {
    const result = data.result;

    if (!result) {
      return this.createFailureDecision('Invalid OPA response format');
    }

    // Handle boolean result (simple allow/deny)
    if (typeof result === 'boolean') {
      return {
        allow: result,
        policy_version: '1.0.0',
      };
    }

    // Handle object result with detailed information
    return {
      allow: Boolean(result.allow),
      reason: result.reason,
      obligations: result.obligations || [],
      policy_version: result.policy_version || '1.0.0',
      policy_rules: result.policy_rules,
      policy_timestamp: result.policy_timestamp,
    };
  }

  private processBatchOpaResponse(data: any): OpaDecision[] {
    const results = data.result;

    if (!Array.isArray(results)) {
      throw new Error('Invalid batch OPA response format');
    }

    return results.map((result: any) => {
      if (typeof result === 'boolean') {
        return {
          allow: result,
          policy_version: '1.0.0',
        };
      }

      return {
        allow: Boolean(result.allow),
        reason: result.reason,
        obligations: result.obligations || [],
        policy_version: result.policy_version || '1.0.0',
        policy_rules: result.policy_rules,
        policy_timestamp: result.policy_timestamp,
      };
    });
  }

  private createFailureDecision(reason: string): OpaDecision {
    return {
      allow: false,
      reason,
      policy_version: 'error',
    };
  }
}
