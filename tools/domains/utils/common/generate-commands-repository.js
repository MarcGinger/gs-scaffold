const path = require('path');
const {
  writeFileWithDir,
  createIndexFilesFromDirectory,
} = require('../utils/file-utils');
const {
  generateRepository,
} = require('./infrastructure/repository/generate-repository-cleaned');

const { kebabCase } = require('../utils/word-utils');
const { logger } = require('../utils/general-utils');

const create = async (schema) => {
  errors = {};
  const tables = schema.tables;
  const outDir = path.resolve(schema.sourceDirectory);
  for (const [tableId, table] of Object.entries(tables)) {
    if (
      schema.parameters?.[table.name]?.cancel?.create &&
      schema.parameters?.[table.name]?.cancel?.update &&
      schema.parameters?.[table.name]?.cancel?.delete &&
      schema.parameters?.[table.name]?.cancel?.get &&
      schema.parameters?.[table.name]?.cancel?.batch &&
      Object.keys(schema.parameters?.[table.name]?.apis).length === 0
    ) {
      continue;
    }
    if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) {
      logger.warn(`Skipping table ${tableId} due to JSON primary key.`);
      continue;
    }

    const keys = table.cols.filter((col) => col.pk);
    if (keys.length === 0) {
      logger.warn(`Skipping table ${table.name} due to no primary key.`);
      return '';
    }
    let data = '';
    errors[table.name] = {};

    data = await generateRepository(schema, table, errors);

    if (data) {
      const fileBase = kebabCase(table.name);
      const filePath = path.join(
        outDir,
        fileBase,
        'infrastructure',
        'repositories',
        `${fileBase}.repository.ts`,
      );
      if (schema.excluded?.includes(`${fileBase}.repository.ts`)) {
        logger.info(
          `Skipping generation of ${fileBase}.repository.ts as it is excluded.`,
        );
        continue;
      }
      await writeFileWithDir(filePath, data);

      await createIndexFilesFromDirectory(
        path.resolve(outDir, fileBase, 'infrastructure', 'repositories'),
      );
    }
  }
  return errors;
  // await Promise.all([repository(schema)]);
};

exports.create = create;
