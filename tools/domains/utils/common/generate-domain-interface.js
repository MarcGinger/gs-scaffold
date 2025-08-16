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
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

/**
 * Helper function to detect fields that should be represented as enums
 * @param {string} colName - The column name
 * @param {string} tableName - The table name
 * @param {Object} col - The column definition object
 * @returns {Object|null} - The enum definition or null
 */
function detectEnum(colName, tableName, col) {
  // Check if column has ENUM datatype
  if (
    col.dt?.toUpperCase() === 'ENUM' ||
    col.datatype?.toUpperCase() === 'ENUM' ||
    (col.enum && col.datatype?.toUpperCase() === 'JSON')
  ) {
    const enumValues = parseEnumValues(col.enum || '');
    const enumBase = upperFirst(camelCase(tableName));
    const fieldBase = upperFirst(camelCase(colName));

    return {
      name: `${enumBase}${fieldBase}Enum`,
      values: enumValues,
    };
  }

  return null;
}

/**
 * Helper function to parse enum values from a comma-delimited string
 * @param {string} enumString - The comma-delimited enum values string
 * @returns {Object} - The enum values mapping
 */
function parseEnumValues(enumString) {
  if (!enumString || typeof enumString !== 'string') {
    return {};
  }

  const values = enumString
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return {};
  }

  // Convert values to enum format: VALUE = 'value'
  const result = {};
  values.forEach((value) => {
    // Create KEY in uppercase (PENDING for 'pending')
    const key = value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    result[key] = value;
  });

  return result;
}

/**
 * Main entry point to generate domain model interfaces from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info('Starting domain model interface generation...');
  try {
    // Generate domain interfaces
    await generateDomainInterfaces(schema, finalConfig);
    logger.success('Domain model interface generation completed successfully');
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
 * @returns {Promise<void>}
 */
const generateDomainInterfaces = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for domain interfaces...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    // if (shouldSkipTable(table, schema)) {
    //   logger.warn(`Skipping table ${tableId} due to skip logic.`);
    //   continue;
    // }

    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));

    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for domain interface`,
    );

    try {
      // Prepare imports - imports from other domain entities
      const imports = {};

      // Add relationship imports for relationships to other domain entities
      table._relationships?.forEach((relationship) => {
        if (relationship.isChild && relationship.parent) {
          // Import interfaces for each related entity
          addImport(
            imports,
            `../../../${kebabCase(relationship.parent)}/domain`,
            `I${relationship.parentClass}`,
          );
        }
      });

      // Detect and store enums for this model
      const generatedEnums = {};

      // Generate enum definitions
      const enumLines = [];

      // Filter columns (exclude tenant and other implementation-specific columns)
      const domainColumns = table.cols
        .filter((col) => col.name !== 'tenant')
        .filter(
          (col) => !schema.parameters?.[table.name]?.cols?.[col.name]?.hidden,
        );

      // Pre-process to detect enums
      for (const col of domainColumns) {
        const colName = camelCase(col.name);

        // Check if there's a custom enum definition in schema parameters
        const customEnum = getCustomEnumDefinition(
          schema,
          table.name,
          col.name,
        );

        // If custom enum is defined, use it; otherwise detect automatically
        const enumDefinition =
          customEnum || detectEnum(colName, table.name, col);

        if (enumDefinition) {
          generatedEnums[colName] = enumDefinition;

          // Generate the enum definition
          enumLines.push(`export enum ${enumDefinition.name} {`);
          Object.entries(enumDefinition.values).forEach(([key, value]) => {
            enumLines.push(`  ${key} = '${value}',`);
          });
          enumLines.push('}');
          enumLines.push('');
        }
      }

      // Interface lines come after enum definitions
      const interfaceLines = [`export interface I${className} {`];

      // Process all columns
      for (const col of domainColumns) {
        const colName = camelCase(col.name);
        const isRequired = col.nn;

        // Handle relationship columns specially
        const relationship = (table._relationships || []).find(
          (r) => r.childCol === col.name,
        );

        if (relationship) {
          // Handle relationship properties
          if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
            // Many-to-many relationship - reference as array of domain interfaces
            if (col.defaultvalue === 'object()') {
              interfaceLines.push(
                `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: Record<string, I${relationship.parentClass}>;`,
              );
            } else {
              interfaceLines.push(
                `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: I${relationship.parentClass}[];`,
              );
            }
          } else if (
            relationship.c_p === 'one' &&
            relationship.c_ch === 'many'
          ) {
            // One-to-many relationship - reference as single domain interface
            interfaceLines.push(
              `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: I${relationship.parentClass};`,
            );
          }
        } else {
          if (!(col.pk && col.datatype === 'JSON')) {
            // Regular property - use domain-appropriate types
            let tsType = col.type || 'string';

            // Use enum type if detected
            if (generatedEnums[colName]) {
              tsType = generatedEnums[colName].name;
            }
            if (col.datatype === 'JSON' && col.enum) {
              interfaceLines.push(
                `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType}[];`,
              );
            } else {
              interfaceLines.push(
                `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType};`,
              );
            }
          }
        }
      }

      // Close interface definition
      interfaceLines.push('}');

      // Combine enum definitions and interface
      const allLines = [...enumLines, ...interfaceLines];

      // Build import statements
      const importLines = buildImportLines(imports);

      // Combine imports and interface definition
      const domainInterface = importLines
        ? `${importLines}\n\n${allLines.join('\n')}`
        : allLines.join('\n');

      // Write to file
      const outputFile = path.join(
        outDir,
        kebabCase(name),
        'domain',
        'entities',
        `${kebabCase(name)}.model.ts`,
      );
      if (schema.excluded?.includes(`${kebabCase(name)}.model.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}.model.ts as it is excluded.`,
        );
        continue;
      }
      await writeFileWithDir(outputFile, domainInterface);
      logger.success(`Created domain interface: ${outputFile}`);
    } catch (error) {
      logger.error(
        `Error processing table ${name} for domain interface: ${error.message}`,
      );
      // Continue with next table instead of stopping the whole process
    }
  }
};

/**
 * Helper function to get custom enum definition from schema parameters if it exists
 * @param {Object} schema - The schema object
 * @param {string} tableName - The table name
 * @param {string} colName - The column name
 * @returns {Object|null} - The custom enum definition or null
 */
function getCustomEnumDefinition(schema, tableName, colName) {
  const tableParams = schema.parameters?.[tableName];
  const colParams = tableParams?.cols?.[colName];

  // Check if custom enum is defined in schema parameters
  if (colParams?.enum) {
    const enumName =
      colParams.enumName ||
      `${upperFirst(camelCase(tableName))}${upperFirst(camelCase(colName))}Enum`;

    // If enumValues is a string, parse it as comma-delimited values
    let enumValues = [];
    if (typeof colParams.enumValues === 'string') {
      enumValues = parseEnumValues(colParams.enumValues);
    }

    return {
      name: enumName,
      values: enumValues,
    };
  }

  return null;
}

// Export the main entry point
module.exports = { create };
