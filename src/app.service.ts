import { Injectable, Inject } from '@nestjs/common';
import type { Logger } from 'pino';
import { Log } from './shared/logging/structured-logger';
import {
  APP_LOGGER,
  createServiceLoggerFactory,
} from './shared/logging/logging.providers';

// Create service-specific logger helpers for main app
const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');

@Injectable()
export class AppService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = appLoggerFactory.createComponentLogger(baseLogger, 'AppService');
  }

  getHello(): string {
    // Now we only need to pass method-specific context
    // service, component, app, environment, version, traceId, etc. are automatic
    Log.minimal.info(this.log, 'getHello called', { method: 'getHello' });
    return 'Hello World!';
  }
}
