import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 📚 API Documentation Hub
 *
 * This module creates the main landing page that provides an overview of all
 * available API documentation and serves as a navigation hub.
 */
export class ApiDocumentationHub {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🏗️ Platform API Documentation Hub')
      .setDescription(
        `
Welcome to the **API Documentation Hub** for our platform. This hub provides **platform-level guidance**, **infrastructure standards**, and **technical implementation details** that apply across all business domains.

## 🎯 Architecture Overview

The system is structured into **bounded contexts**, each representing a distinct business domain. Within a bounded context, there may be one or more applications or services, and each application is organized into modules for separation of concerns.

This design enables flexible deployment patterns:
- **Monolithic**: All contexts in a single application
- **Modular Monolith**: Contexts as separate modules within one application  
- **Microservices**: Each context (or application within a context) as independent services

## 📚 Platform Documentation

| Documentation | Description | Link |
|---------------|-------------|------|
| **🎯 Getting Started** | Comprehensive onboarding and setup guide for developers | [📖 View Docs](/api/docs/getting-started) |
| **📋 Standards & Conventions** | API standards, conventions, and implementation guidelines | [📖 View Docs](/api/docs/standards) |
| **🏗️ Architecture** | Platform architecture philosophy and design patterns | [📖 View Docs](/api/docs/architecture) |
| **🛡️ Security** | Security architecture and implementation patterns | [📖 View Docs](/api/docs/security) |
| **🔧 System Operations** | Health monitoring and operational endpoints | [📖 View Docs](/api/docs/system) |

---

*💬 **Need Help?** Start with the **[Getting Started Guide](/api/docs/getting-started)** or contact the platform engineering team for infrastructure guidance.*

`,
      )
      .setVersion('1.0');

    // Add dynamic server configuration
    SwaggerConfigUtil.addServers(config, port);

    // Create document with empty include array to prevent any controllers from being included
    const document = SwaggerModule.createDocument(app, config.build(), {
      include: [], // Explicitly exclude all controllers - this should be documentation only
      deepScanRoutes: false, // Prevent automatic route discovery
      ignoreGlobalPrefix: false,
    });

    // Manually clear any accidentally included paths to ensure only documentation content
    document.paths = {};

    // Clear any business domain schemas and add only infrastructure schemas
    document.components = document.components || {};
    document.components.schemas = {
      // Only include infrastructure/platform schemas - no business domain schemas
    };

    SwaggerModule.setup('api/docs', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs`;
  }
}
