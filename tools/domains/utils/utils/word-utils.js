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

export function snakeCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase to snake_case
    .replace(/\s+/g, '_') // spaces to underscores
    .replace(/-+/g, '_') // dashes to underscores
    .toLowerCase();
}

export function singularize(word) {
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  } else if (word.endsWith('s')) {
    return word.slice(0, -1);
  }
  return word;
}

export function pluralize(word) {
  if (word.endsWith('y')) {
    if (
      word.length > 1 &&
      'aeiou'.includes(word[word.length - 2].toLowerCase())
    ) {
      return word + 's'; // If the letter before 'y' is a vowel, just add 's'
    }
    return word.slice(0, -1) + 'ies';
  } else if (!word.endsWith('s')) {
    return word + 's';
  }
  return word;
}

export function sentenceCase(str) {
  const lower = str
    .split(/(?=[A-Z])/)
    .join(' ')
    .split(/[-_\s]+/)
    .join(' ')
    .toLowerCase();
  return upperFirst(lower); // Capitalize the first letter
}
