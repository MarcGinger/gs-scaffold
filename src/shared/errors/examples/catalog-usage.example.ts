// src/shared/errors/examples/catalog-usage.example.ts

/**
 * Comprehensive example demonstrating catalog builder usage
 * with realistic domain error scenarios.
 */

import { Result, ok, err, isOk, withContext } from '../error.types';
import {
  UserErrors,
  UserDomainError,
} from '../../../contexts/user/errors/user.errors';
import {
  OrderErrors,
  OrderDomainError,
} from '../../../contexts/order/errors/order.errors';

// Mock domain entities
interface User {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'inactive' | 'suspended';
}

interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  items: Array<{ productId: string; quantity: number }>;
  total: number;
}

// Example service using User error catalog
class UserService {
  private users: Map<string, User> = new Map([
    [
      '1',
      {
        id: '1',
        email: 'john@example.com',
        name: 'John Doe',
        status: 'active',
      },
    ],
    [
      '2',
      {
        id: '2',
        email: 'jane@example.com',
        name: 'Jane Smith',
        status: 'inactive',
      },
    ],
  ]);

  findById(id: string, correlationId?: string): Result<User, UserDomainError> {
    if (!id || id.trim() === '') {
      return err(
        withContext(UserErrors.INVALID_USER_DATA, {
          correlationId,
          reason: 'User ID is required',
        }),
      );
    }

    const user = this.users.get(id);
    if (!user) {
      return err(
        withContext(UserErrors.USER_NOT_FOUND, {
          correlationId,
          userId: id,
        }),
      );
    }

    if (user.status === 'suspended') {
      return err(
        withContext(UserErrors.USER_AUTHORIZATION_DENIED, {
          correlationId,
          userId: id,
          reason: 'User account is suspended',
        }),
      );
    }

    return ok(user);
  }

  createUser(
    email: string,
    name: string,
    correlationId?: string,
  ): Result<User, UserDomainError> {
    // Validate email format
    if (!this.isValidEmail(email)) {
      return err(
        withContext(UserErrors.INVALID_EMAIL_FORMAT, {
          correlationId,
          email,
        }),
      );
    }

    // Check if user already exists
    const existingUser = Array.from(this.users.values()).find(
      (u) => u.email === email,
    );
    if (existingUser) {
      return err(
        withContext(UserErrors.USER_ALREADY_EXISTS, {
          correlationId,
          email,
          existingUserId: existingUser.id,
        }),
      );
    }

    const newUser: User = {
      id: String(this.users.size + 1),
      email,
      name,
      status: 'active',
    };

    this.users.set(newUser.id, newUser);
    return ok(newUser);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

// Example service using Order error catalog
class OrderService {
  private orders: Map<string, Order> = new Map([
    [
      '1',
      {
        id: '1',
        userId: '1',
        status: 'completed',
        items: [{ productId: 'prod1', quantity: 2 }],
        total: 100.0,
      },
    ],
  ]);

  constructor(private userService: UserService) {}

  findById(
    id: string,
    userId?: string,
    correlationId?: string,
  ): Result<Order, OrderDomainError> {
    if (!id || id.trim() === '') {
      return err(
        withContext(OrderErrors.INVALID_ORDER_DATA, {
          correlationId,
          reason: 'Order ID is required',
        }),
      );
    }

    const order = this.orders.get(id);
    if (!order) {
      return err(
        withContext(OrderErrors.ORDER_NOT_FOUND, {
          correlationId,
          orderId: id,
        }),
      );
    }

    // Check authorization if userId is provided
    if (userId && order.userId !== userId) {
      return err(
        withContext(OrderErrors.ORDER_AUTHORIZATION_DENIED, {
          correlationId,
          orderId: id,
          requestingUserId: userId,
          orderUserId: order.userId,
        }),
      );
    }

    return ok(order);
  }

  createOrder(
    userId: string,
    items: Array<{ productId: string; quantity: number }>,
    correlationId?: string,
  ): Result<Order, OrderDomainError | UserDomainError> {
    // Validate user exists first
    const userResult = this.userService.findById(userId, correlationId);
    if (!isOk(userResult)) {
      // Return the user error as-is (error propagation)
      return userResult;
    }

    // Validate order data
    if (!items || items.length === 0) {
      return err(
        withContext(OrderErrors.INVALID_ORDER_DATA, {
          correlationId,
          reason: 'Order must contain at least one item',
        }),
      );
    }

    // Simulate inventory check
    if (items.some((item) => item.quantity <= 0)) {
      return err(
        withContext(OrderErrors.INVALID_ORDER_DATA, {
          correlationId,
          reason: 'All items must have positive quantity',
        }),
      );
    }

    const newOrder: Order = {
      id: String(this.orders.size + 1),
      userId,
      status: 'pending',
      items,
      total: items.reduce((sum, item) => sum + item.quantity * 50, 0), // Mock pricing
    };

    this.orders.set(newOrder.id, newOrder);
    return ok(newOrder);
  }

  updateOrderStatus(
    orderId: string,
    newStatus: Order['status'],
    userId?: string,
    correlationId?: string,
  ): Result<Order, OrderDomainError> {
    const orderResult = this.findById(orderId, userId, correlationId);
    if (!isOk(orderResult)) {
      return orderResult;
    }

    const order = orderResult.value;

    // Business rule: can't modify completed or cancelled orders
    if (order.status === 'completed' || order.status === 'cancelled') {
      return err(
        withContext(OrderErrors.ORDER_CANNOT_BE_MODIFIED, {
          correlationId,
          orderId,
          currentStatus: order.status,
          requestedStatus: newStatus,
        }),
      );
    }

    // Business rule: validate status transitions
    if (!this.isValidStatusTransition(order.status, newStatus)) {
      return err(
        withContext(OrderErrors.INVALID_ORDER_STATUS, {
          correlationId,
          orderId,
          currentStatus: order.status,
          requestedStatus: newStatus,
        }),
      );
    }

    const updatedOrder = { ...order, status: newStatus };
    this.orders.set(orderId, updatedOrder);
    return ok(updatedOrder);
  }

  private isValidStatusTransition(
    current: Order['status'],
    next: Order['status'],
  ): boolean {
    const transitions: Record<Order['status'], Order['status'][]> = {
      pending: ['processing', 'cancelled'],
      processing: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    return transitions[current].includes(next);
  }
}

// Example usage demonstrating error handling patterns
export class CatalogUsageExample {
  private userService = new UserService();
  private orderService = new OrderService(this.userService);

  async demonstrateSuccessfulFlow(correlationId: string): Promise<void> {
    console.log('=== Successful Flow ===');

    // Create user
    const userResult = this.userService.createUser(
      'newuser@example.com',
      'New User',
      correlationId,
    );

    if (isOk(userResult)) {
      console.log('User created:', userResult.value);

      // Create order for user
      const orderResult = this.orderService.createOrder(
        userResult.value.id,
        [{ productId: 'prod1', quantity: 2 }],
        correlationId,
      );

      if (isOk(orderResult)) {
        console.log('Order created:', orderResult.value);
      } else {
        console.error('Order creation failed:', orderResult.error);
      }
    } else {
      console.error('User creation failed:', userResult.error);
    }
  }

  async demonstrateErrorFlow(correlationId: string): Promise<void> {
    console.log('\n=== Error Flow ===');

    // Try to create user with invalid email
    const userResult = this.userService.createUser(
      'invalid-email',
      'Invalid User',
      correlationId,
    );

    if (!isOk(userResult)) {
      console.error('Expected error:', {
        code: userResult.error.code,
        title: userResult.error.title,
        context: userResult.error.context,
      });
    }

    // Try to access non-existent order
    const orderResult = this.orderService.findById('999', '1', correlationId);

    if (!isOk(orderResult)) {
      console.error('Expected error:', {
        code: orderResult.error.code,
        title: orderResult.error.title,
        context: orderResult.error.context,
      });
    }
  }

  async demonstrateBusinessRuleViolation(correlationId: string): Promise<void> {
    console.log('\n=== Business Rule Violation ===');

    // Try to modify completed order
    const updateResult = this.orderService.updateOrderStatus(
      '1', // This is a completed order
      'processing',
      '1',
      correlationId,
    );

    if (!isOk(updateResult)) {
      console.error('Business rule violation:', {
        code: updateResult.error.code,
        title: updateResult.error.title,
        detail: updateResult.error.detail,
        context: updateResult.error.context,
      });
    }
  }

  async demonstrateAuthorizationError(correlationId: string): Promise<void> {
    console.log('\n=== Authorization Error ===');

    // Try to access order belonging to different user
    const orderResult = this.orderService.findById(
      '1', // Order belongs to user '1'
      '999', // Requesting as user '999'
      correlationId,
    );

    if (!isOk(orderResult)) {
      console.error('Authorization denied:', {
        code: orderResult.error.code,
        title: orderResult.error.title,
        context: orderResult.error.context,
      });
    }
  }
}

// Example of how to run the demonstrations
export function runCatalogUsageExample(): void {
  const example = new CatalogUsageExample();
  const correlationId = `demo-${Date.now()}`;

  Promise.resolve()
    .then(() => example.demonstrateSuccessfulFlow(correlationId))
    .then(() => example.demonstrateErrorFlow(correlationId))
    .then(() => example.demonstrateBusinessRuleViolation(correlationId))
    .then(() => example.demonstrateAuthorizationError(correlationId))
    .catch(console.error);
}

// Uncomment to run the example
// runCatalogUsageExample();
