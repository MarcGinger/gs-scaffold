import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Logger } from 'pino';
import { APP_LOGGER, Log } from '../../logging';

/**
 * Database Health Service
 *
 * Provides health checks and monitoring for PostgreSQL connections.
 * Following COPILOT_FRAMEWORK_TYPEORM observability guidelines.
 */
@Injectable()
export class DatabaseHealthService {
  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Basic health check - executes simple SELECT 1
   */
  async isHealthy(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.dataSource.query('SELECT 1 as health');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return Array.isArray(result) && result?.[0]?.health === 1;
    } catch (error) {
      Log.error(this.logger, error as Error, 'Database health check failed', {
        component: 'DatabaseHealthService',
        method: 'isHealthy',
      });
      return false;
    }
  }

  /**
   * Detailed health information
   */
  async getHealthDetails(): Promise<{
    healthy: boolean;
    schema?: string;
    isConnected: boolean;
    lastCheck: string;
  }> {
    const lastCheck = new Date().toISOString();

    try {
      // Basic connectivity test
      await this.dataSource.query('SELECT 1');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const options = this.dataSource.options as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const schema = options.schema || 'public';

      return {
        healthy: true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        schema,
        isConnected: this.dataSource.isInitialized,
        lastCheck,
      };
    } catch (error) {
      Log.error(
        this.logger,
        error as Error,
        'Database health details check failed',
        {
          component: 'DatabaseHealthService',
          method: 'getHealthDetails',
        },
      );

      return {
        healthy: false,
        isConnected: false,
        lastCheck,
      };
    }
  }

  /**
   * Check if migrations table exists (simple migration status)
   */
  async getMigrationStatus(): Promise<{
    migrationsTableExists: boolean;
    lastCheck: string;
  }> {
    try {
      await this.dataSource.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = current_schema()
          AND table_name = 'migrations'
        ) as exists
      `);

      return {
        migrationsTableExists: true,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      Log.error(this.logger, error as Error, 'Migration status check failed', {
        component: 'DatabaseHealthService',
        method: 'getMigrationStatus',
      });

      return {
        migrationsTableExists: false,
        lastCheck: new Date().toISOString(),
      };
    }
  }
}
