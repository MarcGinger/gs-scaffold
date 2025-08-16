/**
 * Generator for event store services
 * Creates NestJS services for managing event streams from tables in the schema
 */
const path = require('path');
const {
  writeFileWithDir,
  readFileWithDir,
  createIndexFilesFromDirectory,
  copyDirectory,
} = require('../utils/file-utils');
const { buildImportLines } = require('../utils/generator-utils');

const { upperFirst, camelCase } = require('../utils/word-utils');
const { logger, addImport } = require('../utils/general-utils');

/**
 * Main entry point for creating event store services
 * @param {Object} schema - The database schema containing tables and parameters
 */
const create = async (schema) => {
  logger.info('Starting event store generation...');
  const tables = Object.values(schema.tables || {})
    .filter(
      (t) =>
        schema.parameters?.[t.name]?.store?.read === 'eventstream' ||
        schema.parameters?.[t.name]?.store?.write === 'eventstream',
    )
    .map((t) => t.name);

  if (tables.length) {
    logger.info(
      `Found ${tables.length} event stream tables: ${tables.join(', ')}`,
    );
    await Promise.all([
      // listService(schema),
      copyEventStreamFiles(schema),
      // eventstreamShared(schema),
    ]);
    logger.info('Event store generation completed successfully');

    await createIndexFilesFromDirectory(
      path.resolve(schema.sourceDirectory, 'event-stream'),
      ['esdb-event-stream.ts'],
    );
  } else {
    logger.info(
      'No event stream tables found in schema, skipping event store generation',
    );
    // await Promise.all([indexTs(schema)]);
  }
};

const getSharedPath = (schema) => {
  const outArray = schema.sourceDirectory.split(path.sep);
  outArray.pop(); // Remove last element (usually 'src')
  return outArray.join(path.sep);
};

const copyEventStreamFiles = async (schema) => {
  const outDir = path.resolve(
    getSharedPath(schema),
    'shared',
    'infrastructure',
    'event-store',
  );

  await copyDirectory(
    path.join(
      __dirname,
      '../',
      'files',
      'shared',
      'infrastructure',
      'event-store',
    ),
    outDir,
    ['in-memory-event-stream.ts'],
  );
};

// Export the create function as the main module API
exports.create = create;
