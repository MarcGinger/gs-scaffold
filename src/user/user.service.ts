import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';
import { Log } from '../shared/logging/structured-logger';

// Create service-specific logger helpers
const userLoggerFactory = createServiceLoggerFactory('user-service');

interface UserData {
  id: string;
  name?: string;
  email?: string;
}

interface User extends UserData {
  createdAt: Date;
}

@Injectable()
export class UserService {
  private readonly log: Logger;

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = userLoggerFactory.createComponentLogger(
      baseLogger,
      'UserService',
    );
  }

  createUser(userData: UserData): User {
    Log.minimal.info(this.log, 'Creating new user', {
      method: 'createUser',
      userId: userData.id,
    });

    try {
      const user: User = {
        ...userData,
        createdAt: new Date(),
      };

      Log.minimal.info(this.log, 'User created successfully', {
        method: 'createUser',
        userId: user.id,
        duration: '45ms',
      });

      return user;
    } catch (error: any) {
      Log.minimal.error(this.log, error, 'Failed to create user', {
        method: 'createUser',
        userId: userData.id,
      });
      throw error;
    }
  }

  findUser(id: string): User {
    Log.minimal.debug(this.log, 'Finding user by ID', {
      method: 'findUser',
      userId: id,
    });

    // This will log with:
    // {
    //   "service": "user-service",
    //   "component": "UserService",
    //   "level": "debug",
    //   "msg": "Finding user by ID",
    //   "method": "findUser",
    //   "userId": "123"
    // }

    return {
      id,
      name: 'John Doe',
      email: 'john@example.com',
      createdAt: new Date(),
    };
  }
}
