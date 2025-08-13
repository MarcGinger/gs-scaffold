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
    const headerId =
      (req.headers['traceparent'] as string) ||
      (req.headers['x-request-id'] as string) ||
      randomUUID();
    const traceId = extractOrNormalizeTraceId(headerId);
    this.cls.set('traceId', traceId);
    res.setHeader('x-request-id', traceId);
    next();
  }
}
