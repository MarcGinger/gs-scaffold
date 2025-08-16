const path = require('path');
const {
  writeFileWithDir,
  createIndexFilesFromDirectory,
} = require('../utils/file-utils');

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
const {
  buildImportLines,
  shouldSkipTable,
} = require('../utils/generator-utils');

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
 * Main entry point to generate DTOs from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info('Starting DTO generation...');
  try {
    await dtos(schema, finalConfig);
    logger.success('DTO generation completed successfully');
  } catch (error) {
    logger.error(`Error during DTO generation: ${error.message}`);
    throw error;
  }
};

// Replace per-column DTO generator with per-table decorators generator
const fs = require('fs');

// Main generator for all tables: emits a decorators file per table
async function generateDecoratorsForTable(table, schema, outDir) {
  // Collect imports and decorator blocks
  // Ensure no redeclaration by using var (function-scoped) instead of let/const
  var usedValidators = new Set();
  var usedTransformers = new Set();
  var imports = new Set();
  // Always needed
  addImport(imports, '@nestjs/common', 'applyDecorators');
  addImport(imports, '@nestjs/swagger', 'ApiProperty');
  var propOptionsNeeded = false;
  // Instead of a single decorators file, we will emit one file per decorator
  var decoratorFiles = [];

  // --- Relationship Request Decorators ---
  // For each relationship, emit a Request decorator that returns a primitive (string/number/array) with required/optional
  if (Array.isArray(table._relationships)) {
    for (const rel of table._relationships) {
      // Only generate if not already handled as a primitive column
      const col = table.cols.find((c) => c.name === rel.childCol);
      if (!col) continue;

      // Get metadata from schema.dmm
      const columnMetadata = getColumnMetadata(schema, table.name, col.name);
      // Escape backticks in description to avoid breaking template literals
      let safeDescription = columnMetadata.comment.replace(/`/g, '\\`');
      let exampleValue = columnMetadata.data;

      // Default primitive request
      let reqType = 'string';
      let validator = 'IsString()';
      let typeVal = 'String';
      if (col.datatype) {
        switch (col.datatype.toUpperCase()) {
          case 'INT':
          case 'DECIMAL':
          case 'BIGINT':
          case 'FLOAT':
          case 'REAL':
          case 'DOUBLE':
            reqType = 'number';
            validator = 'IsNumber()';
            typeVal = 'Number';
            usedValidators.add('IsNumber');
            break;
          case 'BOOLEAN':
            reqType = 'boolean';
            validator = 'IsBoolean()';
            typeVal = 'Boolean';
            usedValidators.add('IsBoolean');
            break;
          default:
            reqType = 'string';
            validator = 'IsString()';
            typeVal = 'String';
            usedValidators.add('IsString');
        }
      }

      // Decorator name (must be before any continue)
      var reqFnName = `Api${upperFirst(camelCase(table.name))}${upperFirst(camelCase(rel.childCol))}Request`;

      // If the column is a complex type (JSON/JSONB), emit a complex object/array request decorator
      if (
        col.datatype &&
        ['JSON', 'JSONB'].includes(col.datatype.toUpperCase())
      ) {
        // JSDoc
        let reqDoc = [
          '/**',
          ` * Request property decorator for ${upperFirst(camelCase(rel.childCol))} (object/array)`,
          ' * @param {Object} options - Options for the decorator',
          ' * @returns {PropertyDecorator}',
          ' */',
        ];
        // Use the related update DTO type if available
        let relatedType = rel.parentClass
          ? `${rel.parentClass}UpdateRequest`
          : 'object';
        let isArray = false;
        let isRecord = false;
        // Check for many-to-many shape
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          if (col.defaultvalue === 'object()') {
            isRecord = true;
          } else {
            isArray = true;
          }
        }

        // Special handling for many-to-many record/object relationships (e.g., Rail/Rules)
        if (isRecord && relatedType !== 'object') {
          // Imports needed for this pattern

          addImport(imports, '@nestjs/common', 'getSchemaPath');
          addImport(imports, '@nestjs/swagger', ['getSchemaPath']);
          addImport(imports, 'class-transformer', ['Transform']);
          addImport(imports, 'class-validator', ['ValidateNested']);
          addImport(
            imports,
            'src/shared/application/dtos',
            'transformAndValidateRecord',
          );
          addImport(
            imports,
            `../../../../${kebabCase(rel.parentClass)}/application/dtos`,
            `${rel.parentClass}UpdateRequest`,
          );
          // Decorator function
          let reqLines = [];
          reqLines.push(
            `export function ${reqFnName}(options: PropOptions = {}) {`,
          );
          reqLines.push(`  const { required = true } = options;`);
          reqLines.push('  return applyDecorators(');
          reqLines.push('    ApiProperty({');
          reqLines.push(`      description: \`${safeDescription}\`,`);
          reqLines.push(`      type: 'object',`);
          reqLines.push(
            `      additionalProperties: { $ref: getSchemaPath(${rel.parentClass}UpdateRequest) },`,
          );
          reqLines.push('      required: [],');
          reqLines.push('    }),');
          reqLines.push(
            `    Transform(({ value }) => transformAndValidateRecord(value, ${rel.parentClass}UpdateRequest)),`,
          );
          reqLines.push('    ValidateNested({ each: true }),');
          reqLines.push('    IsObject(),');
          reqLines.push('    required ? IsNotEmpty() : IsOptional(),');
          reqLines.push('  );');
          reqLines.push('}');
          reqLines.push('');
          // Write this decorator to its own file
          const fileName = `${kebabCase(col.name)}-request.decorator.ts`;
          const filePath = path.join(
            outDir,
            kebabCase(table.name),
            'application',
            'dtos',
            'decorators',
            fileName,
          );
          // Collect imports for this decorator
          let localImports = new Set();
          addImport(localImports, '@nestjs/common', 'applyDecorators');
          addImport(localImports, '@nestjs/swagger', 'ApiProperty');
          addImport(localImports, '@nestjs/swagger', ['getSchemaPath']);
          addImport(localImports, 'class-transformer', ['Transform']);
          addImport(localImports, 'class-validator', ['ValidateNested']);
          addImport(localImports, 'class-validator', ['IsObject']);
          addImport(localImports, 'class-validator', ['IsNotEmpty']);
          addImport(localImports, 'class-validator', ['IsOptional']);
          addImport(
            localImports,
            'src/shared/application/dtos',
            'transformAndValidateRecord',
          );
          addImport(
            localImports,
            `../../../../${kebabCase(rel.parentClass)}/application/dtos`,
            `${rel.parentClass}UpdateRequest`,
          );
          // PropOptions interface
          let propOptionsInterface = `/**\n * Options for property decorators\n */\ninterface PropOptions {\n  required?: boolean;\n}\n`;
          // Compose imports
          const importLines = buildImportLines(localImports);
          const fileContent = `${importLines}\n\n${propOptionsInterface}${reqDoc.join('\n')}\n${reqLines.join('\n')}`;
          decoratorFiles.push({ filePath, fileContent });
          usedValidators.add('IsObject');
          usedValidators.add('IsNotEmpty');
          usedValidators.add('IsOptional');
          propOptionsNeeded = true;
          continue;
        } else {
          if (relatedType !== 'object') {
            addImport(
              imports,
              `../../../../${kebabCase(rel.parentClass)}/application/dtos`,
              `${rel.parentClass}UpdateRequest`,
            );
          }
          let reqLines = [];
          reqLines.push(
            `export function ${reqFnName}(options: PropOptions = {}) {`,
          );
          reqLines.push(`  const { required = true } = options;`);
          reqLines.push('  return applyDecorators(');
          reqLines.push('    ApiProperty({');
          reqLines.push(`      description: \`${safeDescription}\`,`);
          // if (exampleValue) {
          //   reqLines.push(`      example: ${JSON.stringify(exampleValue)},`);
          // }
          if (isArray) {
            reqLines.push(`      type: () => ${relatedType},`);
          } else if (isRecord) {
            reqLines.push(`      type: Object,`);
          } else {
            reqLines.push(`      type: () => ${relatedType},`);
          }
          reqLines.push('      required,');
          reqLines.push('    }),');
          if (isArray) {
            reqLines.push('    IsArray(),');
            usedValidators.add('IsArray');
          } else {
            reqLines.push('    IsObject(),');
            usedValidators.add('IsObject');
          }
          reqLines.push('    required ? IsNotEmpty() : IsOptional(),');
          reqLines.push('  );');
          reqLines.push('}');
          reqLines.push('');
          // Write this decorator to its own file
          const decoratorName = reqFnName;
          const fileName = `${kebabCase(col.name)}-request.decorator.ts`;
          const filePath = path.join(
            outDir,
            kebabCase(table.name),
            'application',
            'dtos',
            'decorators',
            fileName,
          );
          let localImports = new Set();
          addImport(localImports, '@nestjs/common', 'applyDecorators');
          addImport(localImports, '@nestjs/swagger', 'ApiProperty');
          if (isArray) addImport(localImports, 'class-validator', ['IsArray']);
          else addImport(localImports, 'class-validator', ['IsObject']);
          addImport(localImports, 'class-validator', ['IsNotEmpty']);
          addImport(localImports, 'class-validator', ['IsOptional']);
          if (relatedType !== 'object') {
            addImport(
              localImports,
              `../../../../${kebabCase(rel.parentClass)}/application/dtos`,
              `${rel.parentClass}UpdateRequest`,
            );
          }
          let propOptionsInterface = `/**\n * Options for property decorators\n */\ninterface PropOptions {\n  required?: boolean;\n}\n`;
          const importLines = buildImportLines(localImports);
          const fileContent = `${importLines}\n\n${propOptionsInterface}${reqDoc.join('\n')}\n${reqLines.join('\n')}`;
          decoratorFiles.push({ filePath, fileContent });
          usedValidators.add(isArray ? 'IsArray' : 'IsObject');
          usedValidators.add('IsNotEmpty');
          usedValidators.add('IsOptional');
          propOptionsNeeded = true;
          continue;
        }
      }
      // Many-to-many primitive array request for all many-to-many relationships
      if (rel.c_p === 'many' && rel.c_ch === 'many') {
        // Request decorator (primitive array)
        let reqDoc = [
          '/**',
          ` * Request property decorator for ${upperFirst(camelCase(rel.childCol))} (primitive array)`,
          ' * @param {Object} options - Options for the decorator',
          ' * @returns {PropertyDecorator}',
          ' */',
        ];
        let reqLines = [];
        reqLines.push(
          `export function ${reqFnName}(options: PropOptions = {}) {`,
        );
        reqLines.push(`  const { required = true } = options;`);
        reqLines.push('  return applyDecorators(');
        reqLines.push('    ApiProperty({');
        reqLines.push(`      description: \`${safeDescription}\`,`);
        if (exampleValue) {
          reqLines.push(`      example: [${JSON.stringify(exampleValue)}],`);
        }
        // Use number[] for INT/DECIMAL/BIGINT/FLOAT/REAL/DOUBLE, string[] for others
        let typeVal = 'String';
        let validator = 'IsString()';
        if (col.datatype) {
          switch (col.datatype.toUpperCase()) {
            case 'INT':
            case 'DECIMAL':
            case 'BIGINT':
            case 'FLOAT':
            case 'REAL':
            case 'DOUBLE':
              typeVal = 'Number';
              validator = 'IsNumber()';
              usedValidators.add('IsNumber');
              break;
            case 'BOOLEAN':
              typeVal = 'Boolean';
              validator = 'IsBoolean()';
              usedValidators.add('IsBoolean');
              break;
            default:
              typeVal = 'String';
              validator = 'IsString()';
              usedValidators.add('IsString');
          }
        }
        reqLines.push(`      type: ${typeVal},`);
        reqLines.push('      isArray: true,');
        reqLines.push('      required,');
        reqLines.push('    }),');
        // reqLines.push(`    ${validator},`);
        reqLines.push('    IsArray(),');
        reqLines.push('    required ? IsNotEmpty() : IsOptional(),');
        reqLines.push('  );');
        reqLines.push('}');
        reqLines.push('');
        // Write this decorator to its own file
        const decoratorName = reqFnName;
        const fileName = `${kebabCase(col.name)}-request.decorator.ts`;
        const filePath = path.join(
          outDir,
          kebabCase(table.name),
          'application',
          'dtos',
          'decorators',
          fileName,
        );
        let localImports = new Set();
        addImport(localImports, '@nestjs/common', 'applyDecorators');
        addImport(localImports, '@nestjs/swagger', 'ApiProperty');
        addImport(localImports, 'class-validator', ['IsArray']);
        addImport(localImports, 'class-validator', ['IsNotEmpty']);
        addImport(localImports, 'class-validator', ['IsOptional']);
        let propOptionsInterface = `/**\n * Options for property decorators\n */\ninterface PropOptions {\n  required?: boolean;\n}\n`;
        const importLines = buildImportLines(localImports);
        const fileContent = `${importLines}\n\n${propOptionsInterface}${reqDoc.join('\n')}\n${reqLines.join('\n')}`;
        decoratorFiles.push({ filePath, fileContent });
        usedValidators.add('IsArray');
        usedValidators.add('IsNotEmpty');
        usedValidators.add('IsOptional');
        propOptionsNeeded = true;
        continue;
      }

      // JSDoc
      let reqDoc = [
        '/**',
        ` * Request property decorator for ${upperFirst(camelCase(rel.childCol))}`,
        ' * @param {Object} options - Options for the decorator xxxx',
        ' * @returns {PropertyDecorator}',
        ' */',
      ];
      // Function
      let reqLines = [];
      reqLines.push(
        `export function ${reqFnName}(options: PropOptions = {}) {`,
      );
      reqLines.push(`  const { required = true } = options;`);
      reqLines.push('  return applyDecorators(');
      reqLines.push(`    ApiProperty({`);
      reqLines.push(`      description: \`${safeDescription}\`,`);
      if (exampleValue) {
        reqLines.push(`      example: ${JSON.stringify(exampleValue)},`);
      }
      reqLines.push(`      type: ${typeVal},`);
      reqLines.push('      required,');
      reqLines.push('    }),');
      reqLines.push(`    ${validator},`);
      reqLines.push('    required ? IsNotEmpty() : IsOptional(),');
      reqLines.push('  );');
      reqLines.push('}');
      reqLines.push('');
      // Add to blocks
      // Write this decorator to its own file
      const decoratorName = reqFnName;
      const fileName = `${kebabCase(col.name)}-request.decorator.ts`;
      const filePath = path.join(
        outDir,
        kebabCase(table.name),
        'application',
        'dtos',
        'decorators',
        fileName,
      );
      let localImports = new Set();
      addImport(localImports, '@nestjs/common', 'applyDecorators');
      addImport(localImports, '@nestjs/swagger', 'ApiProperty');
      addImport(localImports, 'class-validator', [
        validator.replace(/\(\)/g, ''),
      ]);
      addImport(localImports, 'class-validator', ['IsNotEmpty']);
      addImport(localImports, 'class-validator', ['IsOptional']);
      let propOptionsInterface = `/**\n * Options for property decorators\n */\ninterface PropOptions {\n  required?: boolean;\n}\n`;
      const importLines = buildImportLines(localImports);
      const fileContent = `${importLines}\n\n${propOptionsInterface}${reqDoc.join('\n')}\n${reqLines.join('\n')}`;
      decoratorFiles.push({ filePath, fileContent });
      usedValidators.add(validator.replace(/\(\)/g, ''));
      usedValidators.add('IsNotEmpty');
      usedValidators.add('IsOptional');
      propOptionsNeeded = true;
    }
  }
  const className = upperFirst(camelCase(table.name));
  const decoratorsDir = path.join(
    outDir,
    kebabCase(table.name),
    'application',
    'dtos',
    'decorators',
  );

  for (const col of table.cols) {
    // Skip primary keys and JSON columns
    if (
      col.pk &&
      col.datatype &&
      ['JSON', 'JSONB'].includes(col.datatype.toUpperCase())
    ) {
      continue;
    }
    const colClass = upperFirst(camelCase(col.name));
    const required = col.nn ? true : false;
    let tsType = 'string';
    let validators = [];
    let apiType = 'String';
    let apiFormat = undefined;
    let apiEnum = undefined;
    let maxLength = undefined;
    let description = col.comment || '';
    let isEnum = false;
    let enumType = undefined;
    let isArray = false;
    let isObject = false;
    let isRelation = false;
    let relationType = undefined;
    let relationImport = undefined;
    let apiTypeExpr = undefined;
    let addTypeDecorator = false;

    // Get metadata from schema.dmm for this column
    const columnMetadata = getColumnMetadata(schema, table.name, col.name);
    // Escape backticks in description to avoid breaking template literals
    let safeDescription = columnMetadata.comment.replace(/`/g, '\\`');
    let exampleValue = columnMetadata.data;

    // Relationship detection
    const rel = (table._relationships || []).find(
      (r) => r.childCol === col.name,
    );
    if (rel) {
      isRelation = true;
      relationType = `${rel.parentClass}Response`;
      // Compute import path (assume same structure as product-decorators)
      addImport(
        imports,
        `../../../../${kebabCase(rel.parentClass)}/application/dtos`,
        relationType,
      );
      // If many-to-many, set as array type
      if (rel.c_p === 'many' && rel.c_ch === 'many') {
        apiTypeExpr = `() => ${relationType}`;
        addTypeDecorator = true;
        isArray = true;
        usedTransformers.add('Type');
      } else {
        apiTypeExpr = `() => ${relationType}`;
        addTypeDecorator = true;
        isObject = true;
        usedTransformers.add('Type');
      }
    }

    switch ((col.datatype || '').toUpperCase()) {
      case 'INT':
      case 'DECIMAL':
      case 'BIGINT':
      case 'FLOAT':
      case 'REAL':
      case 'DOUBLE':
        tsType = 'number';
        validators.push('IsNumber()');
        usedValidators.add('IsNumber');
        apiType = 'Number';
        break;
      case 'BOOLEAN':
        tsType = 'boolean';
        validators.push('IsBoolean()');
        usedValidators.add('IsBoolean');
        apiType = 'Boolean';
        break;
      case 'DATE':
      case 'DATETIME':
      case 'TIMESTAMP':
        tsType = 'Date';
        apiType = 'String';
        apiFormat = 'date-time';
        break;
      case 'ENUM':
        isEnum = true;
        enumType = className + upperFirst(camelCase(col.name)) + 'Enum';

        if (enumType) {
          apiEnum = enumType;
          validators.push(`IsEnum(${enumType})`);
          usedValidators.add('IsEnum');
          // Add enum import to global imports (for reference, not used in per-decorator files)
          addImport(imports, `../../../domain/entities`, enumType);
        }

        break;
      case 'JSON':
      case 'JSONB':
        tsType = 'Record<string, any>';
        isObject = true;
        validators.push('IsObject()');
        usedValidators.add('IsObject');
        break;
      default:
        tsType = 'string';
        validators.push('IsString()');
        usedValidators.add('IsString');
        apiType = 'String';
        if (col.param && !isObject && !isArray) {
          maxLength = Number(col.param);
          validators.push(`MaxLength(${col.param})`);
          usedValidators.add('MaxLength');
        }
    }
    // ...existing code...

    // Decorator function signature
    let fnHeader = `export function Api${className}${colClass}(options: PropOptions = {}) {`;
    if (!required) fnHeader = `export function Api${className}${colClass}() {`;
    if (required) propOptionsNeeded = true;

    // ApiProperty options
    let apiPropOpts = [`description: \`${safeDescription}\``];
    if (exampleValue) {
      if (!(isRelation && apiTypeExpr)) {
        apiPropOpts.push(`example: ${JSON.stringify(exampleValue)}`);
      }
    }
    if (isRelation && apiTypeExpr) {
      apiPropOpts.push(`type: ${apiTypeExpr}`);
      if (isArray) {
        apiPropOpts.push('isArray: true');
      }
    } else if (apiType) {
      apiPropOpts.push(`type: ${apiType}`);
    }
    if (apiFormat) apiPropOpts.push(`format: '${apiFormat}'`);
    if (apiEnum) apiPropOpts.push(`enum: ${apiEnum}`);

    if (maxLength) apiPropOpts.push(`maxLength: ${maxLength}`);
    if (required) {
      apiPropOpts.push(`required`); // will use the variable
    } else {
      apiPropOpts.push(`required: false`);
    }

    // Decorator body
    let lines = [];

    lines.push(`/**`);
    if (required) {
      lines.push(
        ` * Property decorator for ${colClass}${required ? ' with required option' : ''}`,
      );
      lines.push(` * @param {Object} options - Options for the decorator`);
    } else {
      lines.push(
        ` * Property decorator for ${colClass}${required ? ' with required option' : ''}`,
      );
    }
    lines.push(` * @returns {PropertyDecorator}`);
    lines.push(` */`);
    lines.push(fnHeader);
    if (required) lines.push(`  const { required = true } = options;`);

    // If this is a many-to-many record/object relationship (like Rail/Rules main property), emit the same logic as the Request
    if (
      isRelation &&
      isArray &&
      col.datatype &&
      ['JSON', 'JSONB'].includes(col.datatype.toUpperCase()) &&
      table._relationships &&
      table._relationships.some(
        (r) =>
          r.childCol === col.name &&
          r.c_p === 'many' &&
          r.c_ch === 'many' &&
          col.defaultvalue === 'object()',
      )
    ) {
      // Imports needed for this pattern

      lines.push('  return applyDecorators(');
      lines.push('    ApiProperty({');
      lines.push(`      description: \`${safeDescription}\`,`);
      // if (exampleValue) {
      //   lines.push(`      example: ${JSON.stringify(exampleValue)},`);
      // }
      lines.push(`      type: 'object',`);
      lines.push(
        `      additionalProperties: { $ref: getSchemaPath(${rel.parentClass}Response) },`,
      );
      lines.push('      required: [],');
      lines.push('    }),');
      lines.push(
        `    Transform(({ value }) => transformAndValidateRecord(value, ${rel.parentClass}Response)),`,
      );
      lines.push('    ValidateNested({ each: true }),');
      lines.push('    IsObject(),');
      if (required) {
        lines.push('    required ? IsNotEmpty() : IsOptional(),');
      } else {
        lines.push('    IsOptional(),');
      }
      lines.push('  );');
      lines.push('}');
      lines.push('');
      // Write this decorator to its own file
      const fileName = `${kebabCase(col.name)}.decorator.ts`;
      const filePath = path.join(decoratorsDir, fileName);
      let localImports = new Set();
      addImport(localImports, '@nestjs/common', 'applyDecorators');
      addImport(localImports, '@nestjs/swagger', [
        'ApiProperty',
        'getSchemaPath',
      ]);
      addImport(localImports, 'class-transformer', ['Transform']);

      if (addTypeDecorator && relationType) {
        // addImport(localImports, 'class-transformer', ['Type']);
        if (isArray)
          addImport(localImports, 'class-validator', ['ValidateNested']);
      }

      addImport(localImports, 'class-validator', ['IsObject']);

      if (required) {
        addImport(localImports, 'class-validator', ['IsNotEmpty']);
        addImport(localImports, 'class-validator', ['IsOptional']);
      } else {
        addImport(localImports, 'class-validator', ['IsOptional']);
      }
      addImport(localImports, 'src/shared/application/dtos', [
        'transformAndValidateRecord',
      ]);
      // Add relationType import if needed
      if (isRelation && relationType) {
        addImport(
          localImports,
          `../../../../${kebabCase(rel.parentClass)}/application/dtos`,
          relationType,
        );
      }
      // PropOptions interface if needed
      let propOptionsInterface = '';
      if (required) {
        propOptionsInterface = `/**\n * Options for property decorators\n */\ninterface PropOptions {\n  required?: boolean;\n}\n`;
      }
      const importLines = buildImportLines(localImports);
      const fileContent = `${importLines}\n\n${propOptionsInterface}${lines.join('\n')}`;
      decoratorFiles.push({ filePath, fileContent });
      usedValidators.add('IsObject');
      usedValidators.add('IsNotEmpty');
      usedValidators.add('IsOptional');
      usedValidators.add('ValidateNested');
      usedTransformers.add('Transform');
      propOptionsNeeded = true;
    } else {
      lines.push(`  return applyDecorators(`);
      lines.push(`    ApiProperty({ ${apiPropOpts.join(', ')} }),`);
      if (addTypeDecorator && relationType) {
        if (isArray) {
          lines.push(`    Type(() => ${relationType}),`);
          lines.push('    ValidateNested({ each: true }),');
          usedValidators.add('ValidateNested');
        } else {
          lines.push(`    Type(() => ${relationType}),`);
        }
      }
      // Only add type validators for primitives, not for arrays/objects
      if (isArray) {
        // For arrays of relations, add IsArray and ValidateNested, but not IsString/IsNumber
        lines.push('    IsArray(),');
        usedValidators.add('IsArray');
      } else if (isObject) {
        // For objects, add IsObject, but not IsString/IsNumber
        lines.push('    IsObject(),');
        usedValidators.add('IsObject');
      } else {
        // For primitives, add the primitive validator(s)
        for (const v of validators) lines.push(`    ${v},`);
      }
      if (required) {
        lines.push(`    required ? IsNotEmpty() : IsOptional(),`);
        usedValidators.add('IsNotEmpty');
        usedValidators.add('IsOptional');
      } else {
        lines.push(`    IsOptional(),`);
        usedValidators.add('IsOptional');
      }
      lines.push(`  );`);
      lines.push(`}`);
      lines.push('');

      const fileName = `${kebabCase(colClass)}.decorator.ts`;
      const filePath = path.join(decoratorsDir, fileName);
      let localImports = new Set();
      addImport(localImports, '@nestjs/common', 'applyDecorators');
      addImport(localImports, '@nestjs/swagger', 'ApiProperty');
      if (addTypeDecorator && relationType) {
        addImport(localImports, 'class-transformer', ['Type']);
        if (isArray)
          addImport(localImports, 'class-validator', ['ValidateNested']);
      }
      if (isArray) {
        addImport(localImports, 'class-validator', ['IsArray']);
        if (addTypeDecorator && relationType)
          addImport(localImports, 'class-validator', ['ValidateNested']);
      } else if (isObject) {
        addImport(localImports, 'class-validator', ['IsObject']);
      } else {
        for (const v of validators)
          addImport(localImports, 'class-validator', [v.replace(/\(.*\)/, '')]);
      }
      addImport(localImports, 'class-validator', ['IsOptional']);
      if (required) {
        addImport(localImports, 'class-validator', ['IsNotEmpty']);
      }
      // Add relationType import if needed
      if (isRelation && relationType) {
        addImport(
          localImports,
          `../../../../${kebabCase(rel.parentClass)}/application/dtos`,
          relationType,
        );
      }
      // PropOptions interface if needed
      let propOptionsInterface = '';
      if (required) {
        propOptionsInterface = `/**\n * Options for property decorators\n */\ninterface PropOptions {\n  required?: boolean;\n}\n`;
      }
      if (apiEnum) addImport(localImports, '../../../domain/entities', apiEnum);
      const importLines = buildImportLines(localImports);
      const fileContent = `${importLines}\n\n${propOptionsInterface}${lines.join('\n')}`;
      decoratorFiles.push({ filePath, fileContent });
    }
  }

  // PropOptions interface if needed
  let propOptionsInterface = '';
  if (propOptionsNeeded) {
    propOptionsInterface = `/**\n * Options for property decorators\n */\ninterface PropOptions {\n  required?: boolean;\n}\n`;
  }

  // Write each decorator file
  for (const { filePath, fileContent } of decoratorFiles) {
    await writeFileWithDir(filePath, fileContent);
    logger.success(`Generated decorator: ${filePath}`);
  }
}

// Patch the main dtos function to call the new generator
const dtos = async (schema, config) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    tableIndex++;
    logger.info(`Processing table ${tableIndex}/${tableCount}: ${table.name}`);
    try {
      await generateDecoratorsForTable(table, schema, outDir);
    } catch (error) {
      logger.error(`Error processing table ${table.name}: ${error.message}`);
    }
  }
};

// Export the main entry point
exports.create = create;
