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
 * Main entry point to generate response DTOs from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info('Starting Response DTO generation...');
  try {
    await generateResponseDtos(schema, finalConfig);
    logger.success('Response DTO generation completed successfully');
  } catch (error) {
    logger.error(`Error during Response DTO generation: ${error.message}`);
    throw error;
  }
};

/**
 * Generate Response DTOs from a schema
 * @param {Object} schema - The schema object
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generateResponseDtos = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for Response DTOs...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));

    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for Response DTO`,
    );

    try {
      // COMMON IMPORTS
      const imports = {
        '../../domain': new Set([`I${className}`]),
      };

      // 2. Add enum imports
      Object.values(table._enums || {}).forEach((enumObj) => {
        addImport(imports, '../../domain', enumObj.name);
      });

      // 4. Add relationship imports
      table.cols
        .filter((col) => col.name !== 'tenant')
        .forEach((col) => {
          (table._relationships || [])
            .filter((relationship) => relationship.childCol === col.name)
            .forEach(({ parentClass }) => {
              addImport(
                imports,
                `../../../${kebabCase(parentClass)}/application/dtos`,
                `${parentClass}Response`,
              );
            });
        });

      const lines = [
        ``,
        `/**`,
        ` * ${className} response DTO`,
        ` */`,
        `export class ${className}Response implements I${className} {`,
      ];

      // Filter columns for display
      const visibleColumns = table.cols
        .filter((col) => col.name !== 'tenant')
        .filter(
          (col) => !schema.parameters?.[table.name]?.cols?.[col.name]?.hidden,
        )
        .filter(
          (col) =>
            !(
              col.pk === true &&
              col.datatype &&
              col.datatype.toUpperCase() === 'JSON'
            ),
        );

      // Generate properties for each column
      for (const col of visibleColumns) {
        const colName = camelCase(col.name);
        const colClass = upperFirst(camelCase(col.name));

        // Check if column is a relationship
        const relationship = (table._relationships || []).find(
          (r) => r.childCol === col.name,
        );
        const isRequired = col.nn;
        const isPartial = false;
        if (relationship) {
          // Handle relationship properties
          if (relationship.c_p === 'many' && relationship.c_ch === 'many') {
            addImport(imports, './decorators', `Api${className}${colClass}`);
            // Use custom decorator for many-to-many
            if (isRequired) {
              lines.push(
                `  @Api${className}${colClass}({ required: ${!isPartial} })`,
              );
              if (col.defaultvalue === 'object()') {
                lines.push(
                  `  readonly ${camelCase(colClass)}${isPartial ? '?' : ''}: Record<string, ${relationship.parentClass}Response>;`,
                );
              } else {
                lines.push(
                  `  readonly ${camelCase(colClass)}${isPartial ? '?' : ''}: ${relationship.parentClass}Response[];`,
                );
              }
            } else {
              addImport(imports, './decorators', `Api${className}${colClass}`);
              lines.push(`  @Api${className}${colClass}()`);
              if (col.defaultvalue === 'object()') {
                lines.push(
                  `  readonly ${camelCase(colClass)}?: Record<string, ${relationship.parentClass}Response>;`,
                );
              } else {
                lines.push(
                  `  readonly ${camelCase(colClass)}?: ${relationship.parentClass}Response[];`,
                );
              }
            }
          } else if (
            relationship.c_p === 'one' &&
            relationship.c_ch === 'many'
          ) {
            addImport(imports, './decorators', `Api${className}${colClass}`);
            // Use custom decorator for one-to-many
            if (isRequired) {
              lines.push(
                `  @Api${className}${colClass}({ required: ${!isPartial} })`,
              );
              lines.push(
                `  readonly ${camelCase(colClass)}${isPartial ? '?' : ''}: ${relationship.parentClass}Response;`,
              );
            } else {
              lines.push(`  @Api${className}${colClass}()`);
              lines.push(
                `  readonly ${camelCase(colClass)}?: ${relationship.parentClass}Response;`,
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
              `  readonly ${colName}${isRequired && !isPartial ? '' : '?'}: ${col.type || 'string'}[];`,
            );
          } else {
            lines.push(
              `  readonly ${colName}${isRequired && !isPartial ? '' : '?'}: ${col.type || 'string'};`,
            );
          }
        }

        lines.push(``);
      }

      lines.push('}');
      lines.push('');

      // Build import statements
      const importLines = buildImportLines(imports);

      const responseDto = `${importLines}\n${lines.join('\n')}`;

      const outputFile = path.join(
        outDir,
        kebabCase(name),
        'application',
        'dtos',
        `${kebabCase(name)}.dto.ts`,
      );

      if (schema.excluded?.includes(`${kebabCase(name)}.dto.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}.dto.ts as it is excluded.`,
        );
        return;
      }

      await writeFileWithDir(outputFile, responseDto);
      logger.success(`Created Response DTO: ${outputFile}`);
    } catch (error) {
      logger.error(
        `Error processing table ${name} for Response DTO: ${error.message}`,
      );
      // Continue with next table instead of stopping the whole process
    }
  }
};

// Export the main entry point
module.exports = { create };
