/**
 * Product Domain Events
 *
 * This module exports all product-related domain events following
 * the "one event per file" pattern for better organization and maintainability.
 */

// Shared types
export { EventMetadata, ProductChangeSet } from './event-types';

// Individual events
export {
  ProductCreatedEvent,
  ProductCreatedEventPayload,
} from './product-created.event';

export {
  ProductUpdatedEvent,
  ProductUpdatedEventPayload,
} from './product-updated.event';

export {
  ProductPriceChangedEvent,
  ProductPriceChangedEventPayload,
} from './product-price-changed.event';

export {
  ProductCategorizedEvent,
  ProductCategorizedEventPayload,
} from './product-categorized.event';

export {
  ProductActivatedEvent,
  ProductActivatedEventPayload,
} from './product-activated.event';

export {
  ProductDeactivatedEvent,
  ProductDeactivatedEventPayload,
} from './product-deactivated.event';

export {
  ProductDeletedEvent,
  ProductDeletedEventPayload,
} from './product-deleted.event';

// Import individual events for the collection
import { ProductCreatedEvent } from './product-created.event';
import { ProductUpdatedEvent } from './product-updated.event';
import { ProductPriceChangedEvent } from './product-price-changed.event';
import { ProductCategorizedEvent } from './product-categorized.event';
import { ProductActivatedEvent } from './product-activated.event';
import { ProductDeactivatedEvent } from './product-deactivated.event';
import { ProductDeletedEvent } from './product-deleted.event';

// Export collection for easier imports (maintaining backward compatibility)
export const ProductEvents = {
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductPriceChangedEvent,
  ProductCategorizedEvent,
  ProductActivatedEvent,
  ProductDeactivatedEvent,
  ProductDeletedEvent,
} as const;
