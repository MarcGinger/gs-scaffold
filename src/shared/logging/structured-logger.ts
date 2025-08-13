import type { Logger } from 'pino';

export type BaseCtx = {
  service: string;
  component: string;
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
    logger.info({ ...ctx }, msg);
  },
  warn(
    logger: Logger,
    msg: string,
    ctx: BaseCtx & RetryCtx & Record<string, any>,
  ) {
    logger.warn({ ...ctx }, msg);
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
    logger.debug({ ...ctx }, msg);
  },
  esdbProjectionStarted(logger: Logger, ctx: EsdbCtx) {
    logger.info({ ...ctx }, 'Projection setup completed');
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
  bullQueued(logger: Logger, ctx: BullCtx) {
    logger.info({ ...ctx }, 'Job queued');
  },
  bullFailed(logger: Logger, err: unknown, ctx: BullCtx & RetryCtx) {
    logger.error({ ...ctx, err }, 'Job failed');
  },
  bullRetry(logger: Logger, ctx: BullCtx & RetryCtx) {
    logger.warn({ ...ctx }, 'Job retry attempt');
  },
  httpRequest(
    logger: Logger,
    ctx: BaseCtx & {
      method: string;
      url: string;
      statusCode: number;
      timingMs: number;
    },
  ) {
    logger.info({ ...ctx }, `${ctx.method} ${ctx.url} ${ctx.statusCode}`);
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
    Log.warn(logger, msg, ctx);
    lastWarns.set(key, now);
  }
}
