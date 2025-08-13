/\*\*

- Modular Service Name Configuration Examples
-
- This demonstrates how each NestJS module can register its own service name
- while still using the same logging infrastructure and component logger pattern.
  \*/

/\* ================================================================

- 1.  MAIN APP MODULE (gs-scaffold service)
- ================================================================ \*/

// app.module.ts
import { Module } from '@nestjs/common';
import { createServiceLoggerFactory } from './shared/logging/logging.providers';

const appLoggerFactory = createServiceLoggerFactory('gs-scaffold');

@Module({
providers: [
// Main app gets 'gs-scaffold' service name
appLoggerFactory.createAppLoggerProvider(),
],
})
export class AppModule {}

// app.service.ts - Logs will include: { "service": "gs-scaffold", "component": "AppService" }
export class AppService {
constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
this.log = appLoggerFactory.createComponentLogger(baseLogger, 'AppService');
}

getHello() {
Log.minimal.info(this.log, 'Hello endpoint called', { method: 'getHello' });
// Output: {"service":"gs-scaffold","component":"AppService","level":"info","msg":"Hello endpoint called","method":"getHello"}
}
}

/\* ================================================================

- 2.  USER MODULE (user-service)
- ================================================================ \*/

// user/user.module.ts
const userLoggerFactory = createServiceLoggerFactory('user-service');

@Module({
providers: [
// User module gets 'user-service' service name
userLoggerFactory.createAppLoggerProvider(),
],
})
export class UserModule {}

// user/user.service.ts - Logs will include: { "service": "user-service", "component": "UserService" }
export class UserService {
constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
this.log = userLoggerFactory.createComponentLogger(baseLogger, 'UserService');
}

createUser(userData: any) {
Log.minimal.info(this.log, 'Creating user', { method: 'createUser', userId: userData.id });
// Output: {"service":"user-service","component":"UserService","level":"info","msg":"Creating user","method":"createUser","userId":"123"}
}
}

/\* ================================================================

- 3.  ORDER MODULE (order-service)
- ================================================================ \*/

// order/order.module.ts
const orderLoggerFactory = createServiceLoggerFactory('order-service');

@Module({
providers: [
// Order module gets 'order-service' service name
orderLoggerFactory.createAppLoggerProvider(),
],
})
export class OrderModule {}

// order/order.service.ts - Logs will include: { "service": "order-service", "component": "OrderService" }
export class OrderService {
constructor(@Inject(APP_LOGGER) baseLogger: Logger) {
this.log = orderLoggerFactory.createComponentLogger(baseLogger, 'OrderService');
}

processOrder(orderData: any) {
Log.minimal.info(this.log, 'Processing order', { method: 'processOrder', orderId: orderData.id });
// Output: {"service":"order-service","component":"OrderService","level":"info","msg":"Processing order","method":"processOrder","orderId":"order-123"}
}
}

/\* ================================================================

- 4.  BENEFITS OF THIS APPROACH
- ================================================================ \*/

/\*\*

- 1.  Service Isolation in Logs:
- - Each module's logs are tagged with its specific service name
- - Easy to filter logs by service in Grafana/Loki: {service="user-service"}
- - Clear service boundaries for distributed tracing
-
- 2.  Component Clarity:
- - Every log includes both service and component information
- - No more manual logging of class names
- - Consistent logging structure across all services
-
- 3.  Microservice Ready:
- - Each module can easily be extracted to its own microservice
- - Service names already established and consistent
- - No code changes needed when splitting services
-
- 4.  Development Efficiency:
- - Log.minimal pattern reduces boilerplate
- - Component loggers automatically include context
- - Type-safe logging with consistent structure
-
- 5.  Observability:
- - Service-level metrics and alerting
- - Component-level debugging and tracing
- - Clear service dependency mapping in logs
    \*/

/\* ================================================================

- 5.  SAMPLE LOG OUTPUTS
- ================================================================ \*/

/\*\*

- Main App (gs-scaffold):
- {
- "service": "gs-scaffold",
- "component": "AppService",
- "level": "info",
- "msg": "Application started",
- "method": "onApplicationBootstrap",
- "time": "2024-01-20T10:30:00.000Z"
- }
-
- User Service:
- {
- "service": "user-service",
- "component": "UserService",
- "level": "info",
- "msg": "User created successfully",
- "method": "createUser",
- "userId": "user-123",
- "time": "2024-01-20T10:31:15.000Z"
- }
-
- Order Service:
- {
- "service": "order-service",
- "component": "OrderController",
- "level": "info",
- "msg": "Order endpoint called",
- "method": "createOrder",
- "endpoint": "POST /orders",
- "time": "2024-01-20T10:32:30.000Z"
- }
  \*/

/\* ================================================================

- 6.  GRAFANA/LOKI QUERY EXAMPLES
- ================================================================ \*/

/\*\*

- Filter by service:
- {service="user-service"}
-
- Filter by service and component:
- {service="user-service"} | json | component="UserService"
-
- Filter by method across all services:
- {service=~".\*"} | json | method="createUser"
-
- Error logs from specific service:
- {service="order-service"} | json | level="error"
-
- Performance monitoring:
- {service=~"._"} | json | duration > 1000
  _/
