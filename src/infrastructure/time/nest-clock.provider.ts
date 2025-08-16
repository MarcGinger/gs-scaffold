import { Provider, Scope } from '@nestjs/common';
import { SystemClock } from '../../shared/time/clock';

export const CLOCK = Symbol('CLOCK');

// Singleton provider (default) - cheap and suitable in most apps
export const ClockProvider: Provider = {
  provide: CLOCK,
  useClass: SystemClock,
};

// Optional request-scoped provider - one instance per request. Use only when
// you need per-request variability (e.g., tests injecting different clocks
// per request). Request scope has runtime overhead.
export const ClockProviderRequestScoped: Provider = {
  provide: CLOCK,
  useClass: SystemClock,
  scope: Scope.REQUEST,
};
