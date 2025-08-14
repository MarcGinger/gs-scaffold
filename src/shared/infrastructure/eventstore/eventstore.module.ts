import { Module, Global } from '@nestjs/common';
import { EventStoreService } from './eventstore.service';

@Global()
@Module({
  providers: [EventStoreService],
  exports: [
    EventStoreService,
    // Export the underlying client for explicit injection in infrastructure
    {
      provide: 'EventStoreDBClient',
      inject: [EventStoreService],
      useFactory: (eventStoreService: EventStoreService) => {
        return eventStoreService.getClient();
      },
    },
  ],
})
export class EventStoreModule {}
