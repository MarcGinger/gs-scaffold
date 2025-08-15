// ===== OPA Input Types =====

/** Standard CRUD and business action types */
export type ActionType =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'execute';

/** Domain resource kinds (extend per business domain) */
export type ResourceKind =
  | 'account'
  | 'transaction'
  | 'user'
  | 'policy'
  | 'document';

/** Environment literals */
export type Environment = 'dev' | 'staging' | 'prod';

export interface OpaInput {
  readonly subject: {
    readonly id: string;
    readonly tenant?: string;
    readonly roles: readonly string[];
    readonly client_id?: string;
    readonly permissions?: readonly string[];
  };
  readonly action: {
    /** High-level action type (CRUD, approve, execute, etc.) */
    readonly type: ActionType | string;
    /** Verb or use-case name (e.g., "transfer", "close-account") */
    readonly name: string;
  };
  readonly resource: {
    readonly type: ResourceKind | string;
    readonly tenant?: string;
    readonly id?: string;
    readonly ownerId?: string;
    readonly attributes?: Record<string, unknown>;
  };
  readonly context: {
    /** Correlates across systems (trace/span/correlation ID) */
    readonly correlationId: string;
    /** ISO 8601 timestamp (UTC recommended) */
    readonly time: string;
    readonly environment?: Environment | string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
    /** Break-glass / emergency access tokens (audit carefully) */
    readonly emergency_token?: string;
    /** Human approval token or reference (if using approvals) */
    readonly approval_token?: string;
    /** Optional request-scoped metadata you may pass through */
    readonly metadata?: Record<string, unknown>;
  };
}

// ===== OPA Decision Types =====

/** Stable codes for allow/deny reasons - machine-readable for metrics/alerts */
export type DecisionReasonCode =
  | 'ALLOW'
  | 'DENY'
  | 'MISSING_PERMISSION'
  | 'OWNERSHIP_REQUIRED'
  | 'TENANT_MISMATCH'
  | 'RISK_POLICY_DENY'
  | 'AUTHZ_TEMPORARILY_UNAVAILABLE'
  | 'AUTHZ_ERROR'
  | 'OPA_INVALID_RESPONSE';

/** Discriminated obligations with typed values */
export type OpaObligation =
  | { readonly type: 'mask'; readonly value: readonly string[] } // fields to mask
  | { readonly type: 'redact'; readonly value: readonly string[] } // fields to remove
  | { readonly type: 'watermark'; readonly value: string } // add watermark text
  | { readonly type: 'limit'; readonly value: number } // result size limit
  | { readonly type: 'reason'; readonly value: string } // human-readable reason
  | { readonly type: string; readonly value: unknown }; // future-proof

/** Policy metadata separate from decision for clarity */
export interface OpaPolicyMetadata {
  /** Semantic version or commit SHA of the policy bundle */
  readonly policy_version?: string;
  /** Optional rules snapshot (debugging/audit) */
  readonly policy_rules?: Record<string, unknown>;
  /** ISO 8601 UTC timestamp when decision was produced */
  readonly policy_timestamp?: string;
  /** Integrity/canonical hash of the evaluated policy set */
  readonly policy_checksum?: string;
}

/** Core authorization decision with enhanced metadata */
export interface OpaDecision extends OpaPolicyMetadata {
  readonly allow: boolean;
  /** Machine-readable reason code (use with logs/metrics) */
  readonly reason_code?: DecisionReasonCode | string;
  /** Human-friendly reason (safe to show to users) */
  readonly reason?: string;
  readonly obligations?: readonly OpaObligation[];
}

// ===== Circuit Breaker Types =====

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

/** Enhanced metrics with transition tracking and latency percentiles */
export interface OpaClientMetrics {
  readonly totalRequests: number;
  readonly successCount: number;
  readonly errorCount: number;
  readonly circuitBreakerState: CircuitBreakerState;
  /** Exponential moving average (ms) */
  readonly averageResponseTime: number;
  readonly lastError?: string;
  readonly lastErrorTime?: Date;
  /** When circuit breaker state last changed (useful for dashboards) */
  readonly lastTransitionAt?: Date;
  /** Optional additional latencies if you record them */
  readonly p95Ms?: number;
  readonly p99Ms?: number;
}

// ===== Usage Notes =====
/*
 * ISO 8601 Timestamps:
 * - Always use UTC: new Date().toISOString()
 * - Format: "2024-01-15T10:30:45.123Z"
 * - Required for policy_timestamp if policy metadata is returned
 *
 * Reason Codes:
 * - reason_code: stable for alerts/SLAs/metrics
 * - reason: human readable (can be localized later)
 *
 * Default Decision Handling:
 * - Boolean results: reason_code = result ? 'ALLOW' : 'DENY'
 * - Always include policy_version for audit trails
 *
 * Batch Operations:
 * - Ensure Rego policy supports array input
 * - Otherwise iterate per individual input
 */
