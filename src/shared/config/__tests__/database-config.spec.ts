import { AppConfigUtil } from '../app-config.util';
import { ConfigManager } from '../config.manager';

/**
 * Test database configuration centralization
 * This validates that database configuration is properly centralized through AppConfigUtil
 */
describe('Database Configuration Centralization', () => {
  beforeAll(() => {
    // Set test environment variables
    process.env.DATABASE_POSTGRES_URL =
      'postgresql://test:test@localhost:5432/testdb';
    process.env.DATABASE_POSTGRES_SCHEMA = 'test_schema';
    process.env.DATABASE_POSTGRES_SLOW_QUERY_THRESHOLD = '1000';
    process.env.DATABASE_POSTGRES_STATEMENT_TIMEOUT = '30000';
    process.env.DATABASE_POSTGRES_CONNECT_TIMEOUT = '15000';
    process.env.DATABASE_POSTGRES_POOL_MAX = '20';
    process.env.DATABASE_POSTGRES_POOL_MIN = '2';
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.DATABASE_POSTGRES_URL;
    delete process.env.DATABASE_POSTGRES_SCHEMA;
    delete process.env.DATABASE_POSTGRES_SLOW_QUERY_THRESHOLD;
    delete process.env.DATABASE_POSTGRES_STATEMENT_TIMEOUT;
    delete process.env.DATABASE_POSTGRES_CONNECT_TIMEOUT;
    delete process.env.DATABASE_POSTGRES_POOL_MAX;
    delete process.env.DATABASE_POSTGRES_POOL_MIN;
  });

  describe('AppConfigUtil.getDatabaseConfig()', () => {
    it('should return centralized database configuration', () => {
      const config = AppConfigUtil.getDatabaseConfig();

      // Verify connection settings
      expect(config.url).toBe('postgresql://test:test@localhost:5432/testdb');
      expect(config.schema).toBe('test_schema');

      // Verify performance settings
      expect(config.maxQueryExecutionTime).toBe(1000);
      expect(config.statementTimeout).toBe(30000);
      expect(config.connectTimeoutMS).toBe(15000);

      // Verify pool settings
      expect(config.pool.max).toBe(20);
      expect(config.pool.min).toBe(2);
    });

    it('should provide sensible defaults', () => {
      // Clear environment variables
      delete process.env.DATABASE_POSTGRES_URL;
      delete process.env.DATABASE_POSTGRES_SCHEMA;
      delete process.env.DATABASE_POSTGRES_SLOW_QUERY_THRESHOLD;

      const config = AppConfigUtil.getDatabaseConfig();

      // Verify defaults
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.database).toBe('postgres');
      expect(config.schema).toBe('gs_scaffold_read');
      expect(config.maxQueryExecutionTime).toBe(500);
    });
  });

  describe('ConfigManager database validation', () => {
    beforeEach(() => {
      // Reset environment for validation tests
      process.env.DATABASE_POSTGRES_URL =
        'postgresql://test:test@localhost:5432/testdb';
      process.env.DATABASE_POSTGRES_SCHEMA = 'test_schema';
      process.env.DATABASE_POSTGRES_SLOW_QUERY_THRESHOLD = '1000';
      process.env.DATABASE_POSTGRES_STATEMENT_TIMEOUT = '30000';
      process.env.DATABASE_POSTGRES_CONNECT_TIMEOUT = '15000';
      process.env.DATABASE_POSTGRES_POOL_MAX = '20';
      process.env.DATABASE_POSTGRES_POOL_MIN = '2';
    });

    it('should validate database configuration successfully', () => {
      const configManager = ConfigManager.getInstance();
      const validation = configManager.validateAspect('database');

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing database configuration', () => {
      // Remove required configuration
      delete process.env.DATABASE_POSTGRES_URL;
      delete process.env.DATABASE_POSTGRES_HOST;
      process.env.DATABASE_POSTGRES_HOST = ''; // Empty host

      const configManager = ConfigManager.getInstance();
      const validation = configManager.validateAspect('database');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Database connection URL or host must be configured',
      );
    });

    it('should validate timeout settings', () => {
      // Set invalid timeouts
      process.env.DATABASE_POSTGRES_SLOW_QUERY_THRESHOLD = '50'; // Too low
      process.env.DATABASE_POSTGRES_STATEMENT_TIMEOUT = '500'; // Too low

      const configManager = ConfigManager.getInstance();
      const validation = configManager.validateAspect('database');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'maxQueryExecutionTime should be at least 100ms',
      );
      expect(validation.errors).toContain(
        'statementTimeout should be at least 1000ms',
      );
    });

    it('should validate pool settings', () => {
      // Set invalid pool settings
      process.env.DATABASE_POSTGRES_POOL_MAX = '0'; // Invalid max
      process.env.DATABASE_POSTGRES_POOL_MIN = '5'; // Min > max

      const configManager = ConfigManager.getInstance();
      const validation = configManager.validateAspect('database');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Connection pool max must be at least 1',
      );
      expect(validation.errors).toContain(
        'Connection pool min must be between 0 and max',
      );
    });
  });

  describe('Integration with app.datasource.ts', () => {
    it('should use centralized configuration in TypeORM DataSource', async () => {
      // This test verifies that app.datasource.ts uses AppConfigUtil
      const { AppDataSource } = await import(
        '../../infrastructure/database/app.datasource'
      );
      const config = AppConfigUtil.getDatabaseConfig();

      // Verify DataSource uses centralized config
      expect(AppDataSource.options.type).toBe('postgres');

      // Cast to PostgreSQL options to access specific properties
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const pgOptions = AppDataSource.options as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(pgOptions.schema).toBe(config.schema);
      expect(AppDataSource.options.maxQueryExecutionTime).toBe(
        config.maxQueryExecutionTime,
      );

      // Verify extra configuration
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const extra = AppDataSource.options.extra;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(extra?.statement_timeout).toBe(config.statementTimeout);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(extra?.max).toBe(config.pool.max);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(extra?.min).toBe(config.pool.min);
    });
  });
});
