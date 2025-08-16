const path = require('path');
const {
  writeFileWithDir,
  createIndexFilesFromDirectory,
} = require('../utils/file-utils');
const {
  buildImportLines,
  shouldSkipTable,
} = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  singularize,
  sentenceCase,
  pluralize,
  snakeCase,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

function getProjectionType(schema, table) {
  if (schema.parameters?.[table.name]?.store?.write === 'eventstream') {
    switch (schema.parameters?.[table.name]?.store?.list) {
      case 'redis':
        return 'redis';
      case 'mongo':
        return 'mongo';
      case 'sql':
        return 'sql';
      default:
        return 'memory';
    }
  }
  return '';
}

const create = async (schema) => {
  // await esdbProjector(schema);
  // await redisProjector(schema);

  await esdbMemoryProjection(schema);

  await esdbRedisProjection(schema);

  await esdbSqlProjection(schema);

  await esdbProjectionManager(schema);
};

const esdbMemoryProjection = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }

    const projectorType = getProjectionType(schema, table);
    if (projectorType !== 'memory') {
      logger.warn(
        `No projector type found for table ${table.name}. Skipping projection generation.`,
      );
      continue;
    }

    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${table.name} due to no primary key.`);
      continue;
    }
    const key = keys[0];

    const className = upperFirst(camelCase(table.name));

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) =>
        idx.cols
          .filter((col) => col.name !== 'tenant')
          .map((c) => ({
            col: table.cols
              .filter((col) => col.name !== 'tenant')
              .find((col) => col.id === c.colid),
            idx,
          })),
      )
      .filter(({ col }) => col)
      .map(({ col, idx }) => ({ ...col, idx }));

    let hasProjector = false;
    if (
      schema.parameters?.[table.name]?.store?.read === 'eventstream' &&
      idxCols.length
    ) {
      hasProjector = true;
    }

    // DOTO this is a mistake just to test
    if (
      schema.parameters?.[table.name]?.store?.read === 'redis' &&
      idxCols.length
    ) {
      hasProjector = true;
    }

    if (!hasProjector) {
      logger.warn(`Skipping table ${tableId} due to no projector.`);
      continue;
    }

    imports = [];
    addImport(imports, '@nestjs/common', ['Injectable', 'Inject']);
    addImport(imports, 'src/shared/logger', ['ILogger']);
    addImport(imports, '../../domain/properties', `Snapshot${className}Props`);
    addImport(imports, 'src/shared/infrastructure/event-store', [
      'IEventStoreMeta',
    ]);

    lines = [];

    lines.push(`/**
 * ${className} memory projection service responsible for maintaining
 * an in-memory projection of ${camelCase(className)} entities from event streams.
 *
 * This projection enables efficient querying and listing operations
 * without having to replay events from individual streams.
 */
@Injectable()
export class ${className}MemoryProjection {
  private readonly ${camelCase(className)}Store: Record<
    string,
    Record<string, Snapshot${className}Props>
  > = {};
  private isInitialized = false;

  constructor(@Inject('ILogger') private readonly logger: ILogger) {}

  /**
   * Handle ${camelCase(className)} events for the internal ${camelCase(className)} memory projection
   * Simplified since each event contains the complete aggregate state
   */
  async handle${className}Event(evt: Snapshot${className}Props, meta: IEventStoreMeta): Promise<void> {
    try {
      // Ensure tenant store exists
      if (!this.${camelCase(className)}Store[meta.tenant]) {
        this.${camelCase(className)}Store[meta.tenant] = {};
      }

      // Extract ${camelCase(className)} data from the event (contains full aggregate state)
      const ${camelCase(className)}Data = this.extract${className}FromEvent(evt, meta);

      // For delete events, ${camelCase(className)}Data will be null and ${camelCase(className)} is already removed
      if (!${camelCase(className)}Data) {
        this.logger.debug(
          { evt, meta },
          '${className} data not extracted (likely delete event or invalid data)',
        );
        return;
      }

      // Simply store the complete current state - no merging needed
      this.${camelCase(className)}Store[meta.tenant][${camelCase(className)}Data.${camelCase(key.name)}] = ${camelCase(className)}Data;

      this.logger.debug(
        {
          tenant: meta.tenant,
          ${camelCase(className)}Code: ${camelCase(className)}Data.${camelCase(key.name)},
          eventType: meta.type,
          streamName: meta.stream,
          version: meta.version,
        },
        'Updated ${camelCase(className)} memory projection with complete aggregate state',
      );
      return new Promise<void>((resolve) => resolve());
    } catch (error) {
      this.logger.error(
        {
          evt,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to handle ${camelCase(className)} event in memory projection',
      );
    }
  }

  /**
   * Extract ${camelCase(className)} data from event - simplified since each event contains full aggregate
   */
  private extract${className}FromEvent(
    evt: Snapshot${className}Props,
    meta: IEventStoreMeta,
  ): Snapshot${className}Props | null {
    try {
      // Since each event contains the complete aggregate state,
      // we can simply extract the current state regardless of event type
      return evt;
    } catch (error) {
      this.logger.error(
        {
          evt,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to extract ${camelCase(className)} data from event',
      );
      return null;
    }
  }

  /**
   * Get a specific ${camelCase(className)} by tenant and ${camelCase(key.name)}
   */
  get${className}Store(
    tenant: string,
    ${camelCase(key.name)}: ${key.type},
  ): Snapshot${className}Props | null {
    try {
      const tenantStore = this.${camelCase(className)}Store[tenant];
      if (!tenantStore) {
        this.logger.debug(
          { tenant, ${camelCase(key.name)} },
          'No tenant store found for ${camelCase(className)} lookup',
        );
        return null;
      }

      const ${camelCase(className)} = tenantStore[${camelCase(key.name)}];
      if (!${camelCase(className)}) {
        this.logger.debug({ tenant, ${camelCase(key.name)} }, 'No ${camelCase(className)} found for code');
        return null;
      }

      return ${camelCase(className)};
    } catch (error) {
      this.logger.error(
        {
          tenant,
          ${camelCase(key.name)},
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${camelCase(className)} from memory projection',
      );
      return null;
    }
  }

  /**
   * Get all ${pluralize(camelCase(className))} for a tenant with optional filtering
   */
  async get${pluralize(className)}ForTenant(
    tenant: string,
    filter?: {`);
    idxCols.forEach((col) => {
      lines.push(`      ${camelCase(col.name)}?: ${col.type};`);
    });
    lines.push(`    },
  ): Promise<Snapshot${className}Props[]> {
    try {
      const tenantStore = this.${camelCase(className)}Store[tenant];
      if (!tenantStore) {
        this.logger.debug(
          { tenant },
          'No tenant store found for ${pluralize(camelCase(className))} lookup',
        );
        return [];
      }

      let ${pluralize(camelCase(className))} = Object.values(tenantStore);

      // Apply filters
      if (filter) {`);
    idxCols.forEach((col) => {
      lines.push(`        if (filter.${camelCase(col.name)}) {`);
      if (col.type === 'string') {
        lines.push(
          `          const ${camelCase(col.name)} = filter.${camelCase(col.name)}.toLowerCase();`,
        );
        if (col.idx && col.idx.fulltext) {
          lines.push(
            `           ${pluralize(camelCase(className))} = ${pluralize(camelCase(className))}.filter((c) => c.${camelCase(col.name)}.toLowerCase().includes(${camelCase(col.name)}));`,
          );
        } else {
          lines.push(
            `           ${pluralize(camelCase(className))} = ${pluralize(camelCase(className))}.filter((c) => c.${camelCase(col.name)}.toLowerCase() === ${camelCase(col.name)});`,
          );
        }
      } else {
        lines.push(
          `          const ${camelCase(col.name)} = filter.${camelCase(col.name)};`,
        );

        lines.push(
          `          ${pluralize(camelCase(className))} = ${pluralize(camelCase(className))}.filter((c) => c.${camelCase(col.name)} === ${camelCase(col.name)});`,
        );
      }
      lines.push(`        }
`);
    });
    lines.push(`      }

      return new Promise((resolve) => resolve(${pluralize(camelCase(className))}));
    } catch (error) {
      this.logger.error(
        {
          tenant,
          filter,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${pluralize(camelCase(className))} for tenant from memory projection',
      );
      return [];
    }
  }

  /**
   * Get ${pluralize(camelCase(className))} by multiple ${pluralize(camelCase(key.name))} efficiently
   */
  get${pluralize(className)}ByCodes(
    tenant: string,
    ${pluralize(camelCase(key.name))}: ${key.type}[],
  ): Snapshot${className}Props[] {
    try {
      const tenantStore = this.${camelCase(className)}Store[tenant];
      if (!tenantStore) {
        return [];
      }

      const result: Snapshot${className}Props[] = [];
      for (const code of ${pluralize(camelCase(key.name))}) {
        const ${camelCase(className)} = tenantStore[code];
        if (${camelCase(className)}) {
          result.push(${camelCase(className)});
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        {
          tenant,
          ${pluralize(camelCase(key.name))},
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${pluralize(camelCase(className))} by ${pluralize(camelCase(key.name))} from memory projection',
      );
      return [];
    }
  }

  /**
   * Mark projection as initialized
   */
  markAsInitialized(): void {
    this.isInitialized = true;
    this.logger.log({}, '${className} memory projection marked as initialized');
  }

  /**
   * Check if projection is ready for queries
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  async isHealthy(): Promise<boolean> {
    return new Promise((resolve) => resolve(this.isInitialized));
  }
}
`);

    const fileBase = kebabCase(table.name);
    const filePath = path.join(
      outDir,
      fileBase,
      'infrastructure',
      'projectors',
      `${fileBase}-memory.projection.ts`,
    );
    if (schema.excluded?.includes(`${fileBase}-memory.projection.ts`)) {
      logger.info(
        `Skipping generation of ${fileBase}-memory.projection as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(
      filePath,
      buildImportLines(imports) + '\n' + lines.join('\n'),
    );
  }
};

const esdbRedisProjection = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }

    const projectorType = getProjectionType(schema, table);
    if (projectorType !== 'redis') {
      logger.warn(
        `No projector type found for table ${table.name}. Skipping projection generation.`,
      );
      continue;
    }
    console.log(`Generating Redis projection for table ${table.name}`);
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${table.name} due to no primary key.`);
      continue;
    }
    const key = keys[0];

    const className = upperFirst(camelCase(table.name));

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) =>
        idx.cols
          .filter((col) => col.name !== 'tenant')
          .map((c) => ({
            col: table.cols
              .filter((col) => col.name !== 'tenant')
              .find((col) => col.id === c.colid),
            idx,
          })),
      )
      .filter(({ col }) => col)
      .map(({ col, idx }) => ({ ...col, idx }));

    let hasProjector = false;
    if (
      schema.parameters?.[table.name]?.store?.read === 'eventstream' &&
      idxCols.length
    ) {
      hasProjector = true;
    }

    // DOTO this is a mistake just to test
    if (
      schema.parameters?.[table.name]?.store?.read === 'redis' &&
      idxCols.length
    ) {
      hasProjector = true;
    }

    if (!hasProjector) {
      logger.warn(`Skipping table ${tableId} due to no projector.`);
      continue;
    }

    imports = [];
    addImport(imports, '@nestjs/common', ['Injectable', 'Inject']);
    addImport(imports, 'src/shared/logger', ['ILogger']);
    addImport(imports, 'src/shared/auth', ['IUserToken']);
    addImport(imports, 'src/shared/infrastructure/event-store', [
      'IEventStoreMeta',
    ]);
    addImport(imports, 'src/shared/infrastructure/redis', [
      'RedisUtilityService',
    ]);
    addImport(imports, '../../domain/properties', `Snapshot${className}Props`);

    addImport(
      imports,
      `../../domain/value-objects/${kebabCase(className)}-projection-keys`,
      `${className}ProjectionKeys`,
    );
    lines = [];

    lines.push(`/**
 * ${className} Redis projection service responsible for maintaining
 * Redis projection of ${camelCase(className)} entities from EventStore streams.
 *
 * This projection enables the existing ${className}Repository to continue
 * working with Redis while the data source transitions to EventStore.
 */
@Injectable()
export class ${className}RedisProjection {
  private readonly redisProjectionKey =
    ${className}ProjectionKeys.getRedisProjectionKey();
  private readonly esdbStreamPrefix =
    ${className}ProjectionKeys.getEventStoreStreamPrefix();

  private isInitialized = false;
  private readonly systemUser: IUserToken;

  constructor(
    @Inject('ILogger') private readonly logger: ILogger,
    private readonly redisUtilityService: RedisUtilityService,
  ) {
    // Create a system user for Redis operations
    this.systemUser = {
      sub: 'system-${camelCase(className)}-projection',
      preferred_username: 'system',
      name: 'System ${className} Projection',
      email: 'system@internal',
      tenant: 'system',
      roles: ['system'],
    } as IUserToken;
  }

    /**
   * Get all ${camelCase(pluralize(className))} for a tenant with optional filtering
   * This method reads directly from Redis projection for optimal performance
   */
  async get${pluralize(className)}ForTenant(
    tenant: string,
    filter?: {`);
    idxCols.forEach((col) => {
      lines.push(`      ${camelCase(col.name)}?: ${col.type};`);
    });
    lines.push(`    },
  ): Promise<Snapshot${className}Props[]> {
    try {
      // Create tenant-specific user context for Redis operations
      const tenantUser: IUserToken = {
        ...this.systemUser,
        tenant,
      };

      // Get all ${camelCase(pluralize(className))} for the tenant from Redis
      const all${pluralize(className)} =
        await this.redisUtilityService.getAllValues<Snapshot${className}Props>(
          tenantUser,
          this.redisProjectionKey,
        );

      if (!all${pluralize(className)} || all${pluralize(className)}.length === 0) {
        this.logger.debug(
          { tenant },
          'No ${camelCase(pluralize(className))} found for tenant in Redis projection',
        );
        return [];
      }

      // Apply filters if provided
      let filtered${pluralize(className)} = all${pluralize(className)};

      if (filter) {`);
    lines.push(
      `        filtered${pluralize(className)} = all${pluralize(className)}.filter((${camelCase(className)}) => {`,
    );
    idxCols.forEach((col) => {
      lines.push(`          if (filter.${camelCase(col.name)}) {`);

      if (col.type === 'string') {
        if (col.idx && col.idx.fulltext) {
          lines.push(
            `            // Filter by ${camelCase(col.name)} (case-insensitive partial match)`,
          );
          lines.push(`            if (
              !${camelCase(className)}.${camelCase(col.name)}.toLowerCase().includes(filter.${camelCase(col.name)}.toLowerCase())
            ) {
              return false;
            }`);
        } else {
          lines.push(
            `            // Filter by ${camelCase(col.name)} (case-insensitive full match)`,
          );
          lines.push(`            if (
              ${camelCase(className)}.${camelCase(col.name)}.toLowerCase() !== filter.${camelCase(col.name)}.toLowerCase()
            ) {
              return false;
            }`);
        }
      } else {
        lines.push(
          `            // Filter by ${camelCase(col.name)} (exact match)`,
        );
        lines.push(`            if (
              ${camelCase(className)}.${camelCase(col.name)} !== filter.${camelCase(col.name)}
            ) {
              return false;
            }`);
      }
      lines.push(`          }
`);
    });
    lines.push(`          return true;
        });
      }

      this.logger.debug(
        {
          tenant,
          totalCount: all${pluralize(className)}.length,
          filteredCount: filtered${pluralize(className)}.length,
          filter,
        },
        'Successfully retrieved ${camelCase(pluralize(className))} for tenant from Redis projection',
      );

      return filtered${pluralize(className)};
    } catch (error) {
      this.logger.error(
        {
          tenant,
          filter,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${camelCase(pluralize(className))} for tenant from Redis projection',
      );
      return [];
    }
  }

  /**
   * Get ${camelCase(pluralize(className))} by multiple codes efficiently from Redis
   * Optimized for bulk operations with a single Redis round-trip
   */
  async get${pluralize(className)}ByCodes(
    tenant: string,
    ${camelCase(pluralize(key.name))}: ${key.type}[],
  ): Promise<Snapshot${className}Props[]> {
    if (!${camelCase(pluralize(key.name))} || ${camelCase(pluralize(key.name))}.length === 0) {
      return [];
    }

    try {
      // Create tenant-specific user context for Redis operations
      const tenantUser: IUserToken = {
        ...this.systemUser,
        tenant,
      };

      // Use getMany for efficient bulk retrieval with single Redis call
      const ${camelCase(pluralize(className))} =
        await this.redisUtilityService.getMany<Snapshot${className}Props>(
          tenantUser,
          this.redisProjectionKey,`);
    if (key.type === 'string') {
      lines.push(`          ${camelCase(pluralize(key.name))},`);
    } else {
      lines.push(
        `          ${camelCase(pluralize(key.name))}.map((code) => code.toString()),`,
      );
    }
    lines.push(`        );

      this.logger.debug(
        {
          tenant,
          requestedCodes: ${camelCase(pluralize(key.name))},
          foundCount: ${camelCase(pluralize(className))}.length,
          totalRequested: ${camelCase(pluralize(key.name))}.length,
        },
        'Successfully retrieved ${camelCase(pluralize(className))} by ${camelCase(pluralize(key.name))} from Redis projection',
      );

      return ${camelCase(pluralize(className))};
    } catch (error) {
      this.logger.error(
        {
          tenant,
          ${camelCase(pluralize(key.name))},
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${camelCase(pluralize(className))} by ${camelCase(pluralize(key.name))} from Redis projection',
      );
      return [];
    }
  }

  /**
   * Get a single ${camelCase(className)} by tenant and code from Redis
   * Used for individual ${camelCase(className)} lookups with optimal performance
   */
  async get${className}ByCode(
    tenant: string,
    ${camelCase(key.name)}: ${key.type},
  ): Promise<Snapshot${className}Props | null> {
    try {
      // Create tenant-specific user context for Redis operations
      const tenantUser: IUserToken = {
        ...this.systemUser,
        tenant,
      };

      // Read the ${camelCase(className)} data directly - getOne returns undefined if not found
      const ${camelCase(className)} =
        await this.redisUtilityService.getOne<Snapshot${className}Props>(
          tenantUser,
          this.redisProjectionKey,`);
    if (key.type === 'string') {
      lines.push(`          ${camelCase(key.name)},`);
    } else {
      lines.push(`          ${camelCase(key.name)}.toString(),`);
    }
    lines.push(`        );

      if (!${camelCase(className)}) {
        this.logger.debug(
          { tenant, ${camelCase(key.name)} },
          '${className} not found in Redis projection',
        );
        return null;
      }

      this.logger.debug(
        { tenant, ${camelCase(key.name)} },
        'Successfully retrieved ${camelCase(className)} from Redis projection',
      );

      return ${camelCase(className)};
    } catch (error) {
      this.logger.error(
        {
          tenant,
          ${camelCase(key.name)},
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${camelCase(className)} by ${camelCase(key.name)} from Redis projection',
      );
      return null;
    }
  }

  /**
   * Handle ${camelCase(className)} events and update Redis projection
   */
  async handle${className}Event(
    evt: Snapshot${className}Props,
    meta: IEventStoreMeta,
  ): Promise<void> {
    try {
      // Extract tenant from stream metadata or use default
      const tenant = meta.tenant || this.extractTenantFromStream(meta.stream);

      if (!tenant) {
        this.logger.warn(
          { evt, meta },
          'No tenant found in event metadata, skipping Redis update',
        );
        return;
      }

      // Create tenant-specific user context for Redis operations
      const tenantUser: IUserToken = {
        ...this.systemUser,
        tenant,
      };

      // Handle different event types
      if (this.isDeleteEvent(meta.type)) {
        await this.handle${className}Delete(evt, tenantUser, meta);
      } else {
        await this.handle${className}Upsert(evt, tenantUser, meta);
      }

      this.logger.debug(
        {
          tenant,
          ${camelCase(className)}Code: evt.${camelCase(key.name)},
          eventType: meta.type,
          streamName: meta.stream,
          version: meta.version,
        },
        'Updated Redis projection from EventStore event',
      );
    } catch (error) {
      this.logger.error(
        {
          evt,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to handle ${camelCase(className)} event in Redis projection',
      );
    }
  }

  /**
   * Handle ${camelCase(className)} creation/update events
   */
  private async handle${className}Upsert(
    evt: Snapshot${className}Props,
    user: IUserToken,
    meta: IEventStoreMeta,
  ): Promise<void> {
    try {
      // Convert event data to Redis format (same as Snapshot${className}Props)
      const redisData: Snapshot${className}Props = {`);
    table.cols.forEach((col) => {
      lines.push(`        ${camelCase(col.name)}: evt.${camelCase(col.name)},`);
    });

    lines.push(`      };

      // Write to Redis using the same key pattern as ${className}Repository
      await this.redisUtilityService.write(
        user,
        this.redisProjectionKey,
        evt.${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        redisData,
      );

      this.logger.debug(
        {
          tenant: user.tenant,
          ${camelCase(className)}Code: evt.${camelCase(key.name)},
          eventType: meta.type,
        },
        '${className} upserted in Redis projection',
      );
    } catch (error) {
      this.logger.error(
        {
          evt,
          user: user.tenant,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to upsert ${camelCase(className)} in Redis projection',
      );
      throw error;
    }
  }

  /**
   * Handle ${camelCase(className)} deletion events
   */
  private async handle${className}Delete(
    evt: Snapshot${className}Props,
    user: IUserToken,
    meta: IEventStoreMeta,
  ): Promise<void> {
    try {
      // Check if ${camelCase(className)} exists before deletion
      const exists = await this.redisUtilityService.exists(
        user,
        this.redisProjectionKey,
        evt.${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
      );

      if (exists) {
        await this.redisUtilityService.delete(
          user,
          this.redisProjectionKey,
          evt.${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        );

        this.logger.debug(
          {
            tenant: user.tenant,
            ${camelCase(className)}Code: evt.${camelCase(key.name)},
            eventType: meta.type,
          },
          '${className} deleted from Redis projection',
        );
      } else {
        this.logger.debug(
          {
            tenant: user.tenant,
            ${camelCase(className)}Code: evt.${camelCase(key.name)},
            eventType: meta.type,
          },
          '${className} not found in Redis for deletion',
        );
      }
    } catch (error) {
      this.logger.error(
        {
          evt,
          user: user.tenant,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to delete ${camelCase(className)} from Redis projection',
      );
      throw error;
    }
  }

  /**
   * Extract tenant from stream name using domain value object
   * Expected format: banking.${camelCase(className)}.v1-tenant123-${snakeCase(className).toUpperCase()}CODE
   */
  private extractTenantFromStream(streamName: string): string | null {
    try {
      // Use domain value object for extraction
      const extracted = ${className}ProjectionKeys.extractFromStreamName(streamName);

      if (!extracted) {
        this.logger.warn(
          {
            streamName,
            expectedPattern: \`\${this.esdbStreamPrefix}-{tenant}-{code}\`,
            esdbKey: this.esdbStreamPrefix,
            redisKey: this.redisProjectionKey,
          },
          'Stream name does not match expected EventStore pattern',
        );
        return null;
      }

      this.logger.debug(
        {
          streamName,
          tenant: extracted.tenant,
          ${camelCase(className)}Code: extracted.code,
          esdbPattern: this.esdbStreamPrefix,
          redisPattern: this.redisProjectionKey,
        },
        'Successfully extracted tenant from EventStore stream name',
      );

      return extracted.tenant;
    } catch (error) {
      this.logger.error(
        {
          streamName,
          esdbKey: this.esdbStreamPrefix,
          error,
        },
        'Failed to extract tenant from stream name',
      );
      return null;
    }
  }


  /**
   * Check if event type indicates a deletion
   */
  private isDeleteEvent(eventType: string): boolean {
    const deleteEventTypes = [
      '${className}Deleted',
      '${className}DeletedEvent',
      '${camelCase(className)}-deleted',
      '${camelCase(className)}.deleted',
    ];

    return deleteEventTypes.some((type) =>
      eventType.toLowerCase().includes(type.toLowerCase()),
    );
  }

  /**
   * Rebuild Redis projection from scratch (useful for recovery)
   */
  async rebuildProjection(tenants: string[] = []): Promise<void> {
    this.logger.log(
      { tenants },
      'Starting Redis projection rebuild for ${camelCase(pluralize(className))}',
    );

    try {
      // Clear existing Redis data for specified tenants
      if (tenants.length > 0) {
        for (const tenant of tenants) {
          const tenantUser: IUserToken = {
            ...this.systemUser,
            tenant,
          };

          // Clear all ${camelCase(pluralize(className))} for this tenant
          await this.clearTenant${pluralize(className)}(tenantUser);
        }
      }

      this.logger.log(
        { tenants },
        'Redis projection rebuild completed for ${camelCase(pluralize(className))}',
      );
    } catch (error) {
      this.logger.error(
        {
          tenants,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to rebuild Redis projection for ${camelCase(pluralize(className))}',
      );
      throw error;
    }
  }

  /**
   * Clear all ${camelCase(pluralize(className))} for a specific tenant
   */
  private async clearTenant${pluralize(className)}(user: IUserToken): Promise<void> {
    try {
      // Get all ${camelCase(className)} keys for the tenant
      const all${pluralize(className)} =
        await this.redisUtilityService.getAllValues<Snapshot${className}Props>(
          user,
          this.redisProjectionKey,
        );

      // Delete each ${camelCase(className)}
      for (const ${camelCase(className)} of all${pluralize(className)}) {
        await this.redisUtilityService.delete(
          user,
          this.redisProjectionKey,
          ${camelCase(className)}.${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        );
      }

      this.logger.debug(
        { tenant: user.tenant, count: all${pluralize(className)}.length },
        'Cleared all ${camelCase(pluralize(className))} for tenant in Redis projection',
      );
    } catch (error) {
      this.logger.error(
        {
          tenant: user.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to clear tenant ${camelCase(pluralize(className))} in Redis projection',
      );
      throw error;
    }
  }

  /**
   * Mark projection as initialized
   */
  markAsInitialized(): void {
    this.isInitialized = true;
    this.logger.log({}, '${className} Redis projection marked as initialized');
  }

  /**
   * Check if projection is ready for queries
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Health check for Redis connectivity
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Test Redis connectivity with a simple operation
      const testUser: IUserToken = {
        ...this.systemUser,
        tenant: 'health-check',
      };

      await this.redisUtilityService.exists(
        testUser,
        this.redisProjectionKey,
        'health-check',
      );

      return this.isInitialized;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Redis projection health check failed',
      );
      return false;
    }
  }
}
`);

    const fileBase = kebabCase(table.name);
    const filePath = path.join(
      outDir,
      fileBase,
      'infrastructure',
      'projectors',
      `${fileBase}-redis.projection.ts`,
    );
    if (schema.excluded?.includes(`${fileBase}-redis.projection.ts`)) {
      logger.info(
        `Skipping generation of ${fileBase}-redis.projection as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(
      filePath,
      buildImportLines(imports) + '\n' + lines.join('\n'),
    );
  }
};

const esdbSqlProjection = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }

    const projectorType = getProjectionType(schema, table);
    if (projectorType !== 'sql') {
      logger.warn(
        `No projector type found for table ${table.name}. Skipping projection generation.`,
      );
      continue;
    }
    console.log(`Generating Redis projection for table ${table.name}`);
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${table.name} due to no primary key.`);
      continue;
    }
    const key = keys[0];

    const className = upperFirst(camelCase(table.name));

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) =>
        idx.cols
          .filter((col) => col.name !== 'tenant')
          .map((c) => ({
            col: table.cols
              .filter((col) => col.name !== 'tenant')
              .find((col) => col.id === c.colid),
            idx,
          })),
      )
      .filter(({ col }) => col)
      .map(({ col, idx }) => ({ ...col, idx }));
    let hasProjector = false;
    if (
      schema.parameters?.[table.name]?.store?.read === 'eventstream' &&
      idxCols.length
    ) {
      hasProjector = true;
    }

    // DOTO this is a mistake just to test
    if (
      schema.parameters?.[table.name]?.store?.read === 'redis' &&
      idxCols.length
    ) {
      hasProjector = true;
    }

    if (!hasProjector) {
      logger.warn(`Skipping table ${tableId} due to no projector.`);
      continue;
    }

    imports = [];
    addImport(imports, '@nestjs/common', ['Injectable', 'Inject']);
    addImport(imports, 'src/shared/logger', ['ILogger']);
    addImport(imports, 'src/shared/auth', ['IUserToken']);
    addImport(imports, 'src/shared/infrastructure/event-store', [
      'IEventStoreMeta',
    ]);
    addImport(imports, '@nestjs/typeorm', ['InjectRepository']);
    addImport(imports, 'typeorm', ['Repository', 'Like', 'In']);
    addImport(imports, `../entities/${kebabCase(className)}.entity`, [
      `${className}Entity`,
    ]);

    addImport(imports, '../../domain/properties', `Snapshot${className}Props`);
    addImport(
      imports,
      `../../domain/value-objects/${kebabCase(className)}-projection-keys`,
      `${className}ProjectionKeys`,
    );

    lines = [];

    lines.push(`/**
 * ${className} SQL projection service responsible for maintaining
 * SQL projection of ${camelCase(className)} entities from EventStore streams.
 *
 * This projection enables the existing ${className}Repository to continue
 * working with SQL while the data source transitions to EventStore.
 */
@Injectable()
export class ${className}SqlProjection {
  private isInitialized = false;
  private readonly systemUser: IUserToken;

  constructor(
    @Inject('ILogger') private readonly logger: ILogger,
    @InjectRepository(${className}Entity)
    private readonly ${camelCase(className)}Repository: Repository<${className}Entity>,
  ) {
    // Create a system user for operations
    this.systemUser = {
      sub: 'system-${camelCase(className)}-projection',
      preferred_username: 'system',
      name: 'System ${className} Projection',
      email: 'system@internal',
      tenant: 'system',
      roles: ['system'],
    } as IUserToken;
  }

  /**
   * Convert ${className}Entity to Snapshot${className}Props
   */
  private entityToSnapshot = (entity: ${className}Entity): Snapshot${className}Props => {
    return {`);
    table.cols.forEach((col) => {
      lines.push(
        `      ${camelCase(col.name)}: entity.${camelCase(col.name)},`,
      );
    });
    lines.push(`    };
  };

  /**
   * Convert Snapshot${className}Props to ${className}Entity
   */
  private snapshotToEntity = (
    snapshot: Snapshot${className}Props,
    tenant: string,
  ): Partial<${className}Entity> => {
    return {
      tenantId: tenant,`);
    table.cols.forEach((col) => {
      lines.push(
        `      ${camelCase(col.name)}: snapshot.${camelCase(col.name)},`,
      );
    });
    lines.push(`    };
  };

  /**
   * Get all ${camelCase(pluralize(className))} for a tenant with optional filtering
   * This method reads directly from SQL projection for optimal performance
   */
  async get${pluralize(className)}ForTenant(
    tenant: string,
    filter?: {`);
    idxCols.forEach((col) => {
      lines.push(`      ${camelCase(col.name)}?: ${col.type};`);
    });
    lines.push(`    },
  ): Promise<Snapshot${className}Props[]> {
    try {
      // Build where conditions
      const whereConditions: {
        tenantId: string;`);
    idxCols.forEach((col) => {
      if (col.idx && col.idx.fulltext && col.type === 'string') {
        addImport(imports, 'typeorm', ['FindOperator']);
        lines.push(`        ${camelCase(col.name)}?: FindOperator<string>;`);
      } else {
        lines.push(`        ${camelCase(col.name)}?: ${col.type};`);
      }
    });
    lines.push(`      } = { tenantId: tenant };
`);
    idxCols.forEach((col) => {
      console.log(col);
      lines.push(`      if (filter?.${camelCase(col.name)}) {
        ${
          col.idx && col.idx.fulltext && col.type === 'string'
            ? `whereConditions.${camelCase(col.name)} = Like(\`%\${filter.${camelCase(col.name)}}%\`);`
            : `whereConditions.${camelCase(col.name)} = filter.${camelCase(col.name)};`
        }
      }
`);
    });
    lines.push(`
      // Get all ${camelCase(pluralize(className))} for the tenant from SQL
      const ${camelCase(className)}Entities = await this.${camelCase(className)}Repository.find({
        where: whereConditions,
      });

      if (!${camelCase(className)}Entities || ${camelCase(className)}Entities.length === 0) {
        this.logger.debug(
          { tenant },
          'No ${camelCase(pluralize(className))} found for tenant in SQL projection',
        );
        return [];
      }

      // Convert entities to domain properties
      const ${camelCase(pluralize(className))} = ${camelCase(className)}Entities.map(this.entityToSnapshot);

      this.logger.debug(
        {
          tenant,
          totalCount: ${camelCase(pluralize(className))}.length,
          filter,
        },
        'Successfully retrieved ${camelCase(pluralize(className))} for tenant from SQL projection',
      );

      return ${camelCase(pluralize(className))};
    } catch (error) {
      this.logger.error(
        {
          tenant,
          filter,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${camelCase(pluralize(className))} for tenant from SQL projection',
      );
      return [];
    }
  }

  /**
   * Get ${camelCase(pluralize(className))} by multiple codes efficiently from SQL
   * Optimized for bulk operations with a single SQL query
   */
  async get${pluralize(className)}ByCodes(
    tenant: string,
    ${camelCase(pluralize(key.name))}: ${key.type}[],
  ): Promise<Snapshot${className}Props[]> {
    if (!${camelCase(pluralize(key.name))} || ${camelCase(pluralize(key.name))}.length === 0) {
      return [];
    }

    try {
      // Get ${camelCase(pluralize(className))} by codes from SQL
      const ${camelCase(className)}Entities = await this.${camelCase(className)}Repository.find({
        where: {
          tenantId: tenant,
          ${camelCase(key.name)}: In(${camelCase(pluralize(key.name))}),
        },
      });

      // Convert entities to domain properties
      const ${camelCase(pluralize(className))} = ${camelCase(className)}Entities.map(this.entityToSnapshot);

      this.logger.debug(
        {
          tenant,
          requestedCodes: ${camelCase(pluralize(key.name))},
          foundCount: ${camelCase(pluralize(className))}.length,
          totalRequested: ${camelCase(pluralize(key.name))}.length,
        },
        'Successfully retrieved ${camelCase(pluralize(className))} by ${camelCase(pluralize(key.name))} from SQL projection',
      );

      return ${camelCase(pluralize(className))};
    } catch (error) {
      this.logger.error(
        {
          tenant,
          ${camelCase(pluralize(key.name))},
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${camelCase(pluralize(className))} by codes from SQL projection',
      );
      return [];
    }
  }

  /**
   * Get a single ${camelCase(className)} by tenant and code from SQL
   * Used for individual ${camelCase(className)} lookups with optimal performance
   */
  async get${className}ByCode(
    tenant: string,
    ${camelCase(key.name)}: ${key.type},
  ): Promise<Snapshot${className}Props | null> {
    try {
      // Read the ${camelCase(className)} data directly from SQL
      const ${camelCase(className)}Entity = await this.${camelCase(className)}Repository.findOne({
        where: {
          tenantId: tenant,
          ${camelCase(key.name)},
        },
      });

      if (!${camelCase(className)}Entity) {
        this.logger.debug({ tenant, ${camelCase(key.name)} }, '${className} not found in SQL projection');
        return null;
      }

      // Convert entity to domain properties
      const ${camelCase(className)} = this.entityToSnapshot(${camelCase(className)}Entity);

      this.logger.debug(
        { tenant, ${camelCase(key.name)} },
        'Successfully retrieved ${camelCase(className)} from SQL projection',
      );

      return ${camelCase(className)};
    } catch (error) {
      this.logger.error(
        {
          tenant,
          ${camelCase(key.name)},
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get ${camelCase(className)} by ${camelCase(key.name)} from SQL projection',
      );
      return null;
    }
  }

  /**
   * Handle ${camelCase(className)} events and update Redis projection
   */
  async handle${className}Event(
    evt: Snapshot${className}Props,
    meta: IEventStoreMeta,
  ): Promise<void> {
    try {
      // Extract tenant from stream metadata or use default
      const tenant = meta.tenant || this.extractTenantFromStream(meta.stream);

      if (!tenant) {
        this.logger.warn(
          { evt, meta },
          'No tenant found in event metadata, skipping Redis update',
        );
        return;
      }

      // Create tenant-specific user context for Redis operations
      const tenantUser: IUserToken = {
        ...this.systemUser,
        tenant,
      };

      // Handle different event types
      if (this.isDeleteEvent(meta.type)) {
        await this.handle${className}Delete(evt, tenantUser, meta);
      } else {
        await this.handle${className}Upsert(evt, tenantUser, meta);
      }

      this.logger.debug(
        {
          tenant,
          ${camelCase(className)}Code: evt.${camelCase(key.name)},
          eventType: meta.type,
          streamName: meta.stream,
          version: meta.version,
        },
        'Updated Redis projection from EventStore event',
      );
    } catch (error) {
      this.logger.error(
        {
          evt,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to handle ${camelCase(className)} event in Redis projection',
      );
    }
  }

  /**
   * Handle ${camelCase(className)} creation/update events
   */
  private async handle${className}Upsert(
    evt: Snapshot${className}Props,
    user: IUserToken,
    meta: IEventStoreMeta,
  ): Promise<void> {
    try {
      // Convert event data to entity format
      const entityData = this.snapshotToEntity(evt, user.tenant || 'unknown');

      // Use upsert to handle both create and update cases
      await this.${camelCase(className)}Repository.save(entityData);

      this.logger.debug(
        {
          tenant: user.tenant,
          ${camelCase(className)}Code: evt.${camelCase(key.name)},
          eventType: meta.type,
        },
        '${className} upserted in SQL projection',
      );
    } catch (error) {
      this.logger.error(
        {
          evt,
          user: user.tenant,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to upsert ${camelCase(className)} in SQL projection',
      );
      throw error;
    }
  }

  /**
   * Handle ${camelCase(className)} deletion events
   */
  private async handle${className}Delete(
    evt: Snapshot${className}Props,
    user: IUserToken,
    meta: IEventStoreMeta,
  ): Promise<void> {
    try {
      // Delete from SQL database
      const deleteResult = await this.${camelCase(className)}Repository.delete({
        tenantId: user.tenant || 'unknown',
        ${camelCase(key.name)}: evt.${camelCase(key.name)},
      });

      if (deleteResult.affected && deleteResult.affected > 0) {
        this.logger.debug(
          {
            tenant: user.tenant,
            ${camelCase(className)}Code: evt.${camelCase(key.name)},
            eventType: meta.type,
          },
          '${className} deleted from SQL projection',
        );
      } else {
        this.logger.debug(
          {
            tenant: user.tenant,
            ${camelCase(className)}Code: evt.${camelCase(key.name)},
            eventType: meta.type,
          },
          '${className} not found in SQL for deletion',
        );
      }
    } catch (error) {
      this.logger.error(
        {
          evt,
          user: user.tenant,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to delete ${camelCase(className)} from SQL projection',
      );
      throw error;
    }
  }

  /**
   * Extract tenant from stream name using domain value object
   * Expected format: core.${camelCase(className)}.v1-tenant123-${snakeCase(className).toUpperCase()}CODE
   */
  private extractTenantFromStream(streamName: string): string | null {
    try {
      // Use domain value object for extraction
      const extracted =
        ${className}ProjectionKeys.extractFromStreamName(streamName);

      if (!extracted) {
        this.logger.warn(
          {
            streamName,
            expectedPattern: \`\${${className}ProjectionKeys.getEventStoreStreamPrefix()}-{tenant}-{code}\`,
            esdbKey: ${className}ProjectionKeys.getEventStoreStreamPrefix(),
          },
          'Stream name does not match expected EventStore pattern',
        );
        return null;
      }

      this.logger.debug(
        {
          streamName,
          tenant: extracted.tenant,
          ${camelCase(className)}Code: extracted.code,
          esdbPattern: ${className}ProjectionKeys.getEventStoreStreamPrefix(),
        },
        'Successfully extracted tenant from EventStore stream name',
      );

      return extracted.tenant;
    } catch (error) {
      this.logger.error(
        {
          streamName,
          esdbKey: ${className}ProjectionKeys.getEventStoreStreamPrefix(),
          error,
        },
        'Failed to extract tenant from stream name',
      );
      return null;
    }
  }

  /**
   * Check if event type indicates a deletion
   */
  private isDeleteEvent(eventType: string): boolean {
    const deleteEventTypes = [
      '${className}Deleted',
      '${className}DeletedEvent',
      '${camelCase(className)}-deleted',
      '${camelCase(className)}.deleted',
    ];

    return deleteEventTypes.some((type) =>
      eventType.toLowerCase().includes(type.toLowerCase()),
    );
  }

  /**
   * Rebuild SQL projection from scratch (useful for recovery)
   */
  async rebuildProjection(tenants: string[] = []): Promise<void> {
    this.logger.log({ tenants }, 'Starting SQL projection rebuild for ${camelCase(pluralize(className))}');

    try {
      // Clear existing SQL data for specified tenants
      if (tenants.length > 0) {
        for (const tenant of tenants) {
          const tenantUser: IUserToken = {
            ...this.systemUser,
            tenant,
          };

          // Clear all ${camelCase(pluralize(className))} for this tenant
          await this.clearTenant${pluralize(className)}(tenantUser);
        }
      }

      this.logger.log(
        { tenants },
        'SQL projection rebuild completed for ${camelCase(pluralize(className))}',
      );
    } catch (error) {
      this.logger.error(
        {
          tenants,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to rebuild SQL projection for ${camelCase(pluralize(className))}',
      );
      throw error;
    }
  }

  /**
   * Clear all ${camelCase(pluralize(className))} for a specific tenant
   */
  private async clearTenant${pluralize(className)}(user: IUserToken): Promise<void> {
    try {
      // Delete all ${camelCase(pluralize(className))} for the tenant from SQL
      const deleteResult = await this.${camelCase(className)}Repository.delete({
        tenantId: user.tenant || 'unknown',
      });

      this.logger.debug(
        { tenant: user.tenant, count: deleteResult.affected || 0 },
        'Cleared all ${camelCase(pluralize(className))} for tenant in SQL projection',
      );
    } catch (error) {
      this.logger.error(
        {
          tenant: user.tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to clear tenant ${camelCase(pluralize(className))} in SQL projection',
      );
      throw error;
    }
  }

  /**
   * Mark projection as initialized
   */
  markAsInitialized(): void {
    this.isInitialized = true;
    this.logger.log({}, '${className} SQL projection marked as initialized');
  }

  /**
   * Check if projection is ready for queries
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Health check for SQL connectivity
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Test SQL connectivity with a simple query
      await this.${camelCase(className)}Repository.query('SELECT 1');

      return this.isInitialized;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'SQL projection health check failed',
      );
      return false;
    }
  }
}
`);

    const fileBase = kebabCase(table.name);
    const filePath = path.join(
      outDir,
      fileBase,
      'infrastructure',
      'projectors',
      `${fileBase}-sql.projection.ts`,
    );
    if (schema.excluded?.includes(`${fileBase}-sql.projection.ts`)) {
      logger.info(
        `Skipping generation of ${fileBase}-sql.projection as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(
      filePath,
      buildImportLines(imports) + '\n' + lines.join('\n'),
    );
  }
};

const esdbProjectionManager = async (schema) => {
  const moduleName = upperFirst(camelCase(schema.service.module));
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${table.name} due to JSON primary key.`);
      continue;
    }

    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${table.name} due to no primary key.`);
      continue;
    }
    const key = keys[0];

    const className = upperFirst(camelCase(table.name));

    const projectorType = getProjectionType(schema, table);

    if (!projectorType) {
      logger.warn(
        `No projector type found for table ${table.name}. Skipping projection manager generation.`,
      );
      continue;
    }

    const projector = `${className}${upperFirst(projectorType)}Projection`;

    const moduleName = upperFirst(camelCase(schema.service.module));

    imports = [];

    addImport(imports, '@nestjs/common', [
      'Injectable',
      'Inject',
      'OnModuleInit',
      'OnModuleDestroy',
    ]);
    addImport(imports, 'src/shared/logger', ['ILogger']);
    addImport(imports, 'rxjs', `Subscription`);
    addImport(imports, 'src/shared/infrastructure/event-store', [
      'EventOrchestrationService',
      'IEventStoreMeta',
    ]);

    addImport(imports, '../../../shared/domain/value-objects', [
      `${moduleName}LoggingHelper`,
    ]);

    addImport(imports, `../../domain/properties`, `Snapshot${className}Props`);
    addImport(
      imports,
      `../../domain/value-objects/${kebabCase(className)}-projection-keys`,
      `${className}ProjectionKeys`,
    );
    switch (projectorType) {
      case 'memory':
        addImport(
          imports,
          `./${kebabCase(className)}-memory.projection`,
          `${className}MemoryProjection`,
        );
        break;
      case 'redis':
        addImport(
          imports,
          `./${kebabCase(className)}-redis.projection`,
          `${className}RedisProjection`,
        );
        break;
      case 'sql':
        addImport(
          imports,
          `./${kebabCase(className)}-sql.projection`,
          `${className}SqlProjection`,
        );
        break;
    }

    logger.success(`added imports for ${className}StoreProjection.`);

    lines = [];

    lines.push(`
/**
 * ${className} projection manager responsible for setting up and managing
 * the ${camelCase(className)} projection from EventStore streams.
 *
 * This service handles:
 * - Initial catchup from historical events
 * - Live subscription for new events
 * - Error handling and retry logic
 * - Projection lifecycle management
 */
@Injectable()
export class ${className}ProjectionManager
  implements OnModuleInit, OnModuleDestroy
{
  private subscriptions: Subscription[] = [];
  private isRunning = false;

  constructor(
    @Inject('ILogger') private readonly logger: ILogger,
    private readonly eventOrchestration: EventOrchestrationService,
    private readonly ${projector}: ${upperFirst(projector)},
  ) {}

  /**
   * Initialize the projection on module startup
   */
  async onModuleInit(): Promise<void> {
    try {
      const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'onModuleInit',
      );

      this.logger.log(
        logContext,
        'Starting ${camelCase(className)} projection manager initialization',
      );

      await this.startProjection();

      this.logger.log(
        logContext,
        '${className} projection manager initialized successfully',
      );
    } catch (error) {
      const errorContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'onModuleInit',
        undefined,
        undefined,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      this.logger.error(
        errorContext,
        'Failed to initialize ${camelCase(className)} projection manager',
      );
      throw error;
    }
  }

  /**
   * Clean up subscriptions on module destruction
   */
  onModuleDestroy(): void {
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      '${className}ProjectionManager',
      'onModuleDestroy',
    );

    this.logger.log(logContext, 'Shutting down ${camelCase(className)} projection manager');
    this.stopProjection();
  }

  /**
   * Start the ${camelCase(className)} projection with catchup and subscription
   */
  async startProjection(): Promise<void> {
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      '${className}ProjectionManager',
      'startProjection',
    );

    if (this.isRunning) {
      this.logger.warn(logContext, '${className} projection is already running');
      return;
    }

    try {
      this.isRunning = true;

      // Use domain value object for consistent stream pattern
      // This will capture all streams matching the pattern like banking.${camelCase(className)}.v1-tenant-USD
      const streamPattern =
        ${className}ProjectionKeys.getEventStoreCategoryPattern();

      const setupContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'startProjection',
        undefined,
        undefined,
        {
          streamPattern,
          esdbPrefix: ${className}ProjectionKeys.getEventStoreStreamPrefix(),
        },
      );

      this.logger.log(
        setupContext,
        'Setting up ${camelCase(className)} projection for stream pattern',
      );

      // Set up the projection with event handler
      await this.eventOrchestration.setupProjection(
        streamPattern,
        (event: Snapshot${className}Props, meta: IEventStoreMeta) => {
          void this.handle${className}Event(event, meta);
        },
      );

      // Mark projection as initialized after catchup completes
      this.${projector}.markAsInitialized();


      const successContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'startProjection',
        undefined,
        undefined,
        { streamPattern },
      );

      this.logger.log(
        successContext,
        '${className} projection setup completed successfully',
      );
    } catch (error) {
      this.isRunning = false;

      const errorContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'startProjection',
        undefined,
        undefined,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      this.logger.error(errorContext, 'Failed to start ${camelCase(className)} projection');
      throw error;
    }
  }

  /**
   * Stop the ${camelCase(className)} projection and clean up subscriptions
   */
  stopProjection(): void {
    const logContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
      '${className}ProjectionManager',
      'stopProjection',
    );

    try {
      this.isRunning = false;

      // Clean up all subscriptions
      for (const subscription of this.subscriptions) {
        if (subscription && !subscription.closed) {
          subscription.unsubscribe();
        }
      }
      this.subscriptions = [];

      this.logger.log(logContext, '${className} projection stopped successfully');
    } catch (error) {
      const errorContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'stopProjection',
        undefined,
        undefined,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );

      this.logger.error(
        errorContext,
        'Error while stopping ${camelCase(className)} projection',
      );
    }
  }

  /**
   * Handle ${camelCase(className)} events and route them to the projection
   */
  private async handle${className}Event(
    event: Snapshot${className}Props,
    meta: IEventStoreMeta,
  ): Promise<void> {
    try {
      // Filter for ${camelCase(className)}-related events only

      await this.${projector}.handle${className}Event(event, meta);
    } catch (error) {
      const errorContext = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'handle${className}Event',
        event?.${camelCase(key.name)}${key.type === 'string' ? '' : '.toString()'},
        undefined,
        {
          event,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );

      this.logger.error(
        errorContext,
        'Error handling ${camelCase(className)} event in projection manager',
      );
    }
  }

  /**
   * Restart the projection
   */
  private async restartProjection(): Promise<void> {
    const context = ${moduleName}LoggingHelper.createEnhancedLogContext(
      '${className}ProjectionManager',
      'restartProjection',
    );

    this.logger.warn(context, 'Restarting ${camelCase(className)} projection');

    this.stopProjection();
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    await this.startProjection();
  }

  /**
   * Health check for the projection
   */
  async isHealthy(): Promise<boolean> {
    const healthy = this.isRunning && this.${projector}.isHealthy();

    if (!healthy) {
      const context = ${moduleName}LoggingHelper.createEnhancedLogContext(
        '${className}ProjectionManager',
        'isHealthy',
        undefined,
        undefined,
        {
          isRunning: this.isRunning,
          redisProjectionHealthy: this.${projector}.isHealthy(),
        },
      );

      this.logger.warn(context, '${className} projection health check failed');
    }

    return healthy;
  }
}
`);

    const fileBase = kebabCase(table.name);
    const filePath = path.join(
      outDir,
      fileBase,
      'infrastructure',
      'projectors',
      `${fileBase}-projection.manager.ts`,
    );
    if (schema.excluded?.includes(`${fileBase}-projection.manager.ts`)) {
      logger.info(
        `Skipping generation of ${fileBase}-projection.manager as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(
      filePath,
      buildImportLines(imports) + '\n' + lines.join('\n'),
    );

    await createIndexFilesFromDirectory(
      path.join(outDir, kebabCase(className), 'infrastructure', 'projectors'),
    );
  }
};

exports.create = create;
