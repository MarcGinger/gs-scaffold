import { FixedClock } from '../../../src/shared/time/clock';

describe('FixedClock', () => {
  test('happy path: nowIso and nowMs reflect constructor value', () => {
    const fc = new FixedClock('2025-08-16T10:00:00Z');
    expect(fc.nowIso()).toBe('2025-08-16T10:00:00.000Z');
    expect(fc.nowMs()).toBe(new Date('2025-08-16T10:00:00Z').getTime());
  });

  test('defensive copy: mutating returned Date does not change internal state', () => {
    const fc = new FixedClock('2025-08-16T10:00:00Z');
    const d = fc.now();
    d.setUTCFullYear(2000);
    // internal state should remain 2025
    expect(fc.nowIso()).toBe('2025-08-16T10:00:00.000Z');
  });

  test('advance(0) is a no-op', () => {
    const fc = new FixedClock('2025-08-16T10:00:00Z');
    fc.advance(0);
    expect(fc.nowIso()).toBe('2025-08-16T10:00:00.000Z');
  });

  test('advance(negative) moves clock backwards', () => {
    const fc = new FixedClock('2025-08-16T10:00:00Z');
    fc.advance(-60 * 1000); // back one minute
    expect(fc.nowIso()).toBe('2025-08-16T09:59:00.000Z');
  });

  test('set invalid date throws', () => {
    const fc = new FixedClock('2025-08-16T10:00:00Z');
    // @ts-ignore allow invalid type for test
    expect(() => fc.set('not-a-date')).toThrow();
  });

  test('constructor invalid date throws', () => {
    // @ts-ignore allow invalid type for test
    expect(() => new FixedClock('not-a-date')).toThrow();
  });
});
