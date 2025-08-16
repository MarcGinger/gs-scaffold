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
  pluralize,
} = require('../utils/word-utils');
const {
  logger,
  defaultConfig,
  addImport,
  getRelationships,
  getUniqueRelationships,
} = require('../utils/general-utils');

const create = async (schema) => {
  await handler(schema);
  await queries(schema);
  await index(schema);
};

const handler = async (schema) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      ogger.warn(`Skipping table ${tableId} due to no primary key.`);
      continue;
    }

    const fileBase = kebabCase(table.name);

    const className = upperFirst(camelCase(table.name));

    const getItems = table.cols
      .filter((col) => col.name !== 'tenant')
      .filter((col) => col.pk)
      .map((col) => {
        return `query.${camelCase(col.name)}`;
      })
      .join(', ');

    const primaryCols = table.cols
      .filter((col) => col.name !== 'tenant')
      .filter((col) => col.pk);

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) => idx.cols.map((c) => c.colid))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => table.cols.find((c) => c.id === id))
      .filter(Boolean);
    if (schema.parameters?.[table.name]?.cancel?.get && idxCols.length === 0) {
      logger.warn(`Skipping table ${tableId} due to no primary key.`);
      continue;
    }
    const imports = [];
    addImport(imports, '@nestjs/cqrs', 'IQueryHandler, QueryHandler');
    if (idxCols.length) {
      addImport(imports, '../../domain/properties', `${className}Page`);
    }
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      addImport(imports, `./${kebabCase(table.name)}-query.class`, [
        `Item${className}Query`,
      ]);

      if (primaryCols.length === 1) {
        if (!schema.parameters?.[table.name]?.cancel?.batch) {
          addImport(
            imports,
            `./${kebabCase(table.name)}-query.class`,
            `Multiple${className}Query`,
          );
        }
      }
    }
    if (idxCols.length) {
      addImport(
        imports,
        `./${kebabCase(table.name)}-query.class`,
        `List${className}Query`,
      );
    }
    addImport(
      imports,
      `../../infrastructure/repositories`,
      `${className}Repository`,
    );
    const lines = [`// generate-queries`];
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      lines.push(`@QueryHandler(Item${className}Query)`);
      lines.push(
        `export class ${className}ItemHandler implements IQueryHandler<Item${className}Query> {`,
      );
      lines.push(
        `  constructor(private readonly repository: ${className}Repository) {}`,
      );
      lines.push(``);

      lines.push(`  async execute(query: Item${className}Query) {`);
      lines.push(
        `    return await this.repository.get${className}(query.user, ${getItems});`,
      );

      lines.push(`  }`);

      lines.push(`}`);
      lines.push(``);
    }
    if (table.indexes?.length) {
      lines.push(`@QueryHandler(List${className}Query)`);
      lines.push(
        `export class ${className}ListHandler implements IQueryHandler<List${className}Query> {`,
      );
      lines.push(
        `  constructor(private readonly repository: ${className}Repository) {}`,
      );
      lines.push(``);
      lines.push(
        `  async execute(query: List${className}Query): Promise<${className}Page> {`,
      );
      lines.push(
        `    return await this.repository.list(query.user, query.options);`,
      );
      lines.push(`  }`);
      lines.push(`}`);
      lines.push(``);
    }
    if (primaryCols.length === 1) {
      if (!schema.parameters?.[table.name]?.cancel?.get) {
        const primaryCol = primaryCols[0];
        if (!schema.parameters?.[table.name]?.cancel?.batch) {
          lines.push(`@QueryHandler(Multiple${className}Query)`);

          lines.push(`export class ${className}MultipleHandler`);
          lines.push(`  implements IQueryHandler<Multiple${className}Query>`);
          lines.push(`{`);
          lines.push(
            `  constructor(private readonly repository: ${className}Repository) {}`,
          );
          lines.push(``);
          lines.push(`  async execute(query: Multiple${className}Query) {`);
          lines.push(
            `    return await this.repository.getByCodes(query.user, query.${camelCase(pluralize(primaryCol.name))});`,
          );
          lines.push(`  }`);
          lines.push(`}`);
          lines.push(``);
        }
      }
    }

    const filePath = path.join(
      outDir,
      fileBase,
      'application',
      'queries',
      `${fileBase}-query.handler.ts`,
    );
    if (schema.excluded?.includes(`${fileBase}-query.handler.ts`)) {
      logger.info(
        `Skipping generation of ${fileBase}-query.handler.ts as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(
      filePath,
      buildImportLines(imports) + lines.join('\n'),
    );
  }
};

const queries = async (schema) => {
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      ogger.warn(`Skipping table ${tableId} due to no primary key.`);
      continue;
    }
    const fileBase = kebabCase(table.name);

    const className = upperFirst(camelCase(table.name));

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) => idx.cols.map((c) => c.colid))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => table.cols.find((c) => c.id === id))
      .filter(Boolean);
    if (schema.parameters?.[table.name]?.cancel?.get && idxCols.length === 0) {
      logger.warn(`Skipping table ${tableId} due to no primary key xxx.`);
      continue;
    }
    const imports = [];
    addImport(imports, 'src/shared/auth', 'IUserToken');
    if (idxCols.length) {
      addImport(
        imports,
        '../../domain/properties',
        `List${className}PropsOptions`,
      );
    }

    const lines = [`// generate-queries`];
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      lines.push(`export class Item${className}Query {`);
      lines.push(`  constructor(`);
      lines.push(`    public readonly user: IUserToken,`);
      table.cols
        .filter((col) => col.pk)
        .forEach((col) => {
          lines.push(
            `    public readonly ${camelCase(col.name)}: ${col.type},`,
          );
        });
      lines.push(`  ) {}`);
      lines.push(`}`);
      lines.push(``);
    }
    if (table.indexes?.length) {
      lines.push(`export class List${className}Query {`);
      lines.push(`  constructor(`);
      lines.push(`    public readonly user: IUserToken,`);
      lines.push(`    public readonly options: List${className}PropsOptions,`);
      lines.push(`  ) {}`);
      lines.push(`}`);
      lines.push(``);
    }
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      if (!schema.parameters?.[table.name]?.cancel?.batch) {
        lines.push(`export class Multiple${className}Query {`);
        lines.push(`  constructor(`);
        lines.push(`    public readonly user: IUserToken,`);
        table.cols
          .filter((col) => col.pk)
          .forEach((col) => {
            lines.push(
              `    public readonly ${camelCase(pluralize(col.name))}: ${col.type}[],`,
            );
          });

        lines.push(`  ) {}`);
        lines.push(`}`);
        lines.push(``);
      }
    }
    const filePath = path.join(
      outDir,
      fileBase,
      'application',
      'queries',
      `${fileBase}-query.class.ts`,
    );

    if (schema.excluded?.includes(`${fileBase}-query.class.ts`)) {
      logger.info(
        `Skipping generation of ${fileBase}-query.class.ts as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(
      filePath,
      buildImportLines(imports) + lines.join('\n'),
    );
  }
};

const index = async (schema) => {
  const indexPaths = [];
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      // logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }
    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${tableId} due to no primary key.`);
      continue;
    }
    const fileBase = kebabCase(table.name);

    const className = upperFirst(camelCase(table.name));

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) => idx.cols.map((c) => c.colid))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => table.cols.find((c) => c.id === id))
      .filter(Boolean);

    if (schema.parameters?.[table.name]?.cancel?.get && idxCols.length === 0) {
      logger.warn(`Skipping table ${tableId} due to no primary key xxx.`);
      continue;
    }
    const items = [];
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      items.push(`${className}ItemHandler`);
    }

    if (idxCols.length) {
      items.push(`${className}ListHandler`);
    }
    if (
      table.cols.filter((col) => col.pk && col.name !== 'tenant').length === 1
    ) {
      if (!schema.parameters?.[table.name]?.cancel?.batch) {
        items.push(`${className}MultipleHandler`);
      }
    }
    const lines = [];

    lines.push(
      `import { ${items.join(', ')} } from './${kebabCase(table.name)}-query.handler';`,
    );

    lines.push(``);
    lines.push(`export const ${className}Query = [`);
    lines.push(items.map((item) => `  ${item},`).join('\n'));
    lines.push(`];`);
    lines.push(``);

    lines.push(`export {`);
    if (!schema.parameters?.[table.name]?.cancel?.get) {
      lines.push(`  Item${className}Query,`);
    }

    if (
      table.cols.filter((col) => col.pk && col.name !== 'tenant').length === 1
    ) {
      if (!schema.parameters?.[table.name]?.cancel?.batch) {
        lines.push(`  Multiple${className}Query,`);
      }
    }
    if (idxCols.length) {
      lines.push(`  List${className}Query,`);
    }

    lines.push(`} from './${kebabCase(table.name)}-query.class';`);
    lines.push(``);

    const filePath = path.join(
      outDir,
      fileBase,
      'application',
      'queries',
      `index.ts`,
    );
    await writeFileWithDir(filePath, lines.join('\n'));

    indexPaths.push(`export * from './${fileBase}';`);
  }
};

exports.create = create;
