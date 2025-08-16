import { coreDifference, deepEqual, deepCompare } from '../core-difference';

describe('coreDifference', () => {
  it('returns target if source is empty', () => {
    expect(coreDifference({}, { a: 1 })).toEqual({ a: 1 });
    expect(coreDifference(null as any, { a: 1 })).toEqual({ a: 1 });
  });

  it('returns only changed keys (primitives)', () => {
    expect(coreDifference({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: 3 });
  });

  it('returns only changed keys (nested objects)', () => {
    expect(
      coreDifference({ a: { x: 1, y: 2 }, b: 2 }, { a: { x: 1, y: 3 }, b: 2 }),
    ).toEqual({ a: { y: 3 } });
  });

  it('returns only changed keys (arrays)', () => {
    expect(coreDifference({ a: [1, 2] }, { a: [1, 3] })).toEqual({ a: [1, 3] });
    expect(coreDifference({ a: [1, 2] }, { a: [1, 2] })).toEqual({});
  });

  it('returns added keys in target', () => {
    expect(coreDifference({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: 2 });
  });

  it('handles deeply nested objects and arrays', () => {
    const source = { a: { b: { c: [1, 2, 3] } } };
    const target = { a: { b: { c: [1, 2, 4] } } };
    expect(coreDifference(source, target)).toEqual({
      a: { b: { c: [1, 2, 4] } },
    });
  });

  it('handles type changes (object to primitive, etc.)', () => {
    expect(coreDifference({ a: { x: 1 } }, { a: 2 })).toEqual({ a: 2 });
    expect(coreDifference({ a: 1 }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
  });

  it('handles undefined in source', () => {
    expect(coreDifference({ a: undefined }, { a: 1 })).toEqual({ a: 1 });
  });

  it('handles arrays of objects', () => {
    expect(
      coreDifference({ a: [{ x: 1 }, { y: 2 }] }, { a: [{ x: 1 }, { y: 3 }] }),
    ).toEqual({ a: [{ x: 1 }, { y: 3 }] });
  });

  it('handles case where source[key] is object and target[key] is array', () => {
    // source[key] is object, target[key] is array
    const source = { a: { x: 1 } };
    const target = { a: [1, 2, 3] };
    expect(coreDifference(source, target)).toEqual({ a: [1, 2, 3] });
  });

  it('covers the branch where target[key] is undefined and source[key] !== target[key]', () => {
    // This test is crafted to ensure the if (target[key] === undefined) { diff[key] = source[key]; } path is taken
    // The only way for this to be hit is if source has a key, target has the key as undefined, and source[key] !== undefined
    // The result should be { a: 5 } because the diff is set to source[key]
    const source = { a: 5 };
    const target = { a: undefined };
    expect(coreDifference(source, target)).toEqual({ a: 5 });
  });
});

describe('deepEqual', () => {
  it('returns true for primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
  });

  it('returns true for equal arrays', () => {
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });

  it('returns true for equal objects', () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns true for equal dates', () => {
    expect(deepEqual(new Date('2020-01-01'), new Date('2020-01-01'))).toBe(
      true,
    );
    expect(deepEqual(new Date('2020-01-01'), new Date('2020-01-02'))).toBe(
      false,
    );
  });

  it('returns false for different keys', () => {
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('returns false for different types', () => {
    expect(deepEqual({ a: 1 }, [1])).toBe(false);
    expect(deepEqual(1, '1')).toBe(false);
  });

  it('returns false for objects with different number of keys', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('deepCompare', () => {
  it('returns true for equal arrays', () => {
    expect(deepCompare([1, 2], [1, 2])).toBe(true);
  });
  it('returns false for different length', () => {
    expect(deepCompare([1, 2], [1, 2, 3])).toBe(false);
  });
  it('returns false for different elements', () => {
    expect(deepCompare([1, 2], [2, 1])).toBe(false);
  });
  it('returns true for deeply equal arrays', () => {
    expect(deepCompare([{ a: 1 }], [{ a: 1 }])).toBe(true);
  });
  it('returns false for deeply different arrays', () => {
    expect(deepCompare([{ a: 1 }], [{ a: 2 }])).toBe(false);
  });
});
