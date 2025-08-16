// Shared clock interface and simple implementations used by domain code.
// Keep this file free of Nest/DI concerns — providers belong in infrastructure.

export type IsoDateString = string;

export interface Clock {
  // Returns a Date object. Implementations should return a defensive copy.
  now(): Date;

  // ISO-8601 UTC string for use in event metadata (toISOString())
  nowIso(): IsoDateString;

  // Optional numeric epoch millis for hot paths that prefer numbers over Date objects.
  nowMs?(): number;
}

/**
 * SystemClock - production clock backed by system time.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): IsoDateString {
    return this.now().toISOString();
  }

  nowMs(): number {
    return Date.now();
  }
}

/**
 * FixedClock - deterministic clock for tests and replays.
 *
 * Behavior notes:
 * - Constructor accepts a `Date` or ISO date string and clones it.
 * - `now()` returns defensive copies so callers cannot mutate internal state.
 * - `advance(ms)` moves the internal clock forward by the provided milliseconds.
 */
export class FixedClock implements Clock {
  private current: Date;

  constructor(current: Date | string) {
    const d = new Date(current);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid date passed to FixedClock: ${String(current)}`);
    }
    this.current = d;
  }

  now(): Date {
    // Return a copy to avoid external mutation of the internal clock state.
    return new Date(this.current.getTime());
  }

  nowIso(): IsoDateString {
    return this.now().toISOString();
  }

  nowMs(): number {
    return this.current.getTime();
  }

  set(d: Date | string): void {
    const next = new Date(d);
    if (Number.isNaN(next.getTime())) {
      throw new Error(`Invalid date passed to FixedClock.set: ${String(d)}`);
    }
    this.current = next;
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms)) {
      throw new Error('advance(ms) requires a finite, numeric argument');
    }
    this.current = new Date(this.current.getTime() + ms);
  }
}

// Export a default SystemClock instance only for convenience in small scripts.
// Prefer injecting the Clock in domain code rather than importing this.
export const systemClock = new SystemClock();
