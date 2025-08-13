import { Injectable, NestMiddleware } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

function extractOrNormalizeTraceId(headerId: string): string {
  // Basic normalization, can be extended for W3C traceparent
  return headerId?.split('-')[0] || randomUUID();
}

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    const headerId =
      (req.headers['traceparent'] as string) ||
      (req.headers['x-request-id'] as string) ||
      randomUUID();
    const traceId = extractOrNormalizeTraceId(headerId);

    // Set basic trace context
    this.cls.set('traceId', traceId);
    this.cls.set('requestStartTime', startTime);

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

    // Monitor request size for performance observability
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      this.cls.set('requestSizeBytes', parseInt(contentLength, 10));
    }

    res.setHeader('x-request-id', traceId);

    // Log request completion with timing
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.cls.set('requestDurationMs', duration);
    });

    next();
  }
}
