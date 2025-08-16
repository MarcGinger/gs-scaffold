import { DomainEvent } from './domain-event.base';

interface SerializedEvent {
  type: string;
  data: Record<string, any>;
  metadata: Record<string, any>;
}

// Type guard to check if event has props property
function hasProps(
  event: DomainEvent,
): event is DomainEvent & { props: Record<string, any> } {
  return (
    'props' in event &&
    typeof (event as Record<string, unknown>).props === 'object'
  );
}

export function serializeDomainEvent<T extends DomainEvent>(
  event: T,
): SerializedEvent {
  return {
    type: event.eventType,
    data: {
      // ✅ Pure business domain data only (no technical/infrastructure fields)
      // Spread only the domain properties if they exist (e.g., from CurrencyDomainEvent.props)
      ...(hasProps(event) ? event.props : {}),
      // Remove: aggregateId, eventType (these are infrastructure/technical concerns)
    },
    metadata: {
      // ✅ Technical metadata (infrastructure + domain context)
      occurredAt: event.occurredAt, // Already a string in DomainEvent
      aggregateId: event.aggregateId, // ✅ Move to metadata (technical field)
      eventType: event.eventType, // ✅ Move to metadata (technical field)
      userId: event.userId,
      tenant: event.tenant,
      tenantId: event.tenantId,
      username: event.username,
    },
  };
}
