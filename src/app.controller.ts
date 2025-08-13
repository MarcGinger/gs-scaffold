import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import { Logger } from 'pino';
import { APP_LOGGER } from './shared/logging/logging.providers';
import { Log } from './shared/logging/structured-logger';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {}

  @Get()
  getHello(): string {
    Log.info(this.logger, 'Health check requested', {
      service: 'gs-scaffold',
      component: 'AppController',
      method: 'getHello',
    });
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    Log.info(this.logger, 'Health check endpoint accessed', {
      service: 'gs-scaffold',
      component: 'AppController',
      method: 'healthCheck',
    });

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
    };
  }
}
