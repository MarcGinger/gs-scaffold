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
    // if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
    //   logger.info(
    //     `Skipping domain interface for table: ${table.name} (JSON PK)`,
    //   );
    //   continue;
    // }

    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete
    ) {
      logger.info(
        `Skipping domain interface for table: ${table.name} (cancelled in schema)`,
      );
      continue;
    }

    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));

    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for domain interface`,
    );

    try {
      // Filter columns (exclude tenant and other implementation-specific columns)
      const createColumns = table.cols
        .filter((col) => col.name !== 'tenant')
        .filter((col) => col.defaultvalue !== 'uuid()')
        .filter(
          (col) => !schema.parameters?.[table.name]?.cols?.[col.name]?.hidden,
        );
      // Generate Create interface
      await generateInterfaceFile(
        schema,
        table,
        createColumns,
        outDir,
        className,
        'Create',
        '.model.ts',
      );

      // Filter columns (exclude tenant and other implementation-specific columns)
      const updateColumns = table.cols
        .filter((col) => col.name !== 'tenant')
        .filter(
          (col) => !schema.parameters?.[table.name]?.cols?.[col.name]?.hidden,
        );
      // Generate Update interface
      await generateInterfaceFile(
        schema,
        table,
        updateColumns,
        outDir,
        className,
        'Update',
        '.model.ts',
      );
    } catch (error) {
      logger.error(
        `Error processing table ${name} for domain interface: ${error.message}`,
      );
      // Continue with next table instead of stopping the whole process
    }
  }
};

/**
 * Generate a specific interface type (Create or Update) for a table
 * @param {Object} schema - The schema object
 * @param {Object} table - The table object
 * @param {String} outDir - Output directory
 * @param {String} className - Base class name
 * @param {String} interfaceType - Type of interface (Create or Update)
 * @param {String} fileExtension - File extension
 * @returns {Promise<void>}
 */
const generateInterfaceFile = async (
  schema,
  table,
  domainColumns,
  outDir,
  className,
  interfaceType,
  fileExtension,
) => {
  // Prepare imports - imports from other domain entities
  const imports = {};

  // Add enum imports
  Object.values(table._enums || {}).forEach((enumObj) => {
    if (enumObj.file) {
      addImport(imports, `../entities`, enumObj.name);
    }
  });

  const lines = [
    `export interface ${interfaceType}${className}Props {`,
  ];

  // Process all columns
  for (const col of domainColumns) {
    const colName = camelCase(col.name);
    // For Update interface all fields are optional, for Create interface respect the nn (not null) property
    const isRequired = interfaceType === 'Create' ? col.nn : false;

    // Handle relationship columns specially
    const relationship = (table._relationships || []).find(
      (r) => r.childCol === col.name,
    );
    const tsType = col.type || 'string';
    if (relationship) {
      // Handle relationship properties
      if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
        // Many-to-many relationship - reference as array of domain interfaces
        if (col.datatype === 'JSON') {
          if (col.defaultvalue === 'object()') {
            addImport(
              imports,
              `../../../${kebabCase(relationship.parentClass)}/domain`,
              `${interfaceType}${relationship.parentClass}Props`,
            );
            lines.push(
              `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: Record<string, ${interfaceType}${relationship.parentClass}Props>;`,
            );
          } else {
            addImport(
              imports,
              `../../../${kebabCase(relationship.parentClass)}/domain`,
              `${interfaceType}${relationship.parentClass}Props`,
            );
            lines.push(
              `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: ${interfaceType}${relationship.parentClass}Props[];`,
            );
          }
        } else {
          lines.push(
            `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType}[];`,
          );
        }
      } else if (relationship.c_p === 'one' && relationship.c_ch === 'many') {
        // One-to-many relationship - reference as single domain interface
        if (col.datatype === 'JSON') {
          addImport(
            imports,
            `../../../${kebabCase(relationship.parentClass)}/domain`,
            `${interfaceType}${relationship.parentClass}Props`,
          );

          lines.push(
            `  readonly ${camelCase(col.name)}${isRequired ? '' : '?'}: ${interfaceType}${relationship.parentClass}Props;`,
          );
        } else {
          lines.push(
            `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType};`,
          );
        }
      }
    } else {
      if (!(col.pk && col.datatype === 'JSON')) {
        if (col.datatype === 'JSON' && col.enum) {
          lines.push(
            `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType}[];`,
          );
        } else {
          lines.push(
            `  readonly ${colName}${isRequired ? '' : '?'}: ${tsType};`,
          );
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
    kebabCase(table.name),
    'domain',
    'properties',
    `${interfaceType.toLowerCase()}-${kebabCase(table.name)}${fileExtension}`,
  );
  if (
    schema.excluded?.includes(
      `${interfaceType.toLowerCase()}-${kebabCase(table.name)}${fileExtension}`,
    )
  ) {
    logger.info(
      `Skipping generation of ${interfaceType.toLowerCase()}-${kebabCase(table.name)}${fileExtension} as it is excluded.`,
    );
  } else {
    await writeFileWithDir(outputFile, domainInterface);
    logger.success(
      `Created domain ${interfaceType.toLowerCase()} interface: ${outputFile}`,
    );
  }
};

// Export the main entry point
module.exports = { create };
