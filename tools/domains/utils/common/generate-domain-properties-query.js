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

const create = async (schema) => {
  const indexPaths = [];
  const outDir = path.resolve(schema.sourceDirectory);
  const tables = schema.tables;
  for (const [tableId, table] of Object.entries(tables)) {
    if (shouldSkipTable(table, schema)) {
      logger.warn(`Skipping table ${tableId} due to skip logic.`);
      continue;
    }
    const name = table.name;
    const className = upperFirst(camelCase(name));
    // COMMON IMPORTS

    const imports = {};

    imports[`src/shared/domain/properties`] = new Set(['IList', 'IListOption']);
    imports[`./list-${kebabCase(name)}.model`] = new Set([
      `List${className}Props`,
    ]);

    const indexes = table.indexes || [];
    const idxCols = indexes
      .flatMap((idx) => idx.cols.map((c) => c.colid))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => table.cols.find((c) => c.id === id))
      .filter(Boolean);
    const lines = [`// generate-domain-properties-query`];
    lines.push(`export enum List${className}OrderEnum {`);
    idxCols
      .filter((col) => col.name !== 'tenant')
      .map((col) => {
        lines.push(`  ${camelCase(col.name)} = '${camelCase(col.name)}',`);
      });
    lines.push('}');
    lines.push('');
    lines.push(
      `export interface List${className}PropsOptions extends IListOption {`,
    );

    idxCols
      .filter((col) => col.name !== 'tenant')
      .map((col) => {
        lines.push(`  readonly ${camelCase(col.name)}?: ${col.type};`);
      });
    lines.push(`  orderBy?: List${className}OrderEnum;`);
    lines.push('}');
    lines.push('');

    lines.push(
      `export class ${className}Page extends IList<List${className}Props> {}`,
    );
    lines.push('');

    // Build import statements
    const importTs = buildImportLines(imports);
    const resDto = `${importTs}${lines.join('\n')}`;
    if (schema.excluded?.includes(`query-${kebabCase(name)}.model.ts`)) {
      logger.info(
        `Skipping generation of query-${kebabCase(name)}.model.ts as it is excluded.`,
      );
      continue;
    }
    await writeFileWithDir(
      path.join(
        outDir,
        kebabCase(name),
        'domain',
        `properties`,
        `query-${kebabCase(name)}.model.ts`,
      ),
      resDto,
    );

    indexPaths.push(
      `export {
  ${className}Page,
  List${className}PropsOptions,
  List${className}OrderEnum,
} from './${kebabCase(name)}/${kebabCase(name)}-query.model';`,
    );
  }
};

exports.create = create;
