import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { UserService } from './user.service';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';
import { Log } from '../shared/logging/structured-logger';

// Create service-specific logger helpers
const userLoggerFactory = createServiceLoggerFactory('user-service');

// DTOs for request/response
interface CreateUserDto {
  name: string;
  email: string;
}

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

  @Get()
  findAllUsers(): any {
    Log.minimal.info(this.log, 'Get all users endpoint called', {
      method: 'findAllUsers',
      endpoint: 'GET /users',
    });

    return this.userService.findAllUsers();
  }

  @Post()
  createUser(@Body() userData: CreateUserDto): any {
    Log.minimal.info(this.log, 'Create user endpoint called', {
      method: 'createUser',
      endpoint: 'POST /users',
      userEmail: userData.email,
    });

    return this.userService.createUser(userData);
  }

  @Get(':id')
  findUser(@Param('id') id: string): any {
    Log.minimal.info(this.log, 'Find user endpoint called', {
      method: 'findUser',
      endpoint: 'GET /users/:id',
      userId: id,
    });

    return this.userService.findUser(id);
  }
}
