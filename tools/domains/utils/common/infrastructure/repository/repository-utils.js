const path = require('path');

const { upperFirst, camelCase } = require('../../../utils/word-utils');

const {
  getComplexObjects,
  getSpecialColumns,
} = require('../../utils/model-utils');

/**
 * Helper function to extract common table properties used across repository generators
 * @param {Object} schema - The database schema
 * @param {Object} table - The table definition
 * @returns {Object} Common table properties
 */
const getTableProperties = (schema, table) => {
  const className = upperFirst(camelCase(table.name));
  const primaryCol = table.cols.find((col) => col.name !== 'tenant' && col.pk);
  const primaryCols = table.cols
    .filter((col) => col.name !== 'tenant')
    .filter((col) => col.pk);

  const fieldCols = table.cols
    .filter((col) => col.name !== 'tenant')
    .map((col) => {
      const relationship = table._relationships.find(
        (r) => r.isChild && r.childCol === col.name,
      );
      return { ...col, relationship };
    })
    .filter((col) => col);

  const indexes = table.indexes || [];
  const idxCols = indexes
    .flatMap((idx) =>
      idx.cols
        .filter((col) => col.name !== 'tenant')
        .map((c) => ({
          col: table.cols
            .filter((col) => col.name !== 'tenant')
            .find((col) => col.id === c.colid),
          idx,
        })),
    )
    .filter(({ col }) => col)
    .map(({ col, idx }) => ({ ...col, idx }));

  return {
    className,
    primaryCol,
    primaryCols,
    fieldCols,
    idxCols,
    complexObjects: getComplexObjects(schema, table),
    specialCols: getSpecialColumns(schema, table),
  };
};

/**
 * Helper function to check if hydration requires async operations
 * @param {Array} complexObjects - Array of complex objects
 * @param {Array} specialCols - Array of special columns
 * @returns {boolean} Whether async hydration is needed
 */
const hasComplexHydration = (complexObjects, specialCols) =>
  [...complexObjects, ...specialCols].length > 0;

module.exports = {
  getTableProperties,
  hasComplexHydration,
};
