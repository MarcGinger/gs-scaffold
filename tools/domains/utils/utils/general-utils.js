/**
 * Logger utility for consistent logging with levels
 */
export const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
};

/**
 * Configuration options for the DTO generator
 */
export const defaultConfig = {
  outputDirName: 'dtos',
  decoratorsSubDir: 'decorators',
};

/**
 * Helper function to add an import to the imports object
 * @param {Object} imports - The imports object
 * @param {string} module - The module to import from
 * @param {string|string[]} symbols - The symbol(s) to import
 */
export function addImport(imports, module, symbols) {
  if (!imports[module]) {
    imports[module] = new Set();
  }

  if (Array.isArray(symbols)) {
    symbols.forEach((symbol) => imports[module].add(symbol));
  } else {
    imports[module].add(symbols);
  }
}

export function getRelationships(schema, table) {
  if (!schema || !table || !table._relationships) {
    return [];
  }
  const res = table._relationships
    // .filter((rel) => rel.isChild && schema.parameters?.[table.name]?.type==='sql')
    .map((rel) => {
      const col = Object.values(schema.tables)
        .find((t) => t.name === rel.childTable)
        ?.cols.find((c) => c.name === rel.childCol);
      return { ...rel, col };
    })
    .filter((rel) => rel.col && rel.col.datatype !== 'JSON');

  return res.filter((rel) => rel.parentTable !== table.name);
}
export function getUniqueRelationships(schema, table) {
  if (!schema || !table || !table._relationships) {
    return [];
  }
  const relationships = getRelationships(schema, table);
  // Remove duplicates where relation.parent is equal
  const uniqueUniqueRelationships = [];
  const seenParents = new Set();
  relationships.forEach((relation) => {
    if (!seenParents.has(relation.parent)) {
      uniqueUniqueRelationships.push(relation);
      seenParents.add(relation.parent);
    }
  });
  return uniqueUniqueRelationships;
}
