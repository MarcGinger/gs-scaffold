const path = require('path');
const { writeFileWithDir } = require('../utils/file-utils');
const { buildImportLines, handleStep } = require('../utils/generator-utils');

const {
  kebabCase,
  upperFirst,
  camelCase,
  singularize,
  pluralize,
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
  const errors = {};
  try {
    // Generate domain interfaces
    const generatedErrors = {};
    await handleStep(
      'generateValueObjectUtilities',
      async () => await generateValueObjectUtilities(schema, finalConfig),
      generatedErrors,
    );

    // Merge generated errors
    Object.assign(errors, generatedErrors);

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
 * Generate value object utility functions (equality, normalization, validation) for each table
 * @param {Object} schema - The schema object
 * @param {Object} config - Configuration options
 * @returns {Promise<void>}
 */
const generateValueObjectUtilities = async (schema, config) => {
  const errors = {};
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    // if (
    //   schema.parameters?.[table.name]?.cancel?.create &&
    //   schema.parameters?.[table.name]?.cancel?.update &&
    //   schema.parameters?.[table.name]?.cancel?.delete
    // ) {
    //   continue;
    // }
    errors[table.name] = {};
    let hasRecordSet = false;
    let hasArray = false;
    for (const tbl of Object.values(tables)) {
      for (const rel of (tbl._relationships || []).filter(
        (r) => r.parentTable === table.name,
      )) {
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          const childTable = Object.values(tables).find(
            (t) => t.name === rel.childTable,
          );
          if (childTable) {
            const col = childTable.cols.find((c) => c.name === rel.childCol);
            if (col) {
              if (col.defaultvalue === 'object()') {
                hasRecordSet = true;
              } else {
                hasArray = true;
              }
            }
          }
        }
      }
    }

    const name = table.name;
    const className = upperFirst(camelCase(name));
    const interfaceName = `I${className}`;
    const exceptionName = `${className}DomainException`;
    const exceptionMsgName = `${className}ExceptionMessage`;
    const fileName = `${kebabCase(name)}.domain.ts`;
    const imports = [];

    addImport(imports, `../entities`, interfaceName);
    addImport(imports, `../exceptions`, [exceptionName, exceptionMsgName]);
    const arrayList = [];
    const objectList = [];
    const primativeList = [];
    table.cols.map((col) => {
      const rel = (table._relationships || []).find(
        (r) => r.childCol === col.name,
      );
      if (rel) {
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          arrayList.push({ col, rel });
        } else {
          objectList.push({ col, rel });
        }
      } else {
        if (col.pk && col.datatype === 'JSON') {
          // Skip JSON columns for equality checks
          return;
        }
        primativeList.push({ col });
      }
    });

    const arrayLines = [];
    const addedArrayLines = [];
    arrayList.forEach((item) => {
      if (addedArrayLines.includes(item.rel.parentTable)) return;
      addedArrayLines.push(item.rel.parentTable);
      const colName = camelCase(item.col.name);
      const relName = upperFirst(camelCase(pluralize(item.rel.parentTable)));
      const singleName = camelCase(item.rel.parentTable);
      const interfaceType = `I${upperFirst(camelCase(item.rel.parentTable))}`;

      if (item.col.defaultvalue === 'object()') {
        arrayLines.push(
          `function recordOf${upperFirst(camelCase(pluralize(item.rel.parentTable)))}Equals(`,
          `  a: Record<string, ${interfaceType}> | undefined,`,
          `  b: Record<string, ${interfaceType}> | undefined,`,
          `): boolean {`,
          `  if (a === b) return true;`,
          `  if (!a || !b) return false;`,
          `  const keysA = Object.keys(a);`,
          `  const keysB = Object.keys(b);`,
          `  if (keysA.length !== keysB.length) return false;`,
          `  for (const key of keysA) {`,
          `    if (!${camelCase(item.rel.parentTable)}Equals(a[key], b[key])) return false;`,
          `  }`,
          `  return true;`,
          `}`,
          ``,
        );
      } else {
        const equalsFn = `${singleName}Equals`;
        const arrayFn = `arrayOf${relName}Equals`;
        arrayLines.push(
          `function ${arrayFn}(`,
          `  a: ${interfaceType}[] | undefined,`,
          `  b: ${interfaceType}[] | undefined,`,
          `): boolean {`,
          `  if (a === b) return true;`,
          `  if (!a || !b) return false;`,
          `  if (a.length !== b.length) return false;`,
          `  for (let i = 0; i < a.length; i++) {`,
          `    if (!${equalsFn}(a[i], b[i])) return false;`,
          `  }`,
          `  return true;`,
          `}`,
          ``,
        );
      }
    });

    // Build equality function
    const eqLines = [
      `export function ${camelCase(name)}Equals(a: ${interfaceName} | undefined, b: ${interfaceName} | undefined): boolean {`,
    ];
    eqLines.push(`  if (a === b) return true;`);
    eqLines.push(`  if (!a || !b) return false;`);

    arrayList.forEach((item) => {
      const colName = camelCase(item.col.name);
      addImport(
        imports,
        `../../../${kebabCase(item.rel.parentTable)}/domain`,
        `I${upperFirst(camelCase(item.rel.parentTable))}`,
      );
      addImport(
        imports,
        `../../../${kebabCase(item.rel.parentTable)}/domain`,
        `${camelCase(item.rel.parentTable)}Equals`,
      );
      if (item.col.defaultvalue === 'object()') {
        eqLines.push(
          `  if (!recordOf${upperFirst(camelCase(pluralize(item.rel.parentTable)))}Equals(a.${colName}, b.${colName})) return false;`,
        );
      } else {
        eqLines.push(
          `  if (!arrayOf${upperFirst(camelCase(pluralize(item.rel.parentTable)))}Equals(a.${colName}, b.${colName})) return false;`,
        );
      }
    });
    objectList.forEach((item) => {
      const colName = camelCase(item.col.name);
      addImport(
        imports,
        `../../../${kebabCase(item.rel.parentTable)}/domain`,
        `${camelCase(item.rel.parentTable)}Equals`,
      );
      eqLines.push(
        `  if (!${camelCase(item.rel.parentTable)}Equals(a.${colName}, b.${colName})) return false;`,
      );
    });
    if (primativeList.length === 0) {
      eqLines.push(`  return true;`);
    } else {
      eqLines.push(`  return (`);
      eqLines.push(
        primativeList
          .filter((item) => !item.col.pk && item.col.datatype !== 'JSON')
          .map((item) => {
            const colName = camelCase(item.col.name);
            if (item.col.type === 'Date' || item.col.datatype === 'DATE') {
              return `    (a.${colName} === b.${colName} || (a.${colName} instanceof Date && b.${colName} instanceof Date && a.${colName}.getTime() === b.${colName}.getTime()))`;
            } else {
              return `    a.${colName} === b.${colName}`;
            }
          })
          .join(' &&\n'),
      );
      eqLines.push(`  );`);
    }
    eqLines.push(`}`);
    eqLines.push(``);

    const recordOfLines = [];
    // Build recordOf equality function if there are many-to-many relationships
    if (hasRecordSet) {
      recordOfLines.push(
        ``,
        `export function recordOf${upperFirst(camelCase(pluralize(name)))}Equals(`,
        `  a: Record<string, ${interfaceName}> | undefined,`,
        `  b: Record<string, ${interfaceName}> | undefined,`,
        `): boolean {`,
        `  if (a === b) return true;`,
        `  if (!a || !b) return false;`,
        ``,
        `  const keysA = Object.keys(a);`,
        `  const keysB = Object.keys(b);`,
        ``,
        `  if (keysA.length !== keysB.length) return false;`,
        ``,
        `  for (const key of keysA) {`,
        `    if (!${camelCase(name)}Equals(a[key], b[key])) return false;`,
        `  }`,
        ``,
        `  return true;`,
        `}`,
        ``,
        `export function toRecordOf${upperFirst(camelCase(pluralize(name)))}(`,
        `  input: Record<string, ${interfaceName}> | string,`,
        `): Record<string, ${interfaceName}> {`,
        `  if (typeof input === 'string') {`,
        `    throw new ${exceptionName}(${exceptionMsgName}.invalidRecordOfInputType);`,
        `  }`,
        `  const normalized: Record<string, ${interfaceName}> = {};`,
        `  for (const key in input) {`,
        `    normalized[key] = to${upperFirst(camelCase(singularize(name)))}(input[key]);`,
        `  }`,
        ``,
        `  return normalized;`,
        `}`,
        ``,
        ``,
        `export function validateRecordOf${upperFirst(camelCase(pluralize(name)))}(${camelCase(pluralize(name))}: Record<string, ${interfaceName}>): void {`,
        `  for (const [key, item] of Object.entries(${camelCase(pluralize(name))})) {`,
        `    validate${className}(item);`,
        `  }`,
        `}`,
        ``,
        `export function cloneRecordOf${upperFirst(camelCase(pluralize(name)))}(`,
        `  input: Record<string, ${interfaceName}>,`,
        `): Record<string, ${interfaceName}> {`,
        `  return JSON.parse(JSON.stringify(input)) as Record<string, ${interfaceName}>;`,
        `}`,
        ``,
        `export function emptyRecordOf${upperFirst(camelCase(pluralize(name)))}(): Record<string, ${interfaceName}> {`,
        `  return {};`,
        `}`,
        ``,
        `export function recordOf${upperFirst(camelCase(pluralize(name)))}HasChanges(`,
        `  a: Record<string, ${interfaceName}> | undefined,`,
        `  b: Record<string, ${interfaceName}> | undefined,`,
        `): boolean {`,
        `  return !recordOf${upperFirst(camelCase(pluralize(name)))}Equals(a, b);`,
        `}`,
        ``,
      );
    }

    if (hasArray) {
      recordOfLines.push(
        ``,
        `export function arrayOf${upperFirst(camelCase(pluralize(name)))}Equals(`,
        `  a: ${interfaceName}[] | undefined,`,
        `  b: ${interfaceName}[] | undefined,`,
        `): boolean {`,
        `  if (a === b) return true;`,
        `  if (!a || !b) return false;`,
        `  if (a.length !== b.length) return false;`,
        `  for (let i = 0; i < a.length; i++) {`,
        `    if (!${camelCase(singularize(name))}Equals(a[i], b[i])) return false;`,
        `  }`,
        `  return true;`,
        `}`,
        ``,
        `export function toArrayOf${upperFirst(camelCase(pluralize(name)))}(`,
        `  input: ${interfaceName}[] | string,`,
        `): ${interfaceName}[] {`,
        `  if (typeof input === 'string') {`,
        `    throw new ${exceptionName}(${exceptionMsgName}.invalidArrayOfInputType);`,
        `  }`,
        `  return input.map(to${upperFirst(camelCase(singularize(name)))});`,
        `}`,
        ``,
        `export function validateArrayOf${upperFirst(camelCase(pluralize(name)))}(arr: ${interfaceName}[]): void {`,
        `  for (const item of arr) {`,
        `    validate${className}(item);`,
        `  }`,
        `}`,
        ``,
        `export function cloneArrayOf${upperFirst(camelCase(pluralize(name)))}(`,
        `  input: ${interfaceName}[],`,
        `): ${interfaceName}[] {`,
        `  return JSON.parse(JSON.stringify(input)) as ${interfaceName}[];`,
        `}`,
        ``,
        `export function emptyArrayOf${upperFirst(camelCase(pluralize(name)))}(): ${interfaceName}[] {`,
        `  return [];`,
        `}`,
        ``,
        `export function arrayOf${upperFirst(camelCase(pluralize(name)))}HasChanges(`,
        `  a: ${interfaceName}[] | undefined,`,
        `  b: ${interfaceName}[] | undefined,`,
        `): boolean {`,
        `  return !arrayOf${upperFirst(camelCase(pluralize(name)))}Equals(a, b);`,
        `}`,
        ``,
      );
    }

    // Build normalization/validation function
    const toLines = [
      `export function validate${className}(input: ${interfaceName} | string): ${interfaceName} {`,
    ];
    toLines.push(`  let obj: ${interfaceName};`);
    toLines.push(`  if (typeof input === 'string') {`);
    // Use first string column as identifier if possible
    const idCol = table.cols.find(
      (col) => col.pk && (col.type === 'string' || col.datatype === 'VARCHAR'),
    );
    if (idCol) {
      toLines.push(
        `    obj = { ${camelCase(idCol.name)}: input } as ${interfaceName};`,
      );
    } else {
      toLines.push(
        `    throw new ${exceptionName}(${exceptionMsgName}.invalidStringConversion);`,
      );
    }
    toLines.push(`  } else {`);
    toLines.push(`    obj = { ...input };`);
    toLines.push(`  }`);
    // Add business rule: all required fields must be present
    table.cols
      .filter((col) => col.nn)
      .filter((col) => !col.pk && col.datatype !== 'JSON') // Skip primary keys
      .forEach((col) => {
        const colName = camelCase(col.name);
        toLines.push(
          `  if (obj.${colName} === undefined || obj.${colName} === null) {`,
        );
        toLines.push(
          `    throw new ${exceptionName}(${exceptionMsgName}.required${upperFirst(colName)});`,
        );
        toLines.push(`  }`);
      });
    // Example: if a numeric column must be >= 0
    table.cols
      .filter((col) => col.type === 'number')
      .forEach((col) => {
        toLines.push(
          `if (Array.isArray(obj.${camelCase(col.name)}) && obj.${camelCase(col.name)}.length === 0) {`,
        );
        toLines.push(
          `    throw new ${exceptionName}(${exceptionMsgName}.empty${upperFirst(camelCase(col.name))}Array);`,
        );
        toLines.push(`  }`);
      });
    // Build dynamic normalization for arrays and objects

    if ([...arrayList, ...objectList].length === 0) {
      toLines.push(`  // No relationships to normalize, return input as is`);
      toLines.push(`  return obj;`);
    } else {
      toLines.push(
        `  // Return a new object with normalized arrays and complex objects`,
      );
      toLines.push(`  return {`);
      toLines.push(`    ...obj,`);
      // Dynamically handle arrays (many-to-many)
      arrayList.forEach((item) => {
        const colName = camelCase(item.col.name);
        const relName = upperFirst(camelCase(item.rel.parentTable));
        const toFn = `to${singularize(relName)}`;
        if (item.col.defaultvalue !== 'object()') {
          addImport(
            imports,
            `../../../${kebabCase(item.rel.parentTable)}/domain`,
            toFn,
          );
        }

        if (item.col.nn) {
          if (item.col.defaultvalue === 'object()') {
            toLines.push(`    ${colName}: obj.${colName},`);
          } else {
            toLines.push(`    ${colName}: obj.${colName}.map(${toFn}),`);
          }
        } else {
          if (item.col.defaultvalue === 'object()') {
            toLines.push(`    ${colName}: obj.${colName},`);
          } else {
            toLines.push(
              `    ${colName}: Array.isArray(obj.${colName}) ? obj.${colName}.map(${toFn}) : [],`,
            );
          }
        }
      });
      // Dynamically handle objects (one-to-one, many-to-one)
      objectList.forEach((item) => {
        const colName = camelCase(item.col.name);
        const relName = upperFirst(camelCase(item.rel.parentTable));
        const toFn = `to${singularize(relName)}`;
        addImport(
          imports,
          `../../../${kebabCase(item.rel.parentTable)}/domain`,
          toFn,
        );
        if (item.col.nn) {
          toLines.push(`    ${colName}: ${toFn}(obj.${colName}),`);
        } else {
          toLines.push(
            `    ${colName}: obj.${colName} ? ${toFn}(obj.${colName}) : undefined,`,
          );
        }
      });
      toLines.push(`  };`);
    }
    toLines.push(`}`);

    toLines.push(``);

    toLines.push(
      `export function to${singularize(className)}(input: ${interfaceName} | string): ${interfaceName} {`,
    );
    toLines.push(`  if (typeof input === 'string') {`);
    // Use first string column as identifier if possible

    toLines.push(
      `    throw new ${exceptionName}(${exceptionMsgName}.invalidInputTypeForConversion);`,
    );

    toLines.push(`  }`);
    toLines.push(`  const ${singularize(className)} = { ...input };`);
    toLines.push(`  validate${className}(${singularize(className)});`);
    toLines.push(`  return ${singularize(className)};`);
    toLines.push(`}`);

    const fileContent = [
      buildImportLines(imports),
      '',
      ...eqLines,
      '',
      ...recordOfLines,
      '',
      ...arrayLines,
      '',
      ...toLines,
      '',
    ].join('\n');

    // Define error messages for domain value object utilities
    errors[table.name]['invalidRecordOfInputType'] = {
      message: `Invalid input type for ${className} record conversion`,
      description: `This error occurs when trying to convert a string to a Record<string, ${interfaceName}> in toRecordOf${upperFirst(camelCase(pluralize(name)))} function.`,
      code: `INVALID_RECORD_OF_INPUT_TYPE_FOR_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['invalidArrayOfInputType'] = {
      message: `Invalid input type for ${className} array conversion`,
      description: `This error occurs when trying to convert a string to an array of ${interfaceName} in toArrayOf${upperFirst(camelCase(pluralize(name)))} function.`,
      code: `INVALID_ARRAY_OF_INPUT_TYPE_FOR_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['invalidStringConversion'] = {
      message: `Cannot convert string to ${className} without valid identifier`,
      description: `This error occurs when trying to convert a string to ${interfaceName} but no valid string identifier column is available.`,
      code: `INVALID_STRING_CONVERSION_FOR_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    errors[table.name]['invalidInputTypeForConversion'] = {
      message: `Invalid input type for ${className} conversion`,
      description: `This error occurs when trying to convert a string to ${interfaceName} in to${singularize(className)} function when string conversion is not supported.`,
      code: `INVALID_INPUT_TYPE_FOR_CONVERSION_${table.name.toUpperCase()}`,
      exception: `${className}DomainException`,
      statusCode: 400,
      domain: true,
    };

    // Add required field validation errors
    table.cols
      .filter((col) => col.nn)
      .filter((col) => !col.pk && col.datatype !== 'JSON')
      .forEach((col) => {
        const colName = camelCase(col.name);
        const fieldName = upperFirst(colName);
        errors[table.name][`required${fieldName}`] = {
          message: `${fieldName} is required and cannot be null or undefined`,
          description: `This error occurs when validating a ${className} and the required field ${colName} is missing or null.`,
          code: `REQUIRED_${col.name.toUpperCase()}_FOR_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };
      });

    // Add numeric array validation errors
    table.cols
      .filter((col) => col.type === 'number')
      .forEach((col) => {
        const colName = camelCase(col.name);
        const fieldName = upperFirst(colName);
        errors[table.name][`empty${fieldName}Array`] = {
          message: `${fieldName} array cannot be empty`,
          description: `This error occurs when validating a ${className} and the ${colName} array is empty when it should contain values.`,
          code: `EMPTY_${col.name.toUpperCase()}_ARRAY_FOR_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };
      });

    const outputFile = path.join(
      outDir,
      kebabCase(name),
      'domain',
      'value-objects',
      fileName,
    );
    await writeFileWithDir(outputFile, fileContent);

    logger.success(`Created value object utilities: ${outputFile}`);
  }
  return errors;
};

// Export the main entry point
module.exports = { create };
