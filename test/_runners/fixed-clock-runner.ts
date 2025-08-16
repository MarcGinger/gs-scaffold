import { FixedClock } from '../../src/shared/time/clock';

const fc = new FixedClock('2025-08-16T10:00:00Z');
console.log('nowIso:', fc.nowIso());
console.log('nowMs:', fc.nowMs());
const d = fc.now();
d.setUTCFullYear(2000);
console.log('after mutation nowIso:', fc.nowIso());
fc.advance(-60000);
console.log('after advance nowIso:', fc.nowIso());
try {
  // @ts-ignore
  fc.set('not-a-date');
  console.log('set did not throw (unexpected)');
} catch (e) {
  console.log('set threw as expected');
}
