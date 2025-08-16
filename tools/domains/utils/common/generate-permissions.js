#!/usr/bin/env node
/**
 * generate-update-request-dtos.js
 *
 * A Node.js script to generate NestJS Create and Update Request DTOs
 * from a cleaned JSON schema, using the decorator functions we've created.
 *
 * - All DTO files will be in src/dtos/<entity>/
 * - Creates both CreateRequest and UpdateRequest DTOs
 */
const path = require('path');
const { writeFileWithDir } = require('../utils/file-utils');
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
} = require('../utils/word-utils');
const { logger, defaultConfig, addImport } = require('../utils/general-utils');

/**
 * Main entry point to generate both create and update DTOs from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info('Starting Create/Update DTO generation...');
  try {
    // Generate both create and update DTOs
    await Promise.all([await generatePermissions(schema, finalConfig)]);
    logger.success('Create/Update DTO generation completed successfully');
  } catch (error) {
    logger.error(`Error during generation: ${error.message}`);
    throw error;
  }
};

/**
 * Uses lines.push and addImport patterns like generateCreateDtos
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generatePermissions = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);

  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Permissions generation...`);

  for (const [tableId, table] of Object.entries(tables)) {
    if (shouldSkipTable(table, schema)) {
      logger.warn(`Skipping table ${tableId} due to skip logic.`);
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${tableId} due to no primary key.`);
      continue;
    }
    const permissionConfig = schema.parameters?.[table.name].permissions || {
      enabled: true,
    };
    if (!permissionConfig.enabled) {
      logger.info(
        `Skipping Permissions generation for ${table.name} as it is disabled in the schema.`,
      );
      continue;
    }
    const permissionPrefix = permissionConfig.prefix || kebabCase(table.name);
    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) => idx.cols.map((c) => c.colid))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => table.cols.find((c) => c.id === id))
      .filter(Boolean);

    const name = table.name;
    const className = upperFirst(camelCase(name));
    const kebabName = kebabCase(name);
    // Permissions lines
    const lines = [];
    lines.push(`export enum ${className}Permissions {`);

    let hasRead = false;
    if (idxCols.length) {
      hasRead = true;
    }
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      hasRead = true;
    }
    if (!schema.parameters?.[table.name]?.cancel?.batch) {
      if (keys.length === 1) {
        hasRead = true;
      }
    }
    if (hasRead) {
      lines.push(`  Read = '${permissionPrefix}.read',`);
    }
    // Create endpoint
    if (!schema.parameters?.[table.name]?.cancel?.create) {
      lines.push(`  Create = '${permissionPrefix}.create',`);
    }

    if (!schema.parameters?.[table.name]?.cancel?.update) {
      // Update endpoint
      lines.push(`  Update = '${permissionPrefix}.update',`);
    }
    if (!schema.parameters?.[table.name]?.cancel?.delete) {
      // Delete endpoint
      lines.push(`  Delete = '${permissionPrefix}.delete',`);
    }

    // Batch get endpoint

    if (!schema.parameters?.[table.name]?.cancel?.update) {
      // Conditionally add status endpoints if schema has a status or enabled column
      if (
        table.cols.some(
          (col) => col.name === 'status' && col.datatype === 'ENUM',
        )
      ) {
        lines.push(`  UpdateStatus = '${permissionPrefix}.update.status',`);
      }
      if (table.cols.some((col) => col.name === 'enabled')) {
        lines.push(`  UpdateEnabled = '${permissionPrefix}.update.enabled',`);
      }

      table._relationships.forEach((relation) => {
        if (
          relation.c_ch === 'many' &&
          relation.c_p === 'many' &&
          relation.parent !== table.name
        ) {
          const col = table.cols.find((col) => col.name === relation.childCol);
          if (!col) {
            logger.warn(
              `Skipping relation ${relation.childCol} for ${table.name} as it does not exist in the table columns.`,
            );
            return;
          }
          if (col.defaultvalue === `object()`) {
            logger.warn(
              `Skipping relation ${relation.childCol} for ${table.name} as it is an object type.`,
            );
            return;
          }
          const childBase = upperFirst(
            camelCase(singularize(relation.childCol)),
          );
          lines.push(
            `  ${childBase}Add = '${permissionPrefix}.${kebabCase(childBase)}.add',`,
          );
          lines.push(
            `  ${childBase}Remove = '${permissionPrefix}.${kebabCase(childBase)}.remove',`,
          );
        }
      });
    }
    const apis = schema.parameters[table.name]?.apis || {};

    // ...existing code...
    for (const [apiId, api] of Object.entries(apis)) {
      // Determine HTTP method decorator
      // Build method name (e.g., resetStream)
      const methodName = camelCase(
        apiId
          .replace(/[:/]/g, ' ')
          .replace(/\s+([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\s/g, ''),
      );

      lines.push(
        `  ${upperFirst(methodName)} = '${permissionPrefix}.${kebabCase(methodName)}',`,
      );
    }

    lines.push('}');
    lines.push('');

    // Build import statements

    const PermissionsFile = path.join(
      outDir,
      kebabName,
      'domain',
      'permissions',
      `${kebabName}.permissions.ts`,
    );
    console.log(PermissionsFile);
    if (schema.excluded?.includes(`${kebabName}.permissions.ts`)) {
      logger.info(
        `Skipping generation of ${kebabName}.permissions.ts as it is excluded.`,
      );
    } else {
      await writeFileWithDir(PermissionsFile, lines.join('\n'));
      logger.success(`Created Permissions: ${PermissionsFile}`);
    }
  }
};

// Export the main entry point
module.exports = { create };
