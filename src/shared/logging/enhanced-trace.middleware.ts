import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Enhanced trace middleware that supports debug-by-trace functionality.
 * When the x-debug-trace header is present, it enables debug-level logging
 * for that specific trace only.
 */
@Injectable()
export class EnhancedTraceMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const headerId =
      (req.headers['traceparent'] as string) ||
      (req.headers['x-request-id'] as string) ||
      this.generateTraceId();

    const traceId = this.extractOrNormalizeTraceId(headerId);
    const debugTrace = req.headers['x-debug-trace'] === 'true';

    // Set CLS context
    this.cls.set('traceId', traceId);
    this.cls.set('debugTrace', debugTrace);

    // Set correlation context if provided
    const correlationId = req.headers['x-correlation-id'] as string;
    if (correlationId) {
      this.cls.set('correlationId', correlationId);
    }

    // Set tenant context if provided
    const tenantId = req.headers['x-tenant-id'] as string;
    if (tenantId) {
      this.cls.set('tenantId', tenantId);
    }

    // Set user context if available (from auth)
    const userId = req.headers['x-user-id'] as string;
    if (userId) {
      this.cls.set('userId', userId);
    }

    // Echo trace information in response headers
    res.setHeader('x-request-id', traceId);
    if (correlationId) {
      res.setHeader('x-correlation-id', correlationId);
    }
    if (debugTrace) {
      res.setHeader('x-debug-trace', 'true');
    }

    next();
  }

  private extractOrNormalizeTraceId(headerId: string): string {
    // Handle W3C traceparent format: 00-<trace-id>-<span-id>-<flags>
    if (headerId?.startsWith('00-')) {
      const parts = headerId.split('-');
      if (parts.length >= 2) {
        return parts[1]; // Extract trace-id part
      }
    }

    // Handle other formats or generate new
    return headerId?.split('-')[0] || this.generateTraceId();
  }

  private generateTraceId(): string {
    return randomUUID();
  }
}

/**
 * Conditional debug logger that only logs at debug level when debugTrace is enabled
 */
export function debugByTrace(
  logger: any,
  message: string,
  context: Record<string, any>,
  cls: ClsService,
) {
  const debugTrace = cls.get<boolean>('debugTrace');
  if (debugTrace) {
    logger.debug({ ...context, debugTrace: true }, message);
  }
}

/**
 * Helper to check if debug tracing is enabled for current context
 */
export function isDebugTraceEnabled(cls: ClsService): boolean {
  return cls.get<boolean>('debugTrace') === true;
}
