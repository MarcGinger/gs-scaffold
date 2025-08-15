// OPA input interface for authorization requests
export interface OpaInput {
  subject: {
    id: string;
    tenant?: string;
    roles: string[];
    client_id?: string;
    permissions?: string[];
  };
  action: {
    type: string;
    name: string;
  };
  resource: {
    type: string;
    tenant?: string;
    id?: string;
    ownerId?: string;
    attributes?: Record<string, any>;
  };
  context: {
    correlationId: string;
    time: string;
    environment?: string;
    ipAddress?: string;
    userAgent?: string;
    emergency_token?: string;
    approval_token?: string;
  };
}

// OPA decision response interface
export interface OpaDecision {
  allow: boolean;
  reason?: string;
  obligations?: Array<{
    type: string;
    value: any;
  }>;
  policy_version?: string;
  policy_rules?: Record<string, any>;
  policy_timestamp?: string;
  policy_checksum?: string;
}

// Circuit breaker states
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

// OPA client metrics
export interface OpaClientMetrics {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  circuitBreakerState: CircuitBreakerState;
  averageResponseTime: number;
  lastError?: string;
  lastErrorTime?: Date;
}
