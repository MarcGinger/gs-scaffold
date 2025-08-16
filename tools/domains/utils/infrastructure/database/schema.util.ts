import { DataSource } from 'typeorm';
import { AppConfigUtil } from '../../config';

/**
 * Database Schema Management Utilities
 *
 * This utility handles database schema creation and management tasks
 * that need to be performed before the main application starts.
 */
export class DatabaseSchemaUtil {
  /**
   * Ensures that required database schemas exist before application startup.
   * Creates schemas if they don't exist to prevent runtime errors.
   *
   * @throws {Error} If schema creation fails or database connection issues occur
   */
  static async ensureSchemas(): Promise<void> {
    // Get database configuration using centralized config utility
    const dbConfig = AppConfigUtil.getDatabaseConfig();

    // Create a temporary DataSource just for schema creation
    const tempDataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      username: dbConfig.username,
      password: dbConfig.password,
    });

    try {
      await tempDataSource.initialize();
      const queryRunner = tempDataSource.createQueryRunner();

      // Create required schemas
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS bank_product`);
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS core_slack`);

      await queryRunner.release();
    } catch (error) {
      console.error('Error ensuring schema:', error);
      throw error;
    } finally {
      if (tempDataSource.isInitialized) {
        await tempDataSource.destroy();
      }
    }
  }

  /**
   * Creates a specific schema if it doesn't exist.
   * Useful for dynamic schema creation based on bounded contexts.
   *
   * @param schemaName - Name of the schema to create
   * @throws {Error} If schema creation fails
   */
  static async createSchemaIfNotExists(schemaName: string): Promise<void> {
    const dbConfig = AppConfigUtil.getDatabaseConfig();

    const tempDataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      username: dbConfig.username,
      password: dbConfig.password,
    });

    try {
      await tempDataSource.initialize();
      const queryRunner = tempDataSource.createQueryRunner();

      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

      await queryRunner.release();
    } catch (error) {
      console.error(`Error creating schema ${schemaName}:`, error);
      throw error;
    } finally {
      if (tempDataSource.isInitialized) {
        await tempDataSource.destroy();
      }
    }
  }

  /**
   * Validates that all required schemas exist in the database.
   * Useful for health checks and startup validation.
   *
   * @param requiredSchemas - Array of schema names that must exist
   * @returns Promise<boolean> - True if all schemas exist
   */
  static async validateSchemas(requiredSchemas: string[]): Promise<boolean> {
    const dbConfig = AppConfigUtil.getDatabaseConfig();

    const tempDataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      username: dbConfig.username,
      password: dbConfig.password,
    });

    try {
      await tempDataSource.initialize();
      const queryRunner = tempDataSource.createQueryRunner();

      for (const schema of requiredSchemas) {
        const result = await queryRunner.query(
          `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
          [schema],
        );

        if (result.length === 0) {
          console.warn(`Schema ${schema} does not exist`);
          return false;
        }
      }

      await queryRunner.release();
      return true;
    } catch (error) {
      console.error('Error validating schemas:', error);
      return false;
    } finally {
      if (tempDataSource.isInitialized) {
        await tempDataSource.destroy();
      }
    }
  }
}
