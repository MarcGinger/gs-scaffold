function isJoinTableValid(lookupTypeStore, lookupStore) {
  const existsInSql = (store) => {
    if (store.read === 'sql') return true;
    if (store.write === 'sql') return true;
    return false;
  };

  return existsInSql(lookupTypeStore) && existsInSql(lookupStore);
}

/**
 * Utility to build import statements from an imports object.
 * @param {Object} imports - The imports object (module: Set of symbols)
 * @returns {string} - The import statements as a string
 */
function buildImportLines(imports) {
  return (
    Object.entries(imports)
      .map(([mod, syms]) => {
        if (syms.size) {
          return `import { ${Array.from(syms).sort().join(', ')} } from '${mod}';`;
        }
      })
      .filter(Boolean)
      .join('\n') + '\n'
  );
}

/**
 * Utility to determine if a table should be skipped (e.g., JSON PK or no PK)
 * @param {Object} table - The table object
 * @param {Object} schema - The schema object
 * @returns {boolean}
 */
function shouldSkipTable(table, schema) {
  if (table.cols.find((col) => col.pk && col.datatype === 'JSON')) return true;
  if (!table.cols.filter((col) => col.pk).length) return true;
  // if (
  //   schema.parameters?.[table.name]?.cancel?.create &&
  //   schema.parameters?.[table.name]?.cancel?.update &&
  //   schema.parameters?.[table.name]?.cancel?.delete
  // )
  //   return true;
  return false;
}

async function handleStep(key, fn, errors) {
  try {
    const result = await fn(schema);

    if (result && typeof result === 'object') {
      for (const [subKey, subValue] of Object.entries(result)) {
        // Ensure the top-level key exists and is an object
        if (!errors[subKey] || typeof errors[subKey] !== 'object') {
          errors[subKey] = {};
        }

        // Merge the nested errors
        Object.assign(errors[subKey], subValue);
      }
    }
  } catch (err) {
    errors[key] = {
      unexpected: {
        message: err?.message || 'Unexpected error',
        description: 'An exception occurred during processing.',
        code: 'UNEXPECTED_ERROR',
        exception: err?.name || 'InternalServerErrorException',
        statusCode: err?.status || 500,
      },
    };
  }
  return errors;
}

module.exports = {
  buildImportLines,
  shouldSkipTable,
  isJoinTableValid,
  handleStep,
};
