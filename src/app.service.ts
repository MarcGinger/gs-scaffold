import { Injectable, Inject } from '@nestjs/common';
import type { Logger } from 'pino';
import { Log } from './shared/logging/structured-logger';

@Injectable()
export class AppService {
  constructor(@Inject('APP_LOGGER') private readonly logger: Logger) {}

  getHello(): string {
    Log.info(this.logger, 'AppService.getHello called', {
      service: 'gs-scaffold',
      component: 'AppService',
      method: 'getHello',
    });
    return 'Hello World!';
  }
}
