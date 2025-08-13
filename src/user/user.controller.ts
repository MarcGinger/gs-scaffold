import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { UserService } from './user.service';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';
import { Log } from '../shared/logging/structured-logger';

// Create service-specific logger helpers
const userLoggerFactory = createServiceLoggerFactory('user-service');

@Controller('users')
export class UserController {
  private readonly log: Logger;

  constructor(
    private readonly userService: UserService,
    @Inject(APP_LOGGER) baseLogger: Logger,
  ) {
    this.log = userLoggerFactory.createComponentLogger(
      baseLogger,
      'UserController',
    );
  }

  @Post()
  createUser(@Body() userData: { id: string; name?: string; email?: string }) {
    Log.minimal.info(this.log, 'Create user endpoint called', {
      method: 'createUser',
      endpoint: 'POST /users',
    });

    return this.userService.createUser(userData);
  }

  @Get(':id')
  findUser(@Param('id') id: string) {
    Log.minimal.info(this.log, 'Find user endpoint called', {
      method: 'findUser',
      endpoint: 'GET /users/:id',
      userId: id,
    });

    // This will log with:
    // {
    //   "service": "user-service",
    //   "component": "UserController",
    //   "level": "info",
    //   "msg": "Find user endpoint called",
    //   "method": "findUser",
    //   "endpoint": "GET /users/:id",
    //   "userId": "123"
    // }

    return this.userService.findUser(id);
  }
}
