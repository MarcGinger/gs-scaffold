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
 * Helper function to get column metadata from schema.dmm
 * @param {Object} schema - The schema object from schema.dmm
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column
 * @returns {Object} Object with comment (description) and data (example) or defaults
 */
function getColumnMetadata(schema, tableName, columnName) {
  // Find the table by name
  const table = Object.values(schema.tables || {}).find(
    (t) => t.name === tableName,
  );
  if (!table) {
    return { comment: '', data: '' };
  }

  // Find the column by name
  const column = table.cols?.find((c) => c.name === columnName);
  if (!column) {
    return { comment: '', data: '' };
  }

  return {
    comment: column.comment || '',
    data: column.data || '',
  };
}

/**
 * Main entry point to generate list DTOs from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info('Starting List DTO generation...');
  try {
    await generateListDtos(schema, finalConfig);
    logger.success('List DTO generation completed successfully');
  } catch (error) {
    logger.error(`Error during List DTO generation: ${error.message}`);
    throw error;
  }
};

/**
 * Generate List DTOs from a schema
 * @param {Object} schema - The schema object
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generateListDtos = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for List DTOs...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    // Only process tables with indexes for List DTOs
    if (!table.indexes?.length) {
      logger.debug(
        `Skipping table ${table.name} - no indexes found for filtering`,
      );
      continue;
    }
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(
        `Skipping table ${tableId} because it has a JSON column with a primary key.`,
      );
      continue;
    }
    tableIndex++;
    const name = table.name;
    const className = upperFirst(camelCase(name));
    const dir = path.resolve(outDir, kebabCase(name), 'application', 'dtos');
    logger.info(
      `Processing table ${tableIndex}/${tableCount}: ${name} for List DTOs`,
    );
    try {
      // Generate the entity-specific list decorators first
      await generateListDecorators(table, className, dir, schema);

      // COMMON IMPORTS
      const imports = {
        'src/shared/application/dtos': new Set([
          'ListMetaResponse',
          'ListOptionResponse',
        ]),
        '../../domain/properties': new Set([
          `List${className}Props`,
          `List${className}PropsOptions`,
          `List${className}OrderEnum`,
        ]),
      };

      // 2. Add enum imports
      Object.values(table._enums || {}).forEach((enumObj) => {
        addImport(imports, '../../domain/entities', enumObj.name);
      });

      // 3. Add relationship imports
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

      // Define ListResponse class
      const listResponseLines = generateListResponseClass(
        table,
        className,
        imports,
      );

      // Define ListRequest class
      const listRequestLines = generateListRequestClass(
        table,
        className,
        imports,
      );

      // Define PageResponse class
      const pageResponseLines = generatePageResponseClass(className, imports);

      // Combine all classes into a single file
      const lines = [
        ...listResponseLines,
        '',
        ...listRequestLines,
        '',
        ...pageResponseLines,
        '',
      ];

      // Build import statements
      // Generate import statements
      const importLines = buildImportLines(imports);

      const listDto = `${importLines}\n${lines.join('\n')}`;

      const outputFile = path.join(dir, `${kebabCase(name)}-list.dto.ts`);
      if (schema.excluded?.includes(`${kebabCase(name)}-list.dto.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}-list.dto.ts as it is excluded.`,
        );
        continue;
      }
      await writeFileWithDir(outputFile, listDto, 'utf8');
      logger.success(`Created List DTOs: ${outputFile}`);
    } catch (error) {
      logger.error(
        `Error processing table ${name} for List DTOs: ${error.message}`,
      );
      // Continue with next table instead of stopping the whole process
    }
  }
};

/**
 * Generate the ListResponse class for a table
 * @param {Object} table - The table definition
 * @param {string} className - The base class name
 * @param {Object} imports - The imports object to update
 * @returns {Array<string>} - Array of code lines
 */
function generateListResponseClass(table, className, imports) {
  const lines = [
    '',
    '/**',
    ` * ${className} list response DTO`,
    ' */',
    `export class ${className}ListResponse implements List${className}Props {`,
  ];

  // Filter columns for display
  const visibleColumns = table.cols
    .filter((col) => col.name !== 'tenant')
    .filter((col) => !table.parameters?.[table.name]?.cols?.[col.name]?.hidden)
    .filter(
      (col) =>
        !(
          col.pk === true &&
          col.datatype &&
          col.datatype.toUpperCase() === 'JSON'
        ),
    );
  const isPartial = false;

  // Generate properties for each column
  for (const col of visibleColumns) {
    const colName = camelCase(col.name);
    const colClass = upperFirst(camelCase(col.name));
    const isRequired = col.nn;

    // Check if column is a relationship
    const relationship = (table._relationships || []).find(
      (r) => r.childCol === col.name,
    );

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
      } else if (relationship.c_p === 'one' && relationship.c_ch === 'many') {
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
      addImport(imports, './decorators', `Api${className}${colClass}`);
      // Regular property - use our custom decorator
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

    lines.push('');
  }

  lines.push('}');

  return lines;
}

/**
 * Generate the ListRequest class for a table
 * @param {Object} table - The table definition
 * @param {string} className - The base class name
 * @returns {Array<string>} - Array of code lines
 */
function generateListRequestClass(table, className, imports) {
  const lines = [
    '/**',
    ` * ${className} list request DTO with filtering options`,
    ' * Based on table indexes for filterable fields',
    ' */',
    `export class ${className}ListRequest extends ListOptionResponse implements List${className}PropsOptions {`,
  ];

  // Process indexes to get the columns that can be used for filtering
  const indexes = table.indexes || [];
  const idxCols = indexes
    .flatMap((idx) => idx.cols.map((c) => c.colid))
    .filter((v, i, a) => a.indexOf(v) === i) // Deduplicate
    .map((id) => table.cols.find((c) => c.id === id))
    .filter(Boolean);

  // Generate filter properties based on index columns
  for (const col of idxCols.filter((col) => col.name !== 'tenant')) {
    const colName = camelCase(col.name);
    const colClass = upperFirst(camelCase(col.name));

    addImport(imports, './decorators', `Api${className}${colClass}`);
    // For list requests, all filters are optional
    if (col.nn) {
      lines.push(`  @Api${className}${colClass}({required: false})`);
    } else {
      lines.push(`  @Api${className}${colClass}()`);
    }

    // All filter properties are optional
    lines.push(`  readonly ${colName}?: ${col.type || 'string'};`);
    lines.push('');
  }
  // Add orderBy property using custom decorator
  addImport(imports, './decorators', `Api${className}ListOrderBy`);
  lines.push(
    `  @Api${className}ListOrderBy()`,
    `  readonly orderBy?: List${className}OrderEnum;`,
  );

  lines.push('}');

  return lines;
}

/**
 * Generate the PageResponse class for paginated results
 * @param {string} className - The base class name
 * @returns {Array<string>} - Array of code lines
 */
function generatePageResponseClass(className, imports) {
  addImport(imports, './decorators', `Api${className}List`);
  addImport(imports, './decorators', `Api${className}ListMeta`);
  return [
    '/**',
    ` * ${className} page response DTO with metadata for pagination`,
    ' */',
    `export class ${className}PageResponse {`,
    `  @Api${className}List(${className}ListResponse)`,
    `  readonly data: ${className}ListResponse[];`,
    '',
    `  @Api${className}ListMeta()`,
    `  readonly meta: ListMetaResponse;`,
    '}',
  ];
}

/**
 * Generate entity-specific list decorators for a table
 * @param {Object} table - The table definition
 * @param {string} className - The base class name
 * @param {string} outputPath - The path to write the decorator file
 * @param {Object} schema - The schema object for metadata
 * @returns {Promise<void>}
 */
async function generateListDecorators(table, className, outputPath, schema) {
  const kebabName = kebabCase(table.name);

  // Generate OrderBy decorator
  await generateOrderByDecorator(table, className, outputPath, kebabName);

  // Generate List decorator
  await generateListDecorator(table, className, outputPath, kebabName, schema);

  // Generate ListMeta decorator
  await generateListMetaDecorator(table, className, outputPath, kebabName);
}

/**
 * Generate OrderBy decorator file
 */
async function generateOrderByDecorator(
  table,
  className,
  outputPath,
  kebabName,
) {
  const imports = {
    '@nestjs/common': new Set(['applyDecorators']),
    '@nestjs/swagger': new Set(['ApiProperty']),
    'class-validator': new Set(['IsEnum', 'IsOptional']),
    '../../../domain/properties': new Set([`List${className}OrderEnum`]),
  };

  const lines = [
    '',
    '/**',
    ` * Property decorator for OrderBy field in ${className} list requests`,
    ' * @returns PropertyDecorator',
    ' */',
    `export function Api${className}ListOrderBy() {`,
    '  return applyDecorators(',
    '    ApiProperty({',
    `      enum: List${className}OrderEnum,`,
    '      required: false,',
    "      description: 'Order by field',",
    '    }),',
    `    IsEnum(List${className}OrderEnum),`,
    '    IsOptional(),',
    '  );',
    '}',
  ];

  const importTs = Object.entries(imports)
    .map(([key, value]) => {
      if (value.size) {
        return `import { ${Array.from(value).sort().join(', ')} } from '${key}';`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  const decoratorContent = `${importTs}\n${lines.join('\n')}`;
  const decoratorFilePath = path.join(
    outputPath,
    'decorators',
    `${kebabName}-list-order-by.decorator.ts`,
  );

  if (schema.excluded?.includes(`${kebabName}-list-order-by.decorator.ts`)) {
    logger.info(
      `Skipping generation of ${kebabName}-list-order-by.decorator.ts as it is excluded.`,
    );
    return;
  }

  try {
    await writeFileWithDir(decoratorFilePath, decoratorContent, 'utf8');
    logger.success(`Created OrderBy decorator: ${decoratorFilePath}`);
  } catch (error) {
    logger.error(
      `Error writing OrderBy decorator for ${className}: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Generate List decorator file
 */
async function generateListDecorator(
  table,
  className,
  outputPath,
  kebabName,
  schema,
) {
  const imports = {
    '@nestjs/common': new Set(['applyDecorators']),
    '@nestjs/swagger': new Set(['ApiProperty', 'ApiExtraModels']),
    'class-validator': new Set(['IsArray', 'ValidateNested']),
    'class-transformer': new Set(['Type']),
  };

  // Generate a realistic example based on the first few columns
  const exampleColumns = table.cols
    .filter((col) => col.name !== 'tenant')
    .filter((col) => !table.parameters?.[table.name]?.cols?.[col.name]?.hidden);
  // .slice(0, 5); // Take first 5 visible columns for example

  const exampleObject = {};
  exampleColumns.forEach((col) => {
    const colName = camelCase(col.name);
    const metadata = getColumnMetadata(schema, table.name, col.name);

    // Use column data from schema if available
    if (metadata.data) {
      try {
        // Try to parse as JSON first for complex types
        const parsedData = JSON.parse(metadata.data);
        exampleObject[colName] = parsedData;
      } catch {
        // If not JSON, handle different data types
        switch (col.type) {
          case 'number':
            exampleObject[colName] = parseInt(metadata.data) || 1001;
            break;
          case 'boolean':
            exampleObject[colName] = metadata.data.toLowerCase() === 'true';
            break;
          default:
            exampleObject[colName] = metadata.data;
        }
      }
    } else {
      // Generate default example based on column type
      switch (col.type) {
        case 'number':
          exampleObject[colName] = 1001;
          break;
        case 'boolean':
          exampleObject[colName] = true;
          break;
        default:
          exampleObject[colName] = `Sample ${colName}`;
      }
    }
  });

  const lines = [
    '',
    '/**',
    ` * Property decorator for data array in ${className} page responses`,
    ' * @param responseType - The response type class to use for validation and Swagger',
    ' * @returns PropertyDecorator',
    ' */',
    `export function Api${className}List(responseType?: any) {`,
    '  const decorators = [',
    '    ApiProperty({',
    '      type: responseType || Object,',
    '      isArray: true,',
    `      description: 'Array of ${className.toLowerCase()} list items',`,
    // `      example: [${JSON.stringify(exampleObject, null, 8).replace(/\n/g, '\n        ')}],`,
    '    }),',
    '    IsArray(),',
    '  ];',
    '',
    '  // Only add nested validation and type transformation if responseType is defined',
    '  if (responseType) {',
    '    decorators.push(ApiExtraModels(responseType));',
    '    decorators.push(Type(() => responseType));',
    '    decorators.push(ValidateNested({ each: true }));',
    '  }',
    '',
    '  return applyDecorators(...decorators);',
    '}',
  ];

  const importTs = Object.entries(imports)
    .map(([key, value]) => {
      if (value.size) {
        return `import { ${Array.from(value).sort().join(', ')} } from '${key}';`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  const decoratorContent = `${importTs}\n${lines.join('\n')}`;
  const decoratorFilePath = path.join(
    outputPath,
    'decorators',
    `${kebabName}-list.decorator.ts`,
  );

  if (schema.excluded?.includes(`${kebabName}-list.decorator.ts`)) {
    logger.info(
      `Skipping generation of ${kebabName}-list.decorator.ts as it is excluded.`,
    );
    return;
  }

  try {
    await writeFileWithDir(decoratorFilePath, decoratorContent, true);
    logger.success(`Created List decorator: ${decoratorFilePath}`);
  } catch (error) {
    logger.error(
      `Error writing List decorator for ${className}: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Generate ListMeta decorator file
 */
async function generateListMetaDecorator(
  table,
  className,
  outputPath,
  kebabName,
) {
  const imports = {
    '@nestjs/common': new Set(['applyDecorators']),
    '@nestjs/swagger': new Set(['ApiProperty']),
    'class-transformer': new Set(['Type']),
    'src/shared/application/dtos': new Set(['ListMetaResponse']),
  };

  const lines = [
    '',
    '/**',
    ` * Property decorator for meta information in ${className} page responses`,
    ' * @returns PropertyDecorator',
    ' */',
    `export function Api${className}ListMeta() {`,
    '  return applyDecorators(',
    '    ApiProperty({',
    '      type: () => ListMetaResponse,',
    '    }),',
    '    Type(() => ListMetaResponse),',
    '  );',
    '}',
  ];

  const importTs = Object.entries(imports)
    .map(([key, value]) => {
      if (value.size) {
        return `import { ${Array.from(value).sort().join(', ')} } from '${key}';`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  const decoratorContent = `${importTs}\n${lines.join('\n')}`;
  const decoratorFilePath = path.join(
    outputPath,
    'decorators',
    `${kebabName}-list-meta.decorator.ts`,
  );

  if (schema.excluded?.includes(`${kebabName}-list-meta.decorator.ts`)) {
    logger.info(
      `Skipping generation of ${kebabName}-list-meta.decorator.ts as it is excluded.`,
    );
    return;
  }

  try {
    await writeFileWithDir(decoratorFilePath, decoratorContent, 'utf8');
    logger.success(`Created ListMeta decorator: ${decoratorFilePath}`);
  } catch (error) {
    logger.error(
      `Error writing ListMeta decorator for ${className}: ${error.message}`,
    );
    throw error;
  }
}

// Export the main entry point
module.exports = { create };
