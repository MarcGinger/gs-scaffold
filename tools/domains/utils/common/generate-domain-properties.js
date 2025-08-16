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
    await generateDomainProperties(schema, finalConfig);
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
const generateDomainProperties = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for domain interfaces...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    if (shouldSkipTable(table, schema)) {
      logger.warn(`Skipping table ${tableId} due to skip logic.`);
      continue;
    }
    if (table.cols.find((col) => col.kp && col.datatype === 'JSON')) {
      logger.warn(
        `Skipping table ${tableId} because it has a JSON column with a primary key.`,
      );
      continue;
    }
    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      continue;
    }
    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));

    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for domain interface`,
    );

    try {
      // Prepare imports - imports from other domain entities
      const imports = {};

      // Add enum imports
      Object.values(table._enums || {}).forEach((enumObj) => {
        if (enumObj.file) {
          addImport(imports, `../entities`, enumObj.name);
        }
      });

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

      const lines = [
        `// generate-domain-properties`,
        `export interface ${className}Props {`,
      ];

      // Filter columns (exclude tenant and other implementation-specific columns)
      const domainColumns = table.cols
        .filter((col) => col.name !== 'tenant')
        .filter(
          (col) => !schema.parameters?.[table.name]?.cols?.[col.name]?.hidden,
        );

      // Group columns by logical sections for better readability
      const primaryColumns = domainColumns.filter((col) => col.pk);
      const basicInfoColumns = domainColumns.filter(
        (col) => !col.pk && !col._isRelationship,
      );
      const relationshipColumns = domainColumns.filter(
        (col) => col._isRelationship,
      );

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
              lines.push(
                `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: Record<string, I${relationship.parentClass}>;`,
              );
            } else {
              lines.push(
                `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: I${relationship.parentClass}[];`,
              );
            }
          } else if (
            relationship.c_p === 'one' &&
            relationship.c_ch === 'many'
          ) {
            // One-to-many relationship - reference as single domain interface
            lines.push(
              `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: I${relationship.parentClass};`,
            );
          }
        } else {
          if (!(col.pk && col.datatype === 'JSON')) {
            // Regular property - use domain-appropriate types
            const tsType = col.type || 'string';
            if (col.datatype === 'JSON' && col.enum) {
              lines.push(
                `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType}[];`,
              );
            } else {
              if (col.pk && col.datatype !== 'JSON') {
                addImport(
                  imports,
                  `../value-objects`,
                  `${upperFirst(camelCase(name))}Identifier`,
                );
                lines.push(
                  `  readonly ${colName}: ${upperFirst(camelCase(name))}Identifier;`,
                );
              } else {
                lines.push(
                  `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType};`,
                );
              }
            }
          }
        }
      }

      // Close interface definition
      lines.push('}');

      // Build import statements
      const importLines = buildImportLines(imports);

      // Combine imports and interface definition
      const domainInterface = importLines
        ? `${importLines}\n\n${lines.join('\n')}`
        : lines.join('\n');

      // Write to file
      const outputFile = path.join(
        outDir,
        kebabCase(name),
        'domain',
        'properties',
        `${kebabCase(name)}.props.ts`,
      );
      if (schema.excluded?.includes(`${kebabCase(name)}.props.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}.props.ts as it is excluded.`,
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

// Export the main entry point
module.exports = { create };
