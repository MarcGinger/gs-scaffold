import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { HealthModule } from 'src/health';

/**
 * 🔧 System Operations API Documentation
 *
 * This module handles the Swagger documentation for system operational endpoints
 * including health checks, metrics, and monitoring capabilities.
 */
export class SystemOperationsDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🔧 System Operations API')
      .setDescription(
        `
## System Health & Operations

Platform monitoring and operational endpoints for system administration:

### 💓 Health Checks
System health monitoring and status reporting.
- Application health status
- Database connectivity checks
- External service dependency monitoring
- Resource utilization metrics
- Service readiness and liveness probes

### 📈 Metrics
Performance metrics and system diagnostics.
- Application performance indicators
- Request/response metrics
- Error rate monitoring
- Resource consumption tracking
- Business metrics and KPIs

### 🔍 Monitoring
Comprehensive system observability.
- Real-time system status
- Alert configuration and management
- Log aggregation and analysis
- Distributed tracing capabilities
- Performance bottleneck identification

### ⚙️ Administration
System administration and maintenance operations.
- Configuration management
- Cache management and invalidation
- System maintenance modes
- Backup and recovery operations
- Service restart and deployment status

---
**Base Path:** \`/actuator/\`

### 🔍 Common Use Cases
- Monitoring application health in production
- Setting up automated health check alerts
- Analyzing system performance metrics
- Troubleshooting operational issues
- Maintaining system uptime and reliability
        `,
      )
      .setVersion('1.0')
      .addTag('health', '💓 System health monitoring')
      .addTag('metrics', '📈 Performance metrics')
      .addTag('monitoring', '🔍 System observability')
      .addTag('admin', '⚙️ System administration')
      .addServer(`http://localhost:${port}`)
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      include: [HealthModule],
    });

    SwaggerModule.setup('api/docs/system', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `http://localhost:${port}/api/docs/system`;
  }
}
