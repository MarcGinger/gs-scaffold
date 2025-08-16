const path = require('path');
const {
  writeFileWithDir,
  createIndexFilesFromDirectory,
  copyDirectory,
} = require('../utils/file-utils');
const { handleStep } = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  singularize,
  sentenceCase,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

/**
 * Main entry point to generate domain model interfaces from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<Object>} - Returns errors object with generated error definitions
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info('Starting domain model interface generation...');
  try {
    const errors = {};
    await handleStep(
      'generateDomainInterfaces',
      async () => await generateDomainKeys(schema, finalConfig),
      errors,
    );

    await handleStep(
      'generateDomainConstants',
      async () => await generateDomainConstants(schema, finalConfig),
      errors,
    );
    await handleStep(
      'generateDomainLoggerContent',
      async () => await generateDomainLoggerContent(schema, finalConfig),
      errors,
    );

    const outDir = path.resolve(schema.sourceDirectory);
    createIndexFilesFromDirectory(
      path.join(outDir, 'shared', 'domain', 'value-objects'),
    );
    // Generate domain interfaces and collect errors

    logger.success('Domain model interface generation completed successfully');
    return errors;
  } catch (error) {
    logger.error(
      `Error during domain model interface generation: ${error.message}`,
    );
    throw error;
  }
};

/**
 * Generate domain model interfaces from a schema
 * @param {Object} schema - The schema object
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Returns errors object with generated error definitions
 */
const generateDomainKeys = async (schema, config) => {
  const errors = {};
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for domain interfaces...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    const hasRedis =
      schema.parameters?.[table.name]?.store?.read === 'redis' ||
      schema.parameters?.[table.name]?.store?.write === 'redis' ||
      schema.parameters?.[table.name]?.store?.list === 'redis';

    const hasEsdb =
      schema.parameters?.[table.name]?.store?.read === 'eventstream' ||
      schema.parameters?.[table.name]?.store?.write === 'eventstream' ||
      schema.parameters?.[table.name]?.store?.list === 'eventstream';

    if (!hasRedis && !hasEsdb) {
      logger.warn(
        `Skipping table ${tableId} as it has no Redis or EventStream configuration.`,
      );
      continue;
    }

    errors[table.name] = {};
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(
        `Skipping table ${tableId} with JSON PK as it cannot be represented in domain model.`,
      );
      continue;
    }

    const keys = table.cols.filter((col) => col.pk);
    if (keys.length !== 1) {
      continue;
    }
    const key = keys[0];
    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));

    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for domain interface`,
    );

    const fieldName = upperFirst(camelCase(key.name));

    const redisCategory = schema.parameters?.[table.name]?.redis?.category;

    const serviceName = upperFirst(camelCase(schema.service.module));
    const esdbBoundedContext =
      schema.parameters?.[table.name]?.eventstream?.boundedContext || 'core';
    try {
      const lines = [];
      lines.push(`import { ${serviceName}ServiceConstants } from '../../../shared/domain/value-objects';
`);
      lines.push(`/**
 * Domain value object for ${className} projection keys
 * Centralizes all key patterns to prevent duplication and ensure consistency
 * Follows DDD principle of explicit domain concepts
 */
export class ${className}ProjectionKeys {`);
      if (hasEsdb) {
        lines.push(`  // EventStore DB patterns
  static readonly ESDB_BOUNDED_CONTEXT = ${serviceName}ServiceConstants.BOUNDED_CONTEXT;;
  static readonly ESDB_AGGREGATE_NAME = '${schema.parameters?.[table.name]?.eventstream?.aggregate?.replace(/[^A-Za-z0-9]/g, '') || camelCase(className)}';
  static readonly ESDB_VERSION = '${schema.parameters?.[table.name]?.eventstream?.version?.replace(/[^A-Za-z0-9]/g, '') || 'v1'}';
`);
      }
      if (hasRedis) {
        lines.push(`  // Redis projection patterns
  static readonly REDIS_LOOKUP_PREFIX = '${schema.parameters?.[table.name]?.redis?.prefix?.replace(/[^A-Za-z0-9]/g, ':') || 'lookups:core'}';
  static readonly REDIS_AGGREGATE_NAME = '${schema.parameters?.[table.name]?.redis?.aggregate?.replace(/[^A-Za-z0-9]/g, '') || camelCase(className)}';
  static readonly REDIS_VERSION = '${schema.parameters?.[table.name]?.redis?.version?.replace(/[^A-Za-z0-9]/g, '') || 'v1'}';
`);
      }
      if (hasRedis) {
        lines.push(`  /**
   * Get Redis projection key
   * Format: lookups:core.${camelCase(className)}.v1
   */
  static getRedisProjectionKey(): string {
    return \`\${this.REDIS_LOOKUP_PREFIX}.\${this.REDIS_AGGREGATE_NAME}.\${this.REDIS_VERSION}\`;
  }
  `);
      }
      if (hasEsdb) {
        lines.push(`  /**
   * Get EventStore stream prefix for individual streams
   * Format: ${esdbBoundedContext}.${camelCase(className)}.v1
   */
  static getEventStoreStreamPrefix(): string {
    return \`\${this.ESDB_BOUNDED_CONTEXT}.\${this.ESDB_AGGREGATE_NAME}.\${this.ESDB_VERSION}\`;
  }

  /**
   * Get EventStore category projection pattern for catchup
   * Format: $ce-${esdbBoundedContext}.${camelCase(className)}.v1
   */
  static getEventStoreCategoryPattern(): string {
    return \`$ce-\${this.getEventStoreStreamPrefix()}\`;
  }

  /**
   * Get individual EventStore stream name for specific tenant and code
   * Format: ${esdbBoundedContext}.${camelCase(className)}.v1-{tenant}-{code}
   */
  static getEventStoreStreamName(tenant: string, code: string): string {
    return \`\${this.getEventStoreStreamPrefix()}-\${tenant}-\${code}\`;
  }

  /**
   * Extract tenant and code from EventStore stream name
   * Validates format: ${esdbBoundedContext}.${camelCase(className)}.v1-{tenant}-{code}
   */
  static extractFromStreamName(
    streamName: string,
  ): { tenant: string; code: string } | null {
    const prefix = this.getEventStoreStreamPrefix();
    const pattern = new RegExp(
      \`^\${prefix.replace(/\\./g, '\\\\.')}-([^-]+)-(.+)$\`,
    );
    const match = streamName.match(pattern);

    if (!match) {
      return null;
    }

    const [, tenant, code] = match;
    return { tenant, code };
  }

  /**
   * Validate if stream name matches ${camelCase(className)} pattern
   */
  static is${className}Stream(streamName: string): boolean {
    return this.extractFromStreamName(streamName) !== null;
  }

  /**
   * Get stream pattern for tenant-specific catchup
   * Format: ${esdbBoundedContext}.${camelCase(className)}.v1-{tenant}-*
   */
  static getTenantStreamPattern(tenant: string): string {
    return \`\${this.getEventStoreStreamPrefix()}-\${tenant}-*\`;
  }

  /**
   * Get global stream pattern for all tenants
   * Format: ${esdbBoundedContext}.${camelCase(className)}.v1-*
   */
  static getGlobalStreamPattern(): string {
    return \`\${this.getEventStoreStreamPrefix()}-*\`;
  }`);
      }
      lines.push(`}
`);

      // Define error messages for value object validation

      // Write to file
      const outputFile = path.join(
        outDir,

        `${kebabCase(name)}`,
        'domain',
        'value-objects',
        `${kebabCase(name)}-projection-keys.ts`,
      );
      if (schema.excluded?.includes(`${kebabCase(name)}-projection-keys.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}-projection-keys.ts as it is excluded.`,
        );
        continue;
      }
      await writeFileWithDir(outputFile, lines.join('\n'));
      logger.success(`Created domain interface: ${outputFile}`);
    } catch (error) {
      logger.error(
        `Error processing table ${name} for domain interface: ${error.message}`,
      );
      // Continue with next table instead of stopping the whole process
    }
  }

  return errors;
};

const generateDomainConstants = async (schema, config) => {
  const errors = {};
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for domain interfaces...`);

  let tableIndex = 0;

  let hasRedis = false;
  let hasEsdb = false;

  for (const [tableId, table] of Object.entries(tables)) {
    if (
      schema.parameters?.[table.name]?.store?.read === 'redis' ||
      schema.parameters?.[table.name]?.store?.write === 'redis' ||
      schema.parameters?.[table.name]?.store?.list === 'redis'
    ) {
      hasRedis = true;
    }

    if (
      schema.parameters?.[table.name]?.store?.read === 'eventstream' ||
      schema.parameters?.[table.name]?.store?.write === 'eventstream' ||
      schema.parameters?.[table.name]?.store?.list === 'eventstream'
    ) {
      hasEsdb = true;
    }
  }

  const className = upperFirst(camelCase(schema.service.module));

  try {
    const lines = [];

    lines.push(`/**
 * Service-wide constants for the ${schema.service.name} bounded context
 *
 * This value object encapsulates fundamental domain concepts that are
 * consistent across all aggregates within the ${schema.service.module} service.
 *
 * Domain Context: Cross-cutting domain constants
 * Bounded Context: ${schema.service.module} Module
 */
export class ${className}ServiceConstants {
  /**
   * Service identifier for the ${schema.service.module} bounded context
   * Used in event metadata, logging, and service identification
   */
  static readonly SERVICE_NAME = '${schema.service.module}' as const;

  /**
   * Service version for compatibility and migration tracking
   */
  static readonly SERVICE_VERSION = '${schema.service.version}' as const;

  /**
   * Bounded context identifier for domain separation
   */
  static readonly BOUNDED_CONTEXT = '${camelCase(className)}' as const;
`);
    lines.push(`  /**
   * Default event store category for this service
   */
  static readonly EVENT_STORE_CATEGORY =
    \`\${this.BOUNDED_CONTEXT}-\${this.SERVICE_NAME}\` as const;
`);
    lines.push(`  /**
   * Service metadata for event sourcing and monitoring
   */
  static getServiceMetadata(): {
    serviceName: string;
    serviceVersion: string;
    boundedContext: string;`);
    lines.push(`    eventStoreCategory: string;`);
    lines.push(`  } {
    return {
      serviceName: this.SERVICE_NAME,
      serviceVersion: this.SERVICE_VERSION,
      boundedContext: this.BOUNDED_CONTEXT,`);
    lines.push(`      eventStoreCategory: this.EVENT_STORE_CATEGORY,`);
    lines.push(`    };
  }

  /**
   * Create standardized service metadata for event streams
   */
  static createEventMetadata(
    aggregateType: string,
    correlationId?: string,
    causationId?: string,
  ): {
    service: string;
    context: string;
    aggregateType: string;
    version: string;
    correlationId?: string;
    causationId?: string;
  } {
    return {
      service: this.SERVICE_NAME,
      context: this.BOUNDED_CONTEXT,
      aggregateType,
      version: this.SERVICE_VERSION,
      correlationId,
      causationId,
    };
  }

  /**
   * Validate if a service name matches this bounded context
   */
  static isValidServiceName(serviceName: string): boolean {
    return serviceName === this.SERVICE_NAME;
  }

  /**
   * Get logging context for this service
   */
  static getLoggingContext(
    component: string,
    method: string,
    identifier?: string,
  ): {
    service: string;
    boundedContext: string;
    component: string;
    method: string;
    identifier?: string;
  } {
    return {
      service: this.SERVICE_NAME,
      boundedContext: this.BOUNDED_CONTEXT,
      component,
      method,
      identifier,
    };
  }
}
`);

    // Define error messages for value object validation

    // Write to file
    const outputFile = path.join(
      outDir,

      `shared`,
      'domain',
      'value-objects',
      `service-constants.ts`,
    );
    if (schema.excluded?.includes(`service-constants.ts`)) {
      logger.info(
        `Skipping generation of service-constants.ts as it is excluded.`,
      );
    } else {
      await writeFileWithDir(outputFile, lines.join('\n'));
      logger.success(`Created domain interface: ${outputFile}`);
    }
  } catch (error) {
    logger.error(
      `Error processing table ${name} for domain interface: ${error.message}`,
    );
    // Continue with next table instead of stopping the whole process
  }

  return errors;
};

const generateDomainLoggerContent = async (schema, config) => {
  const errors = {};
  const outDir = path.resolve(schema.sourceDirectory);
  const className = upperFirst(camelCase(schema.service.module));
  try {
    const lines = [];
    lines.push(`import { ${className}ServiceConstants } from './service-constants';

/**
 * Centralized logging context helper for the Bank Product bounded context
 *
 * This utility ensures DRY principle by providing a single location for
 * enhanced logging context creation across repositories, use cases, and services.
 *
 * Domain Context: Cross-cutting logging concern
 * Bounded Context: Bank Product Module
 */
export class ${className}LoggingHelper {
  /**
   * Create enhanced logging context using centralized service constants
   * Provides consistent logging structure across all components
   *
   * @param component - The component name (e.g., 'ChannelRepository', 'CreateChannelUseCase')
   * @param method - The method name (e.g., 'execute', 'save', 'get')
   * @param identifier - Optional entity identifier (e.g., channel code)
   * @param user - Optional user token for enhanced context
   * @param additionalContext - Optional additional context properties
   * @returns Enhanced logging context with service constants and user information
   */
  static createEnhancedLogContext(
    component: string,
    method: string,
    identifier?: string,
    user?: {
      tenant?: string;
      preferred_username?: string;
      sub?: string;
    },
    additionalContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    // Get base context from centralized service constants
    const baseContext = ${className}ServiceConstants.getLoggingContext(
      component,
      method,
      identifier,
    );

    // Enhance with user information and additional context
    const enhancedContext: Record<string, unknown> = { ...baseContext };

    if (user) {
      enhancedContext.tenant = user.tenant;
      enhancedContext.username = user.preferred_username;
      enhancedContext.userId = user.sub;
    }

    if (additionalContext) {
      Object.assign(enhancedContext, additionalContext);
    }

    return enhancedContext;
  }

  /**
   * Create logging context specifically for saga operations
   * Includes saga-specific metadata for distributed transaction tracking
   */
  static createSagaLogContext(
    component: string,
    method: string,
    identifier?: string,
    user?: {
      tenant?: string;
      preferred_username?: string;
      sub?: string;
    },
    sagaContext?: {
      sagaId?: string;
      correlationId?: string;
      operationId?: string;
      isRetry?: boolean;
    },
    additionalContext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const baseContext = this.createEnhancedLogContext(
      component,
      method,
      identifier,
      user,
      additionalContext,
    );

    if (sagaContext) {
      Object.assign(baseContext, {
        sagaId: sagaContext.sagaId,
        correlationId: sagaContext.correlationId,
        operationId: sagaContext.operationId,
        isRetry: sagaContext.isRetry || false,
      });
    }

    return baseContext;
  }
}
`);
    // Write to file
    const outputFile = path.join(
      outDir,

      `shared`,
      'domain',
      'value-objects',
      `logging-context.helper.ts`,
    );
    if (schema.excluded?.includes(`logging-context.helper.ts`)) {
      logger.info(
        `Skipping generation of logging-context.helper.ts as it is excluded.`,
      );
    } else {
      await writeFileWithDir(outputFile, lines.join('\n'));
      logger.success(`Created domain interface: ${outputFile}`);
    }
  } catch (error) {
    logger.error(
      `Error processing table ${name} for domain interface: ${error.message}`,
    );
  }
};

// Export the main entry point
module.exports = { create };
