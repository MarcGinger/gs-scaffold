import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { Logger } from 'pino';
import { UserService } from './user.service';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';
import { Log } from '../shared/logging/structured-logger';
import { SafeJwtAuthGuard, CurrentUser, Public } from '../shared/security/auth';
import { IUserToken } from '../shared/security/types/user-token.interface';

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
  @Public() // Public endpoint - no authentication required
  findAllUsers(): any {
    Log.minimal.info(this.log, 'Get all users endpoint called', {
      method: 'findAllUsers',
      endpoint: 'GET /users',
    });

    return this.userService.findAllUsers();
  }

  @Post()
  @UseGuards(SafeJwtAuthGuard) // Secure JWT authentication
  createUser(
    @Body() userData: CreateUserDto,
    @CurrentUser() currentUser: IUserToken,
  ): any {
    Log.minimal.info(this.log, 'Create user endpoint called', {
      method: 'createUser',
      endpoint: 'POST /users',
      userEmail: userData.email,
      authenticatedUser: currentUser.sub,
      tenant: currentUser.tenant,
    });

    return this.userService.createUser(userData);
  }

  @Get('me')
  @UseGuards(SafeJwtAuthGuard) // Get current user profile
  getCurrentUser(@CurrentUser() currentUser: IUserToken): any {
    Log.minimal.info(this.log, 'Get current user profile called', {
      method: 'getCurrentUser',
      endpoint: 'GET /users/me',
      userId: currentUser.sub,
      tenant: currentUser.tenant,
    });

    return {
      profile: currentUser,
      message: 'Current user profile retrieved successfully',
    };
  }

  @Get(':id')
  @UseGuards(SafeJwtAuthGuard) // Protected endpoint
  findUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: IUserToken,
  ): any {
    Log.minimal.info(this.log, 'Find user endpoint called', {
      method: 'findUser',
      endpoint: 'GET /users/:id',
      userId: id,
      requestedBy: currentUser.sub,
      tenant: currentUser.tenant,
    });

    return this.userService.findUser(id);
  }
}
