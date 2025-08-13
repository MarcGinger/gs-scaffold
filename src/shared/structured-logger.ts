// structured-logger.ts
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
  retry?: {
    attempt: number;
    backoffMs: number;
  };
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
    logger.info(ctx, 'HTTP request completed');
  },
  httpError(
    logger: Logger,
    err: unknown,
    ctx: BaseCtx & { method: string; url: string; statusCode: number },
  ) {
    logger.error({ ...ctx, err }, 'HTTP request failed');
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
    logger.warn(ctx, 'Job retrying');
  },
};

// Rate-limited warning helper
const warnCache = new Map<string, number>();

export function warnRateLimited(
  logger: Logger,
  key: string,
  msg: string,
  ctx: BaseCtx & Record<string, any>,
  minMs = 60000,
) {
  const now = Date.now();
  const lastWarn = warnCache.get(key) ?? 0;

  if (now - lastWarn >= minMs) {
    warnCache.set(key, now);
    Log.warn(logger, msg, ctx);
  }
}
