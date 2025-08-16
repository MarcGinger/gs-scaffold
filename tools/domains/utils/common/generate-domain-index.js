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

/**
 * Main entry point to generate Domains from a schema
 * @param {Object} schema - The schema object containing tables and relationships
 * @param {Object} [config] - Optional configuration options
 * @returns {Promise<void>}
 */
const create = async (schema, config = {}) => {
  const finalConfig = { ...defaultConfig, ...config };
  const outDir = path.resolve(schema.sourceDirectory);

  const tables = Object.entries(schema.tables);
  for (const [tableId, table] of tables) {
    const tableFile = kebabCase(table.name);

    logger.info('Starting Domain generation...');
    // try {
    await createIndexFilesFromDirectory(
      path.join(schema.sourceDirectory, tableFile, 'domain'),
    );
    await createIndexFilesFromDirectory(
      path.join(schema.sourceDirectory, tableFile, 'application'),
    );

    await createIndexFilesFromDirectory(
      path.join(schema.sourceDirectory, tableFile, 'controllers'),
    );
    logger.success('Domain generation completed successfully');
    // } catch (error) {
    //   logger.error(`Error during Domain generation: ${error.message}`);
    //   throw error;
    // }
  }
};

/**
 * Create index.ts files for exports
 * @param {string} outputDirectory - The directory to create index files for
 * @returns {Promise<void>}
 */

// Export the main entry point and utility functions
exports.create = create;
