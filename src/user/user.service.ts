import { Injectable, Inject } from '@nestjs/common';
import { Logger } from 'pino';
import { APP_LOGGER } from '../shared/logging/logging.providers';
import { createServiceLoggerFactory } from '../shared/logging/logging.providers';
import { Log } from '../shared/logging/structured-logger';
import {
  UserDomainError,
  UserErrors,
} from 'src/contexts/user/errors/user.errors';
import { err, ok, Result, withContext } from 'src/shared/errors';

// Create service-specific logger helpers
const userLoggerFactory = createServiceLoggerFactory('user-service');

interface UserData {
  id?: string; // Optional since it will be generated
  name: string;
  email: string;
}

interface User extends UserData {
  createdAt: Date;
}

@Injectable()
export class UserService {
  private readonly log: Logger;

  // Mock database - in real app this would be injected repository/database service
  private readonly mockUsers: Map<string, User> = new Map([
    [
      '1',
      {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date('2024-01-15'),
      },
    ],
    [
      '2',
      {
        id: '2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        createdAt: new Date('2024-02-20'),
      },
    ],
    [
      '3',
      {
        id: '3',
        name: 'Bob Wilson',
        email: 'bob@example.com',
        createdAt: new Date('2024-03-10'),
      },
    ],
  ]);

  constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
    this.log = userLoggerFactory.createComponentLogger(
      baseLogger,
      'UserService',
    );
  }

  createUser(userData: UserData): Result<User, UserDomainError> {
    const correlationId = this.generateCorrelationId();

    Log.minimal.info(this.log, 'Creating new user', {
      method: 'createUser',
      userEmail: userData.email,
      correlationId,
    });

    try {
      // Validate email format
      if (userData.email && !this.isValidEmail(userData.email)) {
        Log.minimal.warn(this.log, 'Invalid email format provided', {
          method: 'createUser',
          email: userData.email,
          correlationId,
        });

        return err(
          withContext(UserErrors.INVALID_EMAIL_FORMAT, {
            correlationId,
            providedEmail: userData.email,
            field: 'email',
          }),
        );
      }

      // Check if user already exists
      const existingUser = Array.from(this.mockUsers.values()).find(
        (user) => user.email === userData.email,
      );

      if (existingUser) {
        Log.minimal.warn(this.log, 'User with email already exists', {
          method: 'createUser',
          email: userData.email,
          existingUserId: existingUser.id,
          correlationId,
        });

        return err(
          withContext(UserErrors.USER_ALREADY_EXISTS, {
            correlationId,
            email: userData.email,
            existingUserId: existingUser.id,
          }),
        );
      }

      // Generate new ID
      const newId = (this.mockUsers.size + 1).toString();

      const user: User = {
        ...userData,
        id: newId,
        createdAt: new Date(),
      };

      // Store in mock database
      this.mockUsers.set(newId, user);

      Log.minimal.info(this.log, 'User created successfully', {
        method: 'createUser',
        userId: user.id,
        userEmail: user.email,
        correlationId,
      });

      return ok(user);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorType =
        error instanceof Error ? error.constructor.name : 'Unknown';

      Log.minimal.error(
        this.log,
        error,
        'Unexpected error during user creation',
        {
          method: 'createUser',
          userEmail: userData.email,
          correlationId,
          errorType,
        },
      );

      return err(
        withContext(UserErrors.USER_DATABASE_ERROR, {
          correlationId,
          originalError: errorMessage,
          email: userData.email,
          operation: 'create_user',
        }),
      );
    }
  }

  /**
   * Simple email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  findUser(id: string): Result<User, UserDomainError> {
    const correlationId = this.generateCorrelationId();

    Log.minimal.debug(this.log, 'Finding user by ID', {
      method: 'findUser',
      userId: id,
      correlationId,
    });

    // Input validation
    if (!id || id.trim() === '') {
      Log.minimal.warn(this.log, 'Invalid user ID provided', {
        method: 'findUser',
        userId: id,
        correlationId,
        reason: 'empty_or_null_id',
      });

      return err(
        withContext(UserErrors.INVALID_USER_DATA, {
          correlationId,
          userId: id,
          field: 'id',
          reason: 'ID cannot be empty',
        }),
      );
    }

    // Simulate database lookup
    const user = this.mockUsers.get(id);

    if (!user) {
      Log.minimal.info(this.log, 'User not found', {
        method: 'findUser',
        userId: id,
        correlationId,
        action: 'user_lookup_failed',
      });

      return err(
        withContext(UserErrors.USER_NOT_FOUND, {
          correlationId,
          userId: id,
          searchCriteria: 'id',
        }),
      );
    }

    // Success case
    Log.minimal.info(this.log, 'User found successfully', {
      method: 'findUser',
      userId: id,
      correlationId,
      userEmail: user.email,
      action: 'user_lookup_success',
    });

    return ok(user);
  }

  /**
   * Retrieves all users from the system
   */
  findAllUsers(): Result<User[], UserDomainError> {
    const correlationId = this.generateCorrelationId();

    Log.minimal.debug(this.log, 'Retrieving all users', {
      method: 'findAllUsers',
      correlationId,
    });

    try {
      const users = Array.from(this.mockUsers.values());

      Log.minimal.info(this.log, 'Successfully retrieved all users', {
        method: 'findAllUsers',
        correlationId,
        userCount: users.length,
      });

      return ok(users);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      Log.minimal.error(this.log, error, 'Failed to retrieve users', {
        method: 'findAllUsers',
        correlationId,
        errorMessage,
      });

      return err(
        withContext(UserErrors.USER_DATABASE_ERROR, {
          correlationId,
          operation: 'find_all_users',
          originalError: errorMessage,
        }),
      );
    }
  }

  /**
   * Generates a simple correlation ID for request tracing
   */
  private generateCorrelationId(): string {
    return `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
