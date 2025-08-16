/**
 * Shared event types and interfaces
 * Used across all product domain events
 */

/**
 * Base event metadata interface
 * Contains contextual information for all domain events
 */
export interface EventMetadata {
  correlationId: string;
  userId: string;
  tenantId: string;
  timestamp?: Date;
}

/**
 * Product change tracking interface
 * Used to track field-level changes in product updates
 */
export interface ProductChangeSet {
  name?: { old: string; new: string };
  description?: { old?: string; new?: string };
}
