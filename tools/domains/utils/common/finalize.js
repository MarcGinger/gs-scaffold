#!/usr/bin/env node
/**
 * generate-entities.js
 *
 * A Node.js script to generate NestJS TypeORM entity classes
 * from a cleaned JSON schema, including enums and relations.
 *
 * Usage: node generate-entities.js
 */
const path = require('path');
const {
  copyDirectory,
  deleteEmptyDirectories,
  directoryExists,
} = require('../utils/file-utils');
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
  snakeCase,
} = require('../utils/word-utils');
const { logger, defaultConfig, addImport } = require('../utils/general-utils');

const create = async (schema) => {
  const dirArray = schema.sourceDirectory.split(path.sep);

  dirArray.pop();
  const outDir = path.resolve(dirArray.join(path.sep));

  await Promise.all([copyCommon(schema), deleteEmptyDirectories(outDir)]);
};

const copyCommon = async (schema) => {
  const dirArray = schema.sourceDirectory.split(path.sep);

  copyList = [`shared`, `health`, 'docs'];
  (exclusionList = [
    // 'redis-config.module.ts',
    // 'typeorm-config.service.ts',
    // 'typeorm-config.service.spec.ts',
  ]),
    dirArray.pop();

  for (const item of copyList) {
    const outDir = path.resolve(dirArray.join(path.sep), item);

    await copyDirectory(
      path.join(__dirname, '../', 'files', item),
      outDir,
      exclusionList,
    );

    // createIndexFilesFromDirectory(outDir);
  }
};

exports.create = create;
