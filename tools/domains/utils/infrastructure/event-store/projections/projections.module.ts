import { Module } from '@nestjs/common';
import { LinkStoreProjection } from './link-store.projection';
import { LoggerModule } from 'src/shared/logger';

/**
 * Module for event stream projections.
 * Handles various read model projections for event streams.
 */
@Module({
  imports: [LoggerModule],
  providers: [LinkStoreProjection],
  exports: [LinkStoreProjection],
})
export class EventStoreProjectionsModule {}
