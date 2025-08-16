type PlainObject = Record<string, any>;
export type Mergeable = PlainObject | any[];

/**
 * Deeply merges `source` into `target`, returning a new object.
 * - Plain objects and arrays are merged recursively.
 * - Other values are overwritten by `source`.
 *
 * @param target The target object or array.
 * @param source The source object or array.
 * @returns A new object/array with merged properties.
 */
export function coreDeepMerge<T extends Mergeable, S extends Mergeable>(
  target: T,
  source: S,
): T | S {
  // Helper: checks if a value is a plain object or array
  const isObjectOrArray = (val: unknown): val is Mergeable => {
    return (
      val !== null &&
      typeof val === 'object' &&
      (Array.isArray(val) || Object.getPrototypeOf(val) === Object.prototype)
    );
  };

  // Helper: shallow clone for primitives, arrays, and plain objects
  const cloneValue = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      return val.map(cloneValue);
    } else if (isObjectOrArray(val)) {
      return Object.keys(val).reduce((acc, key) => {
        acc[key] = cloneValue(val[key]);
        return acc;
      }, {} as PlainObject);
    }
    return val; // primitives (string, number, boolean, null, undefined)
  };

  // If either is not an object/array, source wins
  if (!isObjectOrArray(target) || !isObjectOrArray(source)) {
    return cloneValue(source) as S;
  }

  // Decide whether result should be an array or object
  const result: Mergeable =
    Array.isArray(target) && Array.isArray(source) ? [] : { ...target };

  // Iterate through source keys
  for (const key of Object.keys(source)) {
    const srcVal = source[key] as unknown;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const tgtVal = (result as PlainObject)[key];

    // If both values are mergeable, recurse
    if (isObjectOrArray(tgtVal) && isObjectOrArray(srcVal)) {
      (result as PlainObject)[key] = coreDeepMerge(tgtVal, srcVal);
    } else {
      // Otherwise, overwrite with a cloned source value
      (result as PlainObject)[key] = cloneValue(srcVal);
    }
  }

  return result as T | S;
}
