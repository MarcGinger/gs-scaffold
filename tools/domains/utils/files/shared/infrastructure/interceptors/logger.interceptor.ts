import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ILogger } from 'src/shared/logger';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject('ILogger') protected readonly logger: ILogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<IRequest>();

    const ip = this.getIP(request);

    this.logger.log(
      {
        message: `Incoming Request on ${request.path}`,
        method: request.method,
        ip,
      },
      `Incoming Request on ${request.path}`,
    );

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          {
            method: request.method,
            ip,
            duration: Date.now() - now,
          },
          `End Request for ${request.path}`,
        );
      }),
    );
  }

  private getIP(request: IRequest): string {
    let ip: string;
    const ipAddr = request.headers['x-forwarded-for'];
    if (ipAddr) {
      const list = ipAddr.split(',');
      ip = list[list.length - 1];
    } else {
      ip = request.connection.remoteAddress;
    }
    return ip.replace('::ffff:', '');
  }
}

interface IRequest {
  path: string;
  method: string;
  headers: { [key: string]: string };
  connection: { remoteAddress: string };
}
