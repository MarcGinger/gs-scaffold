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
    await Promise.all([
      generateCreateDtos(schema, finalConfig),
      generateUpdateDtos(schema, finalConfig),
    ]);
    logger.success('Create/Update DTO generation completed successfully');
  } catch (error) {
    logger.error(`Error during Create/Update DTO generation: ${error.message}`);
    throw error;
  }
};

/**
 * Generate Create DTOs from a schema
 * @param {Object} schema - The schema object
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generateCreateDtos = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Create DTOs...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    // Skip if create DTO is disabled for this table
    if (schema.parameters?.[table.name]?.cancel?.create) {
      logger.debug(
        `Skipping Create DTO for table: ${table.name} (disabled in schema)`,
      );
      continue;
    }

    // if (table.cols.filter((col) => col.pk && col.datatype === 'JSON').length) {
    //   logger.info(
    //     `Skipping domain interface for table: ${table.name} (disabled in schema)`,
    //   );
    //   continue;
    // }

    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));

    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for Create DTO`,
    );

    try {
      // COMMON IMPORTS
      const imports = {
        '../../domain/properties': new Set([`Create${className}Props`]),
      };

      // Add enum imports
      Object.values(table._enums || {}).forEach((enumObj) => {
        addImport(imports, '../../domain/entities', enumObj.name);
      });

      // Add relationship imports if needed
      table.cols
        .filter((col) => col.name !== 'tenant')
        .filter((col) => col.defaultvalue !== 'uuid()')
        .filter((col) => col.datatype === 'JSON')
        .forEach((col) => {
          (table._relationships || [])
            .filter((relationship) => relationship.childCol === col.name)
            // Check if the relationship is a child object

            .forEach(({ parentClass }) => {
              addImport(
                imports,
                `../../../${kebabCase(parentClass)}/application/dtos`,
                `${parentClass}CreateRequest`,
              );
            });
        });

      const lines = [
        ``,
        `/**`,
        ` * ${className} create request DTO`,
        ` */`,
        `export class ${className}CreateRequest implements Create${className}Props {`,
      ];

      // Filter columns for create DTO (exclude tenant and UUID columns)
      const createColumns = table.cols
        .filter((col) => col.name !== 'tenant')
        .filter((col) => col.defaultvalue !== 'uuid()')
        .filter((col) => !(col.pk && col.datatype === 'JSON')) // Exclude primary keys
        .filter(
          (col) => !schema.parameters?.[table.name]?.cols?.[col.name]?.hidden,
        );

      // Generate properties for each column
      for (const col of createColumns) {
        const colName = camelCase(col.name);
        const colClass = upperFirst(camelCase(col.name));
        const isRequired = col.nn;
        const isPartial = false; // Create DTOs should have non-nullable fields as required
        // Check if column is a relationship
        const relationship = (table._relationships || []).find(
          (r) => r.childCol === col.name,
        );

        if (relationship) {
          // Handle relationship properties
          if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
            addImport(
              imports,
              './decorators',
              `Api${className}${colClass}Request`,
            );
            if (col.datatype === 'JSON') {
              // Handle child objects
              if (isRequired) {
                lines.push(
                  `  @Api${className}${colClass}Request({ required: ${!isPartial} })`,
                );
              } else {
                lines.push(`  @Api${className}${colClass}Request()`);
              }
              // If the default value is an object, use Record<string, T>
              if (col.defaultvalue === 'object()') {
                lines.push(
                  `  readonly ${camelCase(colClass)}${isRequired ? '' : '?'}: Record<string, ${relationship.parentClass}CreateRequest>;`,
                );
              } else {
                lines.push(
                  `  readonly ${camelCase(colClass)}${isRequired ? '' : '?'}: ${relationship.parentClass}CreateRequest[];`,
                );
              }
            } else {
              // Handle array of IDs
              if (isRequired) {
                lines.push(
                  `  @Api${className}${colClass}Request({ required: ${!isPartial} })`,
                );
              } else {
                lines.push(`  @Api${className}${colClass}Request()`);
              }
              if (col.defaultvalue === 'object()') {
                lines.push(
                  `  readonly ${camelCase(colClass)}${isRequired ? '' : '?'}: Record<string, ${relationship.parentClass}CreateRequest>;`,
                );
              } else {
                lines.push(
                  `  readonly ${camelCase(colClass)}${isRequired ? '' : '?'}: ${col.type || 'string'}[];`,
                );
              }
            }
          } else {
            addImport(
              imports,
              './decorators',
              `Api${className}${colClass}Request`,
            );
            if (col.datatype === 'JSON') {
              // Handle child object

              if (isRequired) {
                lines.push(
                  `  @Api${className}${colClass}Request({ required: ${!isPartial} })`,
                );
              } else {
                lines.push(`  @Api${className}${colClass}Request()`);
              }
              lines.push(
                `  readonly ${camelCase(colClass)}${isRequired ? '' : '?'}: ${relationship.parentClass}CreateRequest;`,
              );
            } else {
              addImport(
                imports,
                './decorators',
                `Api${className}${colClass}Request`,
              );
              // Handle reference ID
              if (isRequired) {
                lines.push(
                  `  @Api${className}${colClass}Request({ required: ${!isPartial} })`,
                );
              } else {
                lines.push(`  @Api${className}${colClass}Request()`);
              }
              lines.push(
                `  readonly ${camelCase(colClass)}${isRequired ? '' : '?'}: ${col.type || 'string'};`,
              );
            }
          }
        } else {
          // Regular property - use our custom decorator
          addImport(imports, './decorators', `Api${className}${colClass}`);
          if (isRequired) {
            lines.push(
              `  @Api${className}${colClass}({ required: ${!isPartial} })`,
            );
          } else {
            lines.push(`  @Api${className}${colClass}()`);
          }
          if (col.datatype === 'JSON' && col.enum) {
            lines.push(
              `  readonly ${colName}${isRequired ? '' : '?'}: ${col.type || 'string'}[];`,
            );
          } else {
            lines.push(
              `  readonly ${colName}${isRequired ? '' : '?'}: ${col.type || 'string'};`,
            );
          }
        }

        lines.push(``);
      }

      lines.push('}');
      lines.push('');

      // Build import statements
      const importLines = buildImportLines(imports);

      const createDto = `${importLines}\n${lines.join('\n')}`;

      const outputFile = path.join(
        outDir,
        kebabCase(name),
        'application',
        'dtos',
        `${kebabCase(name)}-create.dto.ts`,
      );

      if (schema.excluded?.includes(`${kebabCase(name)}-create.dto.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}-create.dto.ts as it is excluded.`,
        );
        continue;
      }

      await writeFileWithDir(outputFile, createDto, 'utf8');
      logger.success(`Created Create DTO: ${outputFile}`);
    } catch (error) {
      logger.error(
        `Error processing table ${name} for Create DTO: ${error.message}`,
      );
      // Continue with next table instead of stopping the whole process
    }
  }
};

/**
 * Generate Update DTOs from a schema
 * @param {Object} schema - The schema object
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generateUpdateDtos = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Update DTOs...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    // Skip if update DTO is disabled for this table
    if (schema.parameters?.[table.name]?.cancel?.update) {
      logger.debug(
        `Skipping Update DTO for table: ${table.name} (disabled in schema)`,
      );
      continue;
    }
    // if (table.cols.filter((col) => col.pk && col.datatype === 'JSON').length) {
    //   logger.info(
    //     `Skipping domain interface for table: ${table.name} (disabled in schema)`,
    //   );
    //   continue;
    // }
    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));

    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for Update DTO`,
    );

    try {
      // COMMON IMPORTS
      const imports = {
        '../../domain/properties': new Set([`Update${className}Props`]),
      };

      // Add enum imports
      Object.values(table._enums || {}).forEach((enumObj) => {
        addImport(imports, '../../domain/entities', enumObj.name);
      });

      // Add relationship imports
      table.cols
        .filter((col) => col.name !== 'tenant')
        .filter((col) => col.datatype === 'JSON')
        .filter((col) => !col.pk)
        .forEach((col) => {
          (table._relationships || [])
            .filter((relationship) => relationship.childCol === col.name)
            .forEach(({ parentClass }) => {
              addImport(
                imports,
                `../../../${kebabCase(parentClass)}/application/dtos`,
                `${parentClass}UpdateRequest`,
              );
            });
        });

      const lines = [
        ``,
        `/**`,
        ` * ${className} update request DTO`,
        ` */`,
        `export class ${className}UpdateRequest implements Update${className}Props {`,
      ];

      // For update DTOs, all fields are optional
      const isPartial = true;

      // Filter columns for update DTO (exclude tenant)
      const updateColumns = table.cols
        .filter((col) => col.name !== 'tenant')
        .filter((col) => !col.pk)
        .filter(
          (col) => !schema.parameters?.[table.name]?.cols?.[col.name]?.hidden,
        );

      // Generate properties for each column
      for (const col of updateColumns) {
        const colName = camelCase(col.name);
        const colClass = upperFirst(camelCase(col.name));

        // Check if column is a relationship
        const relationship = (table._relationships || []).find(
          (r) => r.childCol === col.name,
        );

        if (relationship) {
          // Handle relationship properties
          if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
            addImport(
              imports,
              './decorators',
              `Api${className}${colClass}Request`,
            );
            if (col.datatype === 'JSON') {
              // Handle child objects

              if (col.defaultvalue === 'object()') {
                lines.push(
                  `  @Api${className}${colClass}Request(${col.nn ? `{ required: false }` : ''})`,
                );
                lines.push(
                  `  readonly ${camelCase(colClass)}?: Record<string, ${relationship.parentClass}UpdateRequest>;`,
                );
              } else {
                lines.push(
                  `  @Api${className}${colClass}Request(${col.nn ? `{ required: false }` : ''})`,
                );
                lines.push(
                  `  readonly ${camelCase(colClass)}?: ${relationship.parentClass}UpdateRequest[];`,
                );
              }
            } else {
              // Handle array of IDs
              addImport(
                imports,
                './decorators',
                `Api${className}${colClass}Request`,
              );
              lines.push(
                `  @Api${className}${colClass}Request(${col.nn ? `{ required: false }` : ''})`,
              );
              if (col.defaultvalue === 'object()') {
                lines.push(
                  `  readonly ${camelCase(colClass)}?: Record<string, ${relationship.parentClass}UpdateRequest>;`,
                );
              } else {
                lines.push(
                  `  readonly ${camelCase(colClass)}?: ${col.type || 'string'}[];`,
                );
              }
            }
          } else if (
            relationship.c_p === 'one' &&
            relationship.c_ch === 'many'
          ) {
            addImport(
              imports,
              './decorators',
              `Api${className}${colClass}Request`,
            );
            if (col.datatype === 'JSON') {
              // Handle child object
              lines.push(
                `  @Api${className}${colClass}Request(${col.nn ? `{ required: false }` : ''})`,
              );
              lines.push(
                `  readonly ${camelCase(colClass)}?: ${relationship.parentClass}UpdateRequest;`,
              );
            } else {
              // Handle reference ID
              lines.push(
                `  @Api${className}${colClass}Request(${col.nn ? `{ required: false }` : ''})`,
              );
              lines.push(
                `  readonly ${camelCase(colClass)}?: ${col.type || 'string'};`,
              );
            }
          }
        } else {
          // Regular property
          addImport(imports, './decorators', `Api${className}${colClass}`);
          lines.push(
            `  @Api${className}${colClass}(${col.nn ? `{ required: false }` : ''})`,
          );
          if (col.datatype === 'JSON' && col.enum) {
            lines.push(`  readonly ${colName}?: ${col.type || 'string'}[];`);
          } else {
            lines.push(`  readonly ${colName}?: ${col.type || 'string'};`);
          }
        }

        lines.push(``);
      }

      lines.push('}');
      lines.push('');

      // Build import statements
      const importLines = buildImportLines(imports);

      const updateDto = `${importLines}\n${lines.join('\n')}`;

      const outputFile = path.join(
        outDir,
        kebabCase(name),
        'application',
        'dtos',
        `${kebabCase(name)}-update.dto.ts`,
      );
      if (schema.excluded?.includes(`${kebabCase(name)}-update.dto.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}-update.dto.ts as it is excluded.`,
        );
        continue;
      }
      await writeFileWithDir(outputFile, updateDto, 'utf8');
      logger.success(`Created Update DTO: ${outputFile}`);

      table.cols
        .filter((col) => col.name === 'status' && col.datatype === 'ENUM')
        .forEach(async () => {
          const lines = [];
          lines.push(
            `import { ${className}StatusEnum } from '../../domain/entities';`,
          );
          lines.push(`import { Api${className}Status } from './decorators';`);
          lines.push(``);
          lines.push(`export class ${className}StatusUpdateRequest {`);
          lines.push(`  @Api${className}Status()`);
          lines.push(`  status: ${className}StatusEnum;`);
          lines.push(`}`);
          lines.push(``);
          const statusOutputFile = path.join(
            outDir,
            kebabCase(name),
            'application',
            'dtos',
            `${kebabCase(name)}-status-update.dto.ts`,
          );
          if (
            schema.excluded?.includes(`${kebabCase(name)}-status-update.dto.ts`)
          ) {
            logger.info(
              `Skipping generation of ${kebabCase(name)}-status-update.dto.ts as it is excluded.`,
            );
            return;
          }
          await writeFileWithDir(statusOutputFile, lines.join('\n'), 'utf8');
        });
    } catch (error) {
      logger.error(
        `Error processing table ${name} for Update DTO: ${error.message}`,
      );
    }
  }
};

// Export the main entry point
module.exports = { create };
