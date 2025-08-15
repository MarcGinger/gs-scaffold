import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { AxiosError } from 'axios';
import { AuthErrors } from '../errors/auth.errors';
import {
  OpaInput,
  OpaDecision,
  CircuitBreakerState,
  OpaClientMetrics,
} from './opa.types';

// Helper functions for metrics and timing
function nowMs(): number {
  return Date.now();
}

function ema(prev: number, sample: number, alpha = 0.2): number {
  return prev === 0 ? sample : alpha * sample + (1 - alpha) * prev;
}

@Injectable()
export class OpaClient {
  private readonly logger = new Logger(OpaClient.name);
  private readonly opaUrl: string;
  private readonly requestTimeout: number;

  // Circuit breaker state
  private circuitBreakerState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private halfOpenTrials = 0;

  // Configuration
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly maxHalfOpenTrials: number;

  // Metrics
  private metrics: OpaClientMetrics = {
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    circuitBreakerState: CircuitBreakerState.CLOSED,
    averageResponseTime: 0,
  };

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    // Remove trailing slashes and validate URL
    const baseUrl =
      this.config.get<string>('OPA_URL') ?? 'http://localhost:8181';
    this.opaUrl = baseUrl.replace(/\/+$/, '');

    // Validate and set timeouts
    this.requestTimeout = Number(
      this.config.get<number>('OPA_TIMEOUT_MS') ?? 5000,
    );
    this.failureThreshold = Number(
      this.config.get<number>('OPA_CIRCUIT_BREAKER_FAILURE_THRESHOLD') ?? 5,
    );
    this.recoveryTimeoutMs = Number(
      this.config.get<number>('OPA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS') ??
        60000,
    );
    this.successThreshold = Number(
      this.config.get<number>('OPA_CIRCUIT_BREAKER_SUCCESS_THRESHOLD') ?? 3,
    );
    this.maxHalfOpenTrials = Number(
      this.config.get<number>('OPA_CIRCUIT_BREAKER_MAX_HALF_OPEN_TRIALS') ?? 5,
    );

    // Validate configuration
    if (
      this.requestTimeout <= 0 ||
      this.failureThreshold <= 0 ||
      this.recoveryTimeoutMs <= 0
    ) {
      throw AuthErrors.authorizationConfigurationInvalid(
        'timeouts and thresholds must be positive numbers',
      );
    }
  }

  async evaluate(
    policy: string,
    input: OpaInput,
    ctx?: {
      correlationId?: string;
      tenantId?: string;
      userId?: string;
    },
  ): Promise<OpaDecision> {
    this.metrics.totalRequests++;

    if (this.isCircuitBreakerOpen()) {
      this.metrics.errorCount++;
      return this.createUnavailableDecision(ctx);
    }

    const url = `${this.opaUrl}/v1/data/${this.toPolicyPath(policy)}`;
    const started = nowMs();

    try {
      const response = await firstValueFrom(
        this.http
          .post(
            url,
            { input },
            {
              timeout: this.requestTimeout,
              headers: {
                'x-correlation-id': ctx?.correlationId ?? '',
                'x-tenant-id': ctx?.tenantId ?? '',
                'x-user-id': ctx?.userId ?? '',
              },
            },
          )
          .pipe(
            catchError((err: AxiosError) => {
              // AxiosError safe logging with truncation
              const status = err.response?.status;
              const data = err.response?.data;
              this.logger.error(
                `OPA request failed (status=${status})`,
                typeof data === 'string'
                  ? data.slice(0, 2000)
                  : JSON.stringify(data ?? {}).slice(0, 2000),
              );
              throw err;
            }),
          ),
      );

      const elapsed = nowMs() - started;
      this.metrics.averageResponseTime = ema(
        this.metrics.averageResponseTime,
        elapsed,
      );
      this.recordSuccess();

      return this.processOpaResponse(response.data);
    } catch (err: any) {
      const elapsed = nowMs() - started;
      this.metrics.averageResponseTime = ema(
        this.metrics.averageResponseTime,
        elapsed,
      );

      this.recordFailure(err);
      return this.handleOpaError(err, {
        operation: 'evaluate',
        correlationId: ctx?.correlationId,
        tenantId: ctx?.tenantId,
        userId: ctx?.userId,
      });
    }
  }

  async evaluateBatch(
    policy: string,
    inputs: OpaInput[],
    ctx?: {
      correlationId?: string;
      tenantId?: string;
      userId?: string;
    },
  ): Promise<OpaDecision[]> {
    this.metrics.totalRequests++;

    if (this.isCircuitBreakerOpen()) {
      this.metrics.errorCount++;
      const unavailableDecision = this.createUnavailableDecision(ctx);
      return inputs.map(() => unavailableDecision);
    }

    const url = `${this.opaUrl}/v1/data/${this.toPolicyPath(policy)}`;
    const started = nowMs();

    try {
      const response = await firstValueFrom(
        this.http
          .post(
            url,
            { inputs },
            {
              timeout: this.requestTimeout * 2, // batch operations get more time
              headers: {
                'x-correlation-id': ctx?.correlationId ?? '',
                'x-tenant-id': ctx?.tenantId ?? '',
                'x-user-id': ctx?.userId ?? '',
              },
            },
          )
          .pipe(
            catchError((err: AxiosError) => {
              const status = err.response?.status;
              const data = err.response?.data;
              this.logger.error(
                `OPA batch request failed (status=${status})`,
                typeof data === 'string'
                  ? data.slice(0, 2000)
                  : JSON.stringify(data ?? {}).slice(0, 2000),
              );
              throw err;
            }),
          ),
      );

      const elapsed = nowMs() - started;
      this.metrics.averageResponseTime = ema(
        this.metrics.averageResponseTime,
        elapsed,
      );
      this.recordSuccess();

      return this.processBatchOpaResponse(response.data);
    } catch (err: any) {
      const elapsed = nowMs() - started;
      this.metrics.averageResponseTime = ema(
        this.metrics.averageResponseTime,
        elapsed,
      );

      this.recordFailure(err);
      const errorDecision = this.handleOpaError(err, {
        operation: 'evaluateBatch',
        correlationId: ctx?.correlationId,
        tenantId: ctx?.tenantId,
        userId: ctx?.userId,
      });
      return inputs.map(() => errorDecision);
    }
  }

  getMetrics(): OpaClientMetrics {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreakerState,
    };
  }

  // ========== Circuit Breaker Implementation ==========

  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
      return false;
    }

    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      // Transition to HALF_OPEN after recovery timeout
      if (
        this.lastFailureTime &&
        nowMs() - this.lastFailureTime > this.recoveryTimeoutMs
      ) {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
        this.halfOpenTrials = 0;
        this.logger.debug('Circuit breaker -> HALF_OPEN');
        return false; // let a trial call through
      }
      return true; // still OPEN
    }

    // HALF_OPEN: allow limited probing calls
    if (this.halfOpenTrials >= this.maxHalfOpenTrials) {
      return true; // too many trials, block further requests
    }
    this.halfOpenTrials++;
    return false;
  }

  private recordSuccess(): void {
    this.metrics.successCount++;

    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.circuitBreakerState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.halfOpenTrials = 0;
        this.logger.log('Circuit breaker -> CLOSED');
      }
    } else if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
      this.failureCount = 0; // Reset failure count on success
    }
  }

  private recordFailure(error: unknown): void {
    this.metrics.errorCount++;
    this.metrics.lastError =
      error instanceof Error ? error.message : String(error);
    this.metrics.lastErrorTime = new Date();

    this.failureCount++;
    this.lastFailureTime = nowMs();

    if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
      if (this.failureCount >= this.failureThreshold) {
        this.circuitBreakerState = CircuitBreakerState.OPEN;
        this.logger.warn('Circuit breaker -> OPEN');
      }
    } else if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      // Any failure in HALF_OPEN returns to OPEN immediately
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      this.halfOpenTrials = 0;
      this.logger.warn('Circuit breaker HALF_OPEN failure -> OPEN');
    }
  }

  // ========== Response Processing ==========

  private processOpaResponse(data: any): OpaDecision {
    const result = data?.result;

    if (result == null) {
      return this.failureDecision(
        'OPA_INVALID_RESPONSE',
        'Invalid OPA response format',
      );
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
      obligations: Array.isArray(result.obligations) ? result.obligations : [],
      policy_version: result.policy_version || '1.0.0',
      policy_rules: result.policy_rules,
      policy_timestamp: result.policy_timestamp,
    };
  }

  private processBatchOpaResponse(data: any): OpaDecision[] {
    const results = data?.result;

    if (!Array.isArray(results)) {
      // Return failure decision rather than throw to avoid breaking the call chain
      return [
        this.failureDecision(
          'OPA_INVALID_RESPONSE',
          'Invalid batch OPA response format',
        ),
      ];
    }

    return results.map((r: any) => {
      if (typeof r === 'boolean') {
        return { allow: r, policy_version: '1.0.0' };
      }
      return {
        allow: Boolean(r?.allow),
        reason: r?.reason,
        obligations: Array.isArray(r?.obligations) ? r.obligations : [],
        policy_version: r?.policy_version || '1.0.0',
        policy_rules: r?.policy_rules,
        policy_timestamp: r?.policy_timestamp,
      };
    });
  }

  private failureDecision(code: string, reason: string): OpaDecision {
    return {
      allow: false,
      reason,
      policy_version: code,
    };
  }

  /**
   * Enhanced error logging and decision creation with AuthErrors integration
   */
  private handleOpaError(
    error: unknown,
    context: {
      operation: string;
      correlationId?: string;
      tenantId?: string;
      userId?: string;
    },
  ): OpaDecision {
    // Log structured error with context
    this.logger.error(`OPA ${context.operation} failed`, {
      error: error instanceof Error ? error.message : String(error),
      correlationId: context.correlationId,
      tenantId: context.tenantId,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    });

    // Return structured failure decision
    return this.failureDecision('AUTHZ_ERROR', 'Authorization service error');
  }

  /**
   * Create authorization unavailable decision with proper error structure
   */
  private createUnavailableDecision(context?: {
    correlationId?: string;
    tenantId?: string;
    userId?: string;
  }): OpaDecision {
    this.logger.warn('Authorization service circuit breaker OPEN', {
      correlationId: context?.correlationId,
      tenantId: context?.tenantId,
      userId: context?.userId,
      circuitBreakerState: this.circuitBreakerState,
      timestamp: new Date().toISOString(),
    });

    return this.failureDecision(
      'AUTHZ_TEMPORARILY_UNAVAILABLE',
      'Authorization service temporarily unavailable',
    );
  }

  private toPolicyPath(policy: string): string {
    // "authz.allow" -> "authz/allow" with encoding per segment for safety
    return policy
      .split('.')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
  }
}
