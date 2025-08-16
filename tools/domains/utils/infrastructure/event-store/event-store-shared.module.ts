import { Module } from '@nestjs/common';
import { EventStoreModule } from './event-store.module';
import { SharedModule } from 'src/shared/shared.module';
import { EventStoreService } from './event-store.service';
import { EventStoreProjectionsModule } from './projections/projections.module';
import { EventOrchestrationService } from './event-orchestration.service';
import { SnapshotService } from './snapshot.service';
import { EsdbEventStore } from './esdb-event-store';
import { ILogger } from 'src/shared/logger';

@Module({
  imports: [
    SharedModule,
    EventStoreProjectionsModule,
    EventStoreModule.register<{ id: string; type: string; payload: any }>({
      token: 'MANAGEMENT_EVENTS_STREAM',
      serviceName: 'Start Service',
    }),
  ],
  providers: [
    EventStoreService,
    {
      provide: 'EventStoreService',
      useExisting: EventStoreService,
    },
    EventOrchestrationService,
    SnapshotService,
    {
      provide: EsdbEventStore,
      useFactory: (logger: ILogger) => {
        return new EsdbEventStore<any>('EventStoreSharedModule', logger);
      },
      inject: ['ILogger'],
    },
  ],
  exports: [
    SharedModule,
    EventStoreModule,
    EventStoreService,
    EventOrchestrationService,
    SnapshotService,
    EsdbEventStore,
  ],
})
export class EventStoreSharedModule {}
