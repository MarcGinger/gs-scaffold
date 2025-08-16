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
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  logger.info('Starting domain model interface generation...');
  try {
    // Generate domain interfaces
    await generateValueObjectUtilities(schema, finalConfig);
    logger.success('Domain model interface generation completed successfully');
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
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      continue;
    }
    // if (shouldSkipTable(table, schema)) continue;

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
      if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
        // logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
        logger.warn(
          `Skipping table ${tableId} because it has a JSON primary key column.`,
        );
        return;
      }
      if (rel) {
        if (rel.c_p === 'many' && rel.c_ch === 'many') {
          arrayList.push({ col, rel });
        }
        if (rel.c_p === 'one' && rel.c_ch === 'many') {
          objectList.push({ col, rel });
        }
      } else {
        primativeList.push({ col });
      }
    });

    // --- Generate value object classes for each relationship ---
    for (const item of arrayList) {
      const colName = camelCase(item.col.name);
      const relName = upperFirst(camelCase(item.rel.parentTable));
      const relNamePlural = camelCase(pluralize(item.rel.parentTable));
      const relPlural = upperFirst(camelCase(pluralize(item.rel.parentTable)));
      const relSingular = upperFirst(
        camelCase(singularize(item.rel.parentTable)),
      );
      const interfaceType = `I${upperFirst(camelCase(item.rel.parentTable))}`;
      const equalsFn = `${camelCase(item.rel.parentTable)}Equals`;
      const validateFn = `validate${relName}`;
      let classLines = [];
      // Record<string, ...> set
      if (item.col.defaultvalue === 'object()') {
        classLines.push(
          `import { ${interfaceType} } from '../../../${kebabCase(item.rel.parentTable)}/domain/entities';`,
          `import { ${equalsFn} } from '../../../${kebabCase(item.rel.parentTable)}/domain/value-objects';`,
          ``,
          `export class ${relName}Set {`,
          `  private readonly ${relNamePlural}: Record<string, ${interfaceType}>;`,
          ``,
          `  constructor(${relNamePlural}: Record<string, ${interfaceType}> = {}) {`,
          `    this.${relNamePlural} = { ...${relNamePlural} };`,
          `  }`,
          ``,
          `  public add(key: string, item: ${interfaceType}): ${relName}Set {`,
          `    return new ${relName}Set({ ...this.${relNamePlural}, [key]: item });`,
          `  }`,
          ``,
          `  public remove(key: string): ${relName}Set {`,
          `    const updated = { ...this.${relNamePlural} };`,
          `    delete updated[key];`,
          `    return new ${relName}Set(updated);`,
          `  }`,
          ``,
          `  public merge(new${relNamePlural}: Record<string, ${interfaceType}>): ${relName}Set {`,
          `    return new ${relName}Set({ ...this.${relNamePlural}, ...new${relNamePlural} });`,
          `  }`,
          ``,
          `  public equals(other: ${relName}Set | undefined): boolean {`,
          `    if (!other) return false;`,
          `    return (`,
          `      Object.keys(this.${relNamePlural}).length === Object.keys(other.${relNamePlural}).length &&`,
          `      Object.keys(this.${relNamePlural}).every((key) =>`,
          `        ${equalsFn}(this.${relNamePlural}[key], other.${relNamePlural}[key]),`,
          `      )`,
          `    );`,
          `  }`,
          ``,
          `  public get value(): Record<string, ${interfaceType}> {`,
          `    return { ...this.${relNamePlural} };`,
          `  }`,
          ``,
          `  public isEmpty(): boolean {`,
          `    return Object.keys(this.${relNamePlural}).length === 0;`,
          `  }`,
          `}`,
          ``,
        );

        const fileContent = classLines.join('\n');
        const outputFile = path.join(
          outDir,
          kebabCase(name),
          'domain',
          'value-objects',
          `${kebabCase(item.col.name)}-set.ts`,
        );
        await writeFileWithDir(outputFile, fileContent);
      } else {
        // Map-based set (for array relationships with unique key, e.g., code)
        classLines.push(
          `import { ${interfaceType} } from '../../../${kebabCase(item.rel.parentTable)}/domain/entities';`,
          `import { ${equalsFn}, ${relSingular}Identifier } from '../../../${kebabCase(item.rel.parentTable)}/domain/value-objects';`,
          ``,
          `export class ${relName}List {`,
          `  private readonly ${relNamePlural}: Map<string, ${interfaceType}>;`,
          ``,
          `  constructor(initial: ${interfaceType}[] = []) {`,
          `    this.${relNamePlural} = new Map(initial.map((item) => [item.${camelCase(item.rel.parentCol)}${item.col.type === 'number' ? '.toString()' : ''}, item]));`,
          `  }`,
          ``,
          `  public add(item: ${interfaceType}): ${relName}List {`,
          `    const updated = new Map(this.${relNamePlural});`,
          `    updated.set(item.${camelCase(item.rel.parentCol)}${item.col.type === 'number' ? '.toString()' : ''}, item);`,
          `    return new ${relName}List([...updated.values()]);`,
          `  }`,
          ``,
          `  public remove(${camelCase(item.rel.parentCol)}: ${camelCase(item.col.type)} | ${relSingular}Identifier): ${relName}List {`,
          `    if (!this.contains(${camelCase(item.rel.parentCol)})) return this;`,
          `    const _id = ${camelCase(item.rel.parentCol)}.toString();`,
          `    const updated = new Map(this.${relNamePlural});`,
          `    updated.delete(_id);`,
          `    return new ${relName}List([...updated.values()]);`,
          `  }`,
          ``,
          `  public merge(${relNamePlural}ToMerge: ${interfaceType}[]): ${relName}List {`,
          `    const merged = new Map(this.${relNamePlural});`,
          `    for (const item of ${relNamePlural}ToMerge) {`,
          `      merged.set(item.${camelCase(item.rel.parentCol)}${item.col.type === 'number' ? '.toString()' : ''}, item);`,
          `    }`,
          `    return new ${relName}List([...merged.values()]);`,
          `  }`,
          ``,
          `  public equals(other: ${relName}List | undefined): boolean {`,
          `    if (!other) return false;`,
          `    if (this.${relNamePlural}.size !== other.${relNamePlural}.size) return false;`,
          `    for (const [code, item] of this.${relNamePlural}) {`,
          `      const otherItem = other.${relNamePlural}.get(code);`,
          `      if (!otherItem || !${equalsFn}(item, otherItem)) {`,
          `        return false;`,
          `      }`,
          `    }`,
          `    return true;`,
          `  }`,
          ``,
          `  public contains(${camelCase(item.rel.parentCol)}: ${camelCase(item.col.type)} | ${relSingular}Identifier): boolean {`,
          `    const _id = ${camelCase(item.rel.parentCol)}.toString();`,
          `    return this.${relNamePlural}.has(_id);`,
          `  }`,
          ``,
          `  public get value(): ${interfaceType}[] {`,
          `    return [...this.${relNamePlural}.values()];`,
          `  }`,
          ``,
          `  public isEmpty(): boolean {`,
          `    return this.${relNamePlural}.size === 0;`,
          `  }`,
          `}`,
          ``,
        );

        const fileContent = classLines.join('\n');
        const outputFile = path.join(
          outDir,
          kebabCase(name),
          'domain',
          'value-objects',
          `${kebabCase(item.col.name)}-list.ts`,
        );
        await writeFileWithDir(outputFile, fileContent);
      }
    }
    // For single object relationships
    for (const item of objectList) {
      const colName = camelCase(item.col.name);
      const relName = upperFirst(camelCase(item.rel.parentTable));
      const interfaceType = `I${upperFirst(camelCase(item.rel.parentTable))}`;
      const equalsFn = `${camelCase(item.rel.parentTable)}Equals`;
      const validateFn = `validate${relName}`;
      const classLines = [
        `import { ${interfaceType} } from '../../../${kebabCase(item.rel.parentTable)}/domain/entities';`,
        `import { ${equalsFn}, ${validateFn} } from '../../../${kebabCase(item.rel.parentTable)}/domain/value-objects';`,
        ``,
        `export class ${relName}Value {`,
        `  private readonly valueObj: ${interfaceType};`,
        ``,
        `  constructor(value: ${interfaceType}) {`,
        `    ${validateFn}(value);`,
        `    this.valueObj = { ...value };`,
        `  }`,
        ``,
        `  public equals(other: ${relName}Value | ${interfaceType}): boolean {`,
        `    const otherValue = other instanceof ${relName}Value ? other.valueObj : other;`,
        `    return ${equalsFn}(this.valueObj, otherValue);`,
        `  }`,
        ``,
        `  public get value(): ${interfaceType} {`,
        `    return { ...this.valueObj };`,
        `  }`,
        `}`,
        ``,
      ];
      const fileContent = classLines.join('\n');
      const outputFile = path.join(
        outDir,
        kebabCase(name),
        'domain',
        'value-objects',
        `${kebabCase(item.col.name)}.ts`,
      );
      await writeFileWithDir(outputFile, fileContent);
      logger.success(`Created value object utilities: ${outputFile}`);
    }
  }
};

// Export the main entry point
module.exports = { create };
