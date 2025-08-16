#!/usr/bin/env node
/**
 * generate-update-request-dtos.js
 *
 * A Node.js script to generate NestJS Create and Update Request DTOs
 * from a cleaned JSON schema, using the decorator functions we've created.
 *
 * - All DTO files will be in src/dtos/<entity>/
 * - Creates both CreateRequest and UpdateRequest DTOs
 */
const path = require('path');
const {
  writeFileWithDir,
  copyDirectory,
  deleteDirectory,
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
  pluralize,
} = require('../utils/word-utils');
const { logger, defaultConfig, addImport } = require('../utils/general-utils');

const create = async (schema) => {
  logger.info('Starting event store generation...');
  const tables = Object.values(schema.tables || {})
    .filter(
      (t) =>
        schema.parameters?.[t.name]?.store?.read === 'redis' ||
        schema.parameters?.[t.name]?.store?.write === 'redis',
    )
    .map((t) => t.name);

  if (tables.length || schema.parameters?.services?.redis) {
    logger.info(`Found redis service`);
    await Promise.all([copyFiles(schema)]);
    logger.info('Event store generation completed successfully');
  } else {
    const dirArray = schema.sourceDirectory.split(path.sep);

    dirArray.pop();
    const outDir = path.resolve(dirArray.join(path.sep));
    deleteDirectory(
      path.resolve(outDir, 'infrastructure', 'configuration', 'redis'),
    );
    logger.info(
      'No event stream tables found in schema, skipping event store generation',
    );
    // await Promise.all([indexTs(schema)]);
  }
};

const copyFiles = async (schema) => {
  const dirArray = schema.sourceDirectory.split(path.sep);
  dirArray.pop();
  const dir = path.resolve(dirArray.join(path.sep));
  const outDir = path.resolve(dir, 'shared', 'infrastructure', 'redis');

  copyDirectory(
    path.join(__dirname, '../', 'files', 'infrastructure', 'redis'),
    outDir,
  );
};

// const redisConfigModule = async (schema) => {
//   const dirArray = schema.sourceDirectory.split(path.sep);
//   dirArray.pop();
//   const dir = path.resolve(dirArray.join(path.sep));
//   const outDir = path.resolve(dir, 'shared', 'infrastructure', 'redis');

//   copyDirectory(
//     path.join(__dirname, '../', 'files', 'infrastructure', 'redis'),
//     outDir,
//   );
// };
// Export the main entry point
module.exports = { create };
