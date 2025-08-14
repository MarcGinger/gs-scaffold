import 'reflect-metadata';
import { AppDataSource } from '../database/app.datasource';

/**
 * Migration Runner
 *
 * Executes pending TypeORM migrations.
 * Following COPILOT_FRAMEWORK_TYPEORM migration strategy:
 * - Safe, transactional migrations
 * - Can be run as Kubernetes Job before deployment
 * - Separate from application startup
 */
void (async () => {
  console.log('🏗️  Running TypeORM migrations...');

  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ DataSource initialized');
    }

    // Check for pending migrations using showMigrations
    const executed = await AppDataSource.showMigrations();
    console.log(`
      📋 Found migrations status - executed: ${executed.toString()}
    `);

    await AppDataSource.runMigrations();
    console.log('✅ All migrations completed successfully');

    await AppDataSource.destroy();
    console.log('🎉 Migration runner completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  }
})();
