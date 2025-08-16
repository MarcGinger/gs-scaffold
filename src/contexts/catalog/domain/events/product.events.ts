/**
 * Product Events - Legacy Export File
 *
 * This file maintains backward compatibility while events have been
 * refactored to follow "one event per file" pattern.
 *
 * @deprecated Use individual event imports or the events/index.ts barrel export
 */

// Re-export all events from the new structure
export * from './index';

// Legacy compatibility - EventMetadata was previously exported here
export { EventMetadata } from './event-types';
