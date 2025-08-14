import { Module } from '@nestjs/common';
import { ProductCommandHandler } from './product.command-handler';

import { EventStoreModule } from 'src/shared/infrastructure/eventstore';
import { LoggingModule } from 'src/shared/logging';

/**
 * Product Commands Module - Contains command handlers for product write operations
 * Part of the CQRS write-side for the Product bounded context
 */
@Module({
  imports: [EventStoreModule, LoggingModule],
  providers: [ProductCommandHandler],
  exports: [ProductCommandHandler],
})
export class ProductCommandsModule {}
