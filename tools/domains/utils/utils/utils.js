export function kebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase to camel-Case
    .replace(/\s+/g, '-') // spaces to dashes
    .replace(/_+/g, '-') // underscores to dashes
    .toLowerCase();
}

export function upperFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function camelCase(str) {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (match) => match.toLowerCase());
}
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

export function singularize(word) {
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  } else if (word.endsWith('s')) {
    return word.slice(0, -1);
  }
  return word;
}

export function sentenceCase(str) {
  const lower = str
    .split(/(?=[A-Z])/)
    .join(' ')
    .toLowerCase();
  return upperFirst(lower); // Capitalize the first letter
}

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
