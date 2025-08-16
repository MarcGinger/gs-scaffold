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
      async () => await generateDomainInterfaces(schema, finalConfig),
      errors,
    );
    // Generate domain interfaces and collect errors

    await createIndexFilesFromDirectory(
      path.resolve(schema.sourceDirectory, 'shared', 'domain', 'value-objects'),
    );
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
const generateDomainInterfaces = async (schema, config) => {
  const errors = {};
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  const tableCount = Object.keys(tables).length;

  logger.info(`Processing ${tableCount} tables for domain interfaces...`);

  let tableIndex = 0;
  for (const [tableId, table] of Object.entries(tables)) {
    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
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
    try {
      const lines = [];

      lines.push(`/**`);
      lines.push(` * Value object for ${className} identifiers.`);
      lines.push(
        ` * Extends EntityIdentifier for domain-specific constraints.`,
      );
      lines.push(
        ` * Implements immutable value object pattern with validation.`,
      );
      lines.push(` */`);
      lines.push(``);
      lines.push(
        `import { EntityIdentifier } from 'src/shared/domain/value-objects';`,
      );
      lines.push(
        `import { ${className}DomainException, ${className}ExceptionMessage } from '../exceptions';`,
      );
      lines.push(``);
      lines.push(
        `export class ${className}Identifier extends EntityIdentifier<${key.type}> {`,
      );
      lines.push(
        `  private constructor(${camelCase(key.name)}: ${key.type}) {`,
      );
      lines.push(`    super(${camelCase(key.name)});`);
      lines.push(`    this.validate();`);
      lines.push(`  }`);
      lines.push(``);
      lines.push(`  public get value(): ${key.type} {`);
      lines.push(`    return this._value;`);
      lines.push(`  }`);
      lines.push(``);
      lines.push(
        `  public static fromString(${camelCase(key.name)}: ${key.type}): ${className}Identifier {`,
      );
      lines.push(
        `    return new ${className}Identifier(${camelCase(key.name)});`,
      );
      lines.push(`  }`);
      lines.push(``);
      lines.push(
        `  public static create(${camelCase(key.name)}: ${key.type}): ${className}Identifier {`,
      );
      lines.push(
        `    return new ${className}Identifier(${camelCase(key.name)});`,
      );
      lines.push(`  }`);
      lines.push(``);
      lines.push(`  public equals(other: ${className}Identifier): boolean {`);
      lines.push(`    return this._value === other._value;`);
      lines.push(`  }`);
      lines.push(``);
      lines.push(`  public toString(): string {`);
      lines.push(`    return String(this._value);`);
      lines.push(`  }`);
      lines.push(``);
      lines.push(`  private validate(): void {`);
      if (key.type === 'number') {
        lines.push(
          `    if (this._value === undefined || this._value === null) {`,
        );
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.field${fieldName}Required);`,
        );

        errors[table.name][`field${fieldName}Required`] = {
          message: `${fieldName} is required and cannot be empty`,
          description: `This error occurs when creating a ${className}Identifier with an invalid ${camelCase(key.name)} value.`,
          code: `FIELD_${key.name.toUpperCase()}_REQUIRED_FOR_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };
        lines.push(`    }`);
        lines.push(`    if (this._value < 0) {`);
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.field${fieldName}Invalid);`,
        );
        lines.push(`    }`);
        errors[table.name][`field${fieldName}Invalid`] = {
          message: `${fieldName} must be a valid positive number`,
          description: `This error occurs when creating a ${className}Identifier with a negative or invalid ${camelCase(key.name)} value.`,
          code: `FIELD_${key.name.toUpperCase()}_INVALID_FOR_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };
      } else {
        lines.push(`    if (!this._value) {`);
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.field${fieldName}Required);`,
        );
        errors[table.name][`field${fieldName}Required`] = {
          message: `${fieldName} is required and cannot be empty`,
          description: `This error occurs when creating a ${className}Identifier with an invalid ${camelCase(key.name)} value.`,
          code: `FIELD_${key.name.toUpperCase()}_REQUIRED_FOR_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };

        lines.push(`    }`);
        lines.push(`    if (this._value.trim() === '') {`);
        lines.push(
          `      throw new ${className}DomainException(${className}ExceptionMessage.field${fieldName}Empty);`,
        );
        errors[table.name][`field${fieldName}Empty`] = {
          message: `${fieldName} cannot be empty or whitespace`,
          description: `This error occurs when creating a ${className}Identifier with an empty or whitespace-only ${camelCase(key.name)} value.`,
          code: `FIELD_${key.name.toUpperCase()}_EMPTY_FOR_${table.name.toUpperCase()}`,
          exception: `${className}DomainException`,
          statusCode: 400,
          domain: true,
        };
        lines.push(`    }`);
      }
      lines.push(`    // Add more domain-specific validation here if needed`);
      lines.push(`  }`);
      lines.push(`}`);

      // Define error messages for value object validation

      // Write to file
      const outputFile = path.join(
        outDir,

        `${kebabCase(name)}`,
        'domain',
        'value-objects',
        `${kebabCase(name)}-identifier.ts`,
      );
      if (schema.excluded?.includes(`${kebabCase(name)}-identifier.ts`)) {
        logger.info(
          `Skipping generation of ${kebabCase(name)}-identifier.ts as it is excluded.`,
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

// Export the main entry point
module.exports = { create };
