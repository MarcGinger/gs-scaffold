/**
 * Outbox record entity for reliable event publishing
 */
export interface OutboxRecord {
  id: string; // UUID
  eventId: string; // ESDB event id
  type: string; // domain event type
  payload: any; // original event payload
  metadata: any; // envelope
  status: 'pending' | 'published' | 'failed';
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  lastError?: string;
  nextRetryAt?: Date;
}

/**
 * Repository interface for outbox operations
 */
export interface OutboxRepository {
  add(records: OutboxRecord[]): Promise<void>;
  nextBatch(limit: number): Promise<OutboxRecord[]>;
  markPublished(ids: string[]): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  retryFailed(maxAttempts?: number): Promise<OutboxRecord[]>;
  cleanup(olderThanDays: number): Promise<number>;
}

/**
 * Standard job metadata for BullMQ jobs
 */
export interface StandardJobMetadata {
  correlationId: string;
  causationId?: string;
  source: string;
  timestamp: string; // ISO
  user?: { id: string; email?: string; tenant?: string };
  businessContext?: Record<string, any>;
}
