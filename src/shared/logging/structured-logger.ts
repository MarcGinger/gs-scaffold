import type { Logger } from 'pino';

// Base context for all logs - service and component are now optional
// since they can be provided automatically by the logger
export type BaseCtx = {
  service?: string;
  component?: string;
  method: string;
  expected?: boolean;
  timingMs?: number;
};

// Enhanced context type for when service/component are required
export type RequiredBaseCtx = {
  service: string;
  component: string;
  method: string;
  expected?: boolean;
  timingMs?: number;
};

// Enhanced context type for use with component loggers
// where service and component are provided automatically
export type MinimalCtx = {
  method: string;
  expected?: boolean;
  timingMs?: number;
};

export type EsdbCtx = BaseCtx & {
  esdb?: {
    category?: string;
    stream?: string;
    subscription?: string;
    eventId?: string;
  };
};

export type BullCtx = BaseCtx & {
  bull?: { queue: string; jobId?: string; attempt?: number };
};

export type RetryCtx = {
  retry?: { attempt: number; backoffMs: number };
};

export const Log = {
  info(logger: Logger, msg: string, ctx: BaseCtx & Record<string, any>) {
    logger.info(ctx, msg);
  },
  warn(
    logger: Logger,
    msg: string,
    ctx: BaseCtx & RetryCtx & Record<string, any>,
  ) {
    logger.warn(ctx, msg);
  },
  error(
    logger: Logger,
    err: unknown,
    msg: string,
    ctx: BaseCtx & RetryCtx & Record<string, any>,
  ) {
    logger.error({ ...ctx, err }, msg);
  },
  debug(logger: Logger, msg: string, ctx: BaseCtx & Record<string, any>) {
    logger.debug(ctx, msg);
  },

  // Enhanced helpers for component loggers (service/component optional)
  minimal: {
    info(logger: Logger, msg: string, ctx: MinimalCtx & Record<string, any>) {
      logger.info(ctx, msg);
    },
    warn(
      logger: Logger,
      msg: string,
      ctx: MinimalCtx & RetryCtx & Record<string, any>,
    ) {
      logger.warn(ctx, msg);
    },
    error(
      logger: Logger,
      err: unknown,
      msg: string,
      ctx: MinimalCtx & RetryCtx & Record<string, any>,
    ) {
      logger.error({ ...ctx, err }, msg);
    },
    debug(logger: Logger, msg: string, ctx: MinimalCtx & Record<string, any>) {
      logger.debug(ctx, msg);
    },
  },

  // EventStore-specific helpers
  esdbProjectionStarted(logger: Logger, ctx: EsdbCtx) {
    logger.info(ctx, 'Projection setup completed');
  },
  esdbCatchupNotFound(logger: Logger, ctx: EsdbCtx) {
    logger.info(
      {
        ...ctx,
        expected: true,
      },
      'Category stream not found yet; waiting for first event',
    );
  },

  // BullMQ-specific helpers
  bullQueued(logger: Logger, ctx: BullCtx) {
    logger.info(ctx, 'Job queued');
  },
  bullFailed(logger: Logger, err: unknown, ctx: BullCtx & RetryCtx) {
    logger.error({ ...ctx, err }, 'Job failed');
  },
  bullRetry(logger: Logger, ctx: BullCtx & RetryCtx) {
    logger.warn(ctx, 'Job retry attempt');
  },

  // HTTP-specific helpers
  httpRequest(
    logger: Logger,
    ctx: BaseCtx & {
      method: string;
      url: string;
      statusCode: number;
      timingMs: number;
    },
  ) {
    logger.info(ctx, `${ctx.method} ${ctx.url} ${ctx.statusCode}`);
  },
  httpError(
    logger: Logger,
    err: unknown,
    ctx: BaseCtx & { method: string; url: string; statusCode: number },
  ) {
    logger.error(
      { ...ctx, err },
      `${ctx.method} ${ctx.url} ${ctx.statusCode} failed`,
    );
  },

  // Performance monitoring helpers
  perfSummary(
    logger: Logger,
    operation: string,
    ctx: BaseCtx & {
      processed: number;
      errors: number;
      timingMs: number;
      throughputPerSec?: number;
    },
  ) {
    logger.info(
      {
        ...ctx,
        performance: {
          operation,
          processed: ctx.processed,
          errors: ctx.errors,
          throughputPerSec:
            ctx.throughputPerSec || ctx.processed / (ctx.timingMs / 1000),
        },
      },
      `Performance summary: ${operation}`,
    );
  },

  // Memory usage tracking
  memoryUsage(logger: Logger, ctx: BaseCtx) {
    const usage = process.memoryUsage();
    logger.debug(
      {
        ...ctx,
        memory: {
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
          externalMB: Math.round(usage.external / 1024 / 1024),
          rssMB: Math.round(usage.rss / 1024 / 1024),
        },
      },
      'Memory usage snapshot',
    );
  },
};

/**
 * Rate-limited warning helper to prevent log spam
 */
const lastWarns = new Map<string, number>();
export function warnRateLimited(
  logger: Logger,
  key: string,
  msg: string,
  ctx: BaseCtx & Record<string, any>,
  minMs = 60000,
) {
  const now = Date.now();
  if ((lastWarns.get(key) ?? 0) + minMs < now) {
    Log.warn(logger, msg, {
      ...ctx,
      rateLimited: true,
      lastWarnedMs: lastWarns.get(key),
    });
    lastWarns.set(key, now);
  }
}

/**
 * Enhanced rate-limited helper with count tracking
 */
const warnCounts = new Map<string, { count: number; lastEmitted: number }>();
export function warnRateLimitedWithCount(
  logger: Logger,
  key: string,
  msg: string,
  ctx: BaseCtx & Record<string, any>,
  minMs = 60000,
) {
  const now = Date.now();
  const current = warnCounts.get(key) || { count: 0, lastEmitted: 0 };
  current.count++;

  if (current.lastEmitted + minMs < now) {
    Log.warn(logger, msg, {
      ...ctx,
      rateLimited: true,
      suppressedCount: current.count - 1,
      suppressedDurationMs: now - current.lastEmitted,
    });
    warnCounts.set(key, { count: 0, lastEmitted: now });
  } else {
    warnCounts.set(key, current);
  }
}
