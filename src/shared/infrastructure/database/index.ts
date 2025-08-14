// Database infrastructure exports
export * from './app.datasource';
export * from './typeorm.module';
export * from './database-health.service';
export * from './projection-writer.service';

// Entity exports
export * from '../entities/projection-checkpoint.entity';
export * from '../entities/processed-event.entity';
// ProductEntity moved to product module: src/catelog/product/infrastructure/typeorm/entities/product.entity
