/**
 * Deeply diff `source` against `target`, returning only the keys
 * where they differ.  If a nested object/array has no differences,
 * it will be omitted from the result.
 *
 * @param source  The “original” object (or array).
 * @param target  The “new” object (or array).
 * @returns       A partial object/array of only the changed keys.
 */

import { Mergeable } from './core-deepmerge';

export function coreDifference<T extends Mergeable, S extends Mergeable, R>(
  source: T,
  target: S,
): R {
  const diff: Record<string, unknown> = {};
  if (!source || Object.keys(source).length === 0) {
    // If source is empty, return target as the diff
    return target as unknown as R;
  }
  for (const key of Object.keys({ ...source })) {
    if (typeof source[key] === 'object' && typeof target[key] === 'object') {
      // Recursively compare nested objects
      if (Array.isArray(source[key])) {
        if (Array.isArray(target[key])) {
          if (!deepCompare(source[key], target[key])) {
            diff[key] = target[key];
          }
        }
      } else if (Array.isArray(target[key])) {
        diff[key] = target[key];
      } else {
        const t = source[key] as Record<string, unknown>;
        const s = target[key] as Record<string, unknown>;
        const nestedDiff = coreDifference(t, s);
        if (nestedDiff && Object.keys(nestedDiff).length > 0) {
          diff[key] = nestedDiff;
        }
      }
    } else if (typeof target[key] === 'object') {
      diff[key] = target[key];
    } else if (
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== target[key]
    ) {
      if (source[key] !== target[key]) {
        if (target[key] !== undefined) {
          // Values are different
          diff[key] = target[key];
        } else {
          // Key exists in source but not in target
          diff[key] = source[key];
        }
      }
    }
  }
  for (const key of Object.keys({ ...target })) {
    if (
      !Object.prototype.hasOwnProperty.call(source, key) &&
      target[key] !== undefined
    ) {
      // Key exists in target but not in source
      diff[key] = target[key];
    }
  }
  return diff as R;
}

/**
 * Deeply compares two values for equality.
 * - Primitives are compared with ===
 * - Dates by their time value
 * - Arrays by element-wise deep comparison
 * - Plain objects by key-wise deep comparison
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  // Handle Dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    return deepCompare(a, b);
  }

  // Handle plain objects
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!bKeys.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  // Fallback: not equal
  return false;
}

/**
 * Deeply compares two arrays for equality.
 * Returns true if:
 *  - same length
 *  - for each index i, deepEqual(a[i], b[i]) is true
 */
export function deepCompare<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/** Check for plain object (not array, date, etc.) */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
