// structured-logger.ts
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

export const Log = {
  info(logger: Logger, msg: string, ctx: Record<string, any>) {
    logger.info({ ...ctx, msg });
  },
  warn(logger: Logger, msg: string, ctx: Record<string, any>) {
    logger.warn({ ...ctx, msg });
  },
  error(logger: Logger, err: unknown, msg: string, ctx: Record<string, any>) {
    logger.error({ ...ctx, err }, msg);
  },
  esdbProjectionStarted(logger: Logger, ctx: EsdbCtx) {
    logger.info({ ...ctx, msg: 'Projection setup completed' });
  },
  esdbCatchupNotFound(logger: Logger, ctx: EsdbCtx) {
    logger.info({
      ...ctx,
      expected: true,
      msg: 'Category stream not found yet; waiting for first event',
    });
  },
  bullQueued(logger: Logger, ctx: BullCtx) {
    logger.info({ ...ctx, msg: 'Job queued' });
  },
  bullFailed(logger: Logger, err: unknown, ctx: BullCtx) {
    logger.error({ ...ctx, err, msg: 'Job failed' });
  },
};
