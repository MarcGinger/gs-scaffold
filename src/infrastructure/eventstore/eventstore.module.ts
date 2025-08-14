import { Module, Global } from '@nestjs/common';
import { EventStoreService } from './eventstore.service';

@Global()
@Module({
  providers: [EventStoreService],
  exports: [EventStoreService],
})
export class EventStoreModule {}
