// src/shared/errors/examples/basic-usage.example.ts

/**
 * Example demonstrating basic usage of the Result pattern
 * in place of traditional exception throwing.
 */

import {
  DomainError,
  Result,
  ok,
  err,
  withContext,
  isOk,
  andThen,
} from '../error.types';

// Example domain entity
interface User {
  id: string;
  email: string;
  name: string;
}

// Example error catalog (simplified - full catalogs come in Phase 2)
const UserErrors = {
  USER_NOT_FOUND: {
    code: 'USER.NOT_FOUND' as const,
    title: 'User not found',
    category: 'domain' as const,
    retryable: false,
  },
  INVALID_EMAIL: {
    code: 'USER.INVALID_EMAIL' as const,
    title: 'Invalid email format',
    category: 'validation' as const,
    retryable: false,
  },
  DATABASE_ERROR: {
    code: 'USER.DATABASE_ERROR' as const,
    title: 'Database operation failed',
    category: 'infrastructure' as const,
    retryable: true,
  },
} as const;

// Traditional approach (what we're moving away from)
class TraditionalUserService {
  findUserById(id: string): User {
    if (!id) {
      throw new Error('User ID is required');
    }
    // Simulate database call
    if (id === 'missing') {
      throw new Error('User not found');
    }
    return { id, email: 'test@example.com', name: 'Test User' };
  }
}

// New Result-based approach (what we're implementing)
class ResultBasedUserService {
  findUserById(id: string): Result<User, DomainError> {
    if (!id) {
      return err({
        ...UserErrors.INVALID_EMAIL,
        detail: 'User ID is required',
      });
    }

    try {
      // Simulate database call
      if (id === 'missing') {
        return err(UserErrors.USER_NOT_FOUND);
      }

      const user = { id, email: 'test@example.com', name: 'Test User' };
      return ok(user);
    } catch (error) {
      return err(
        withContext(UserErrors.DATABASE_ERROR, {
          userId: id,
          cause: (error as Error).message,
        }),
      );
    }
  }

  updateUserEmail(id: string, newEmail: string): Result<User, DomainError> {
    // Chain operations without nested try/catch blocks
    return andThen(this.findUserById(id), (user) => {
      if (!this.isValidEmail(newEmail)) {
        return err({
          ...UserErrors.INVALID_EMAIL,
          detail: `Email format is invalid: ${newEmail}`,
        });
      }

      // Update the user
      const updatedUser = { ...user, email: newEmail };
      return ok(updatedUser);
    });
  }

  private isValidEmail(email: string): boolean {
    return email.includes('@') && email.includes('.');
  }
}

// Usage example in a controller or service
export class UserExampleController {
  private userService = new ResultBasedUserService();

  getUser(id: string): { user?: User; error?: string } {
    const result = this.userService.findUserById(id);

    if (isOk(result)) {
      return { user: result.value };
    }

    // Log the error (in real implementation, this would use structured logging)
    console.error('User lookup failed:', {
      code: result.error.code,
      title: result.error.title,
      context: result.error.context,
    });

    return { error: result.error.title };
  }

  updateEmail(id: string, email: string): { user?: User; error?: string } {
    const result = this.userService.updateUserEmail(id, email);

    if (isOk(result)) {
      return { user: result.value };
    }

    return { error: result.error.title };
  }
}

// Example usage demonstrating the benefits
export function demonstrateResultPattern(): void {
  const controller = new UserExampleController();

  // Success case
  console.log('=== Success Case ===');
  console.log(controller.getUser('123'));

  // Error case
  console.log('\n=== Error Case ===');
  console.log(controller.getUser('missing'));

  // Chained operation
  console.log('\n=== Chained Operation ===');
  console.log(controller.updateEmail('123', 'newemail@example.com'));

  // Validation error
  console.log('\n=== Validation Error ===');
  console.log(controller.updateEmail('123', 'invalid-email'));
}

// Uncomment to run the demonstration
// demonstrateResultPattern();
