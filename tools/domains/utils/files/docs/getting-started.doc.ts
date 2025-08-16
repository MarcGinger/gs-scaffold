import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 🚀 Getting Started Documentation
 *
 * This module provides comprehensive onboarding and setup guidance
 * for developers working with the platform APIs.
 */
export class GettingStartedDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🚀 Getting Started Guide')
      .setDescription(
        `
# 🚀 Getting Started with the Platform APIs

Welcome to the **FinTech Banking Platform**! This guide will help you get up and running quickly with our APIs and development environment.

---

## 📋 Prerequisites

Before you begin, ensure you have the following:

### **Development Tools**
- **Node.js** (v18 or higher)
- **npm** or **yarn** package manager
- **PostgreSQL** (v13 or higher)
- **Redis** (v6 or higher)
- **Docker** (optional, for containerized development)

### **IDE Setup**
- **VS Code** (recommended) with extensions:
  - **REST Client** for API testing
  - **Thunder Client** for advanced API testing
  - **PostgreSQL** for database management
  - **ESLint** and **Prettier** for code formatting

---

## 🏗️ Step 1: Understand the Architecture

### **Platform Overview**
Our platform follows **Domain-Driven Design (DDD)** principles with clear separation of concerns:

- **🏛️ Domain Layer**: Business logic, entities, and value objects
- **📱 Application Layer**: Use cases, commands, and queries (CQRS)
- **🔌 Infrastructure Layer**: Data persistence, external integrations
- **🌐 Interface Layer**: REST APIs, controllers, and DTOs

### **Key Technologies**
- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Caching**: Redis
- **Messaging**: Event-driven with Kafka
- **Documentation**: OpenAPI 3.0 (Swagger)
- **Authentication**: JWT Bearer tokens

### **📖 Next Step**
Review the **[Architecture Documentation](/api/docs/architecture)** for detailed design patterns and principles.

---

## 🏢 Step 2: Explore Business Domains

### **Available Domains**

| Domain | Description | Documentation |
|--------|-------------|---------------|
| **🏦 Banking Products** | Account types, fees, limits, channels | [📖 View Docs](/api/docs/bank-product) |
| **💰 Currencies** | Multi-currency support and exchange rates | [📖 View Docs](/api/docs/bank-product) |
| **📊 Fees Management** | Transaction, initiation, and penalty fees | [📖 View Docs](/api/docs/bank-product) |
| **🔧 System Operations** | Health checks, monitoring, diagnostics | [📖 View Docs](/api/docs/system) |

### **Domain Structure**
Each domain follows consistent patterns:
\`\`\`
/api/v1/{domain}/
├── entities/          # Core business entities
├── commands/          # Write operations (CQRS)
├── queries/           # Read operations (CQRS)
└── events/            # Domain events
\`\`\`

---

## 🔑 Step 3: Authentication Setup

### **Obtaining Access Tokens**
1. **Contact Platform Team**: Request developer credentials
2. **Authentication Endpoint**: Use the provided login endpoint
3. **Token Storage**: Securely store JWT tokens (never in plain text)

### **Using Bearer Tokens**
Include the token in all API requests:
\`\`\`http
GET /api/v1/bank-products
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
\`\`\`

### **Token Management**
- **Expiration**: Tokens expire after 24 hours
- **Refresh**: Use refresh tokens for automatic renewal
- **Security**: Never share tokens or commit them to version control

### **📖 Next Step**
Review **[Security Documentation](/api/docs/security)** for complete authentication patterns.

---

## ⚙️ Step 4: Development Environment Setup

### **Local Development**

1. **Clone Repository**
\`\`\`bash
git clone <repository-url>
cd fintech-banking-platform
\`\`\`

2. **Install Dependencies**
\`\`\`bash
npm install
\`\`\`

3. **Environment Configuration**
\`\`\`bash
cp .env.example .env
# Edit .env with your local settings
\`\`\`

4. **Database Setup**
\`\`\`bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run database migrations
npm run migration:run
\`\`\`

5. **Start Development Server**
\`\`\`bash
npm run start:dev
\`\`\`

### **Docker Development**
\`\`\`bash
# Start complete development environment
docker-compose up -d

# View logs
docker-compose logs -f api
\`\`\`

### **Environment Variables**
Key configuration variables:
\`\`\`env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=banking_platform
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# API
PORT=3002
NODE_ENV=development
\`\`\`

---

## 🧪 Step 5: Testing Your Setup

### **Health Check**
Verify your environment is working:
\`\`\`http
GET /actuator/health
\`\`\`

Expected response:
\`\`\`json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
\`\`\`

### **API Documentation**
Access interactive documentation:
- **Main API**: \`http://localhost:${port}/api/docs\`
- **Banking Products**: \`http://localhost:${port}/api/docs/bank-product\`

### **Sample API Call**
Test with a simple query:
\`\`\`http
GET /api/v1/currencies
Authorization: Bearer <your-token>
\`\`\`

---

## 🔧 Step 6: Integration Patterns

### **Error Handling**
All APIs return consistent error formats:
\`\`\`json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2025-07-31T10:30:00.000Z",
  "path": "/api/v1/bank-products"
}
\`\`\`

### **Pagination**
Use standard pagination parameters:
\`\`\`http
GET /api/v1/bank-products?page=1&limit=10&sortBy=name&sortOrder=asc
\`\`\`

### **Filtering**
Apply filters using query parameters:
\`\`\`http
GET /api/v1/bank-products?filter[status]=active&search=savings
\`\`\`

### **📖 Next Step**
Review **[API Standards & Conventions](/api/docs/standards)** for complete implementation guidelines.

---

## 🛠️ Development Tools & Resources

### **Interactive Testing**
- **Swagger UI**: Built-in API testing interface
- **Postman Collection**: Import from OpenAPI spec
- **REST Client**: Use VS Code extension for quick tests

### **Monitoring & Debugging**
- **Application Logs**: Structured JSON logging with Pino
- **Health Metrics**: Real-time system health monitoring
- **Database Queries**: Query logging in development mode

### **Code Generation**
- **DTOs**: Auto-generated from OpenAPI schemas
- **Client SDKs**: Generate clients for multiple languages
- **Testing**: Automated test generation from API specs

---

## 📚 Next Steps

### **Immediate Actions**
1. ✅ **Set up development environment**
2. ✅ **Test authentication flow**
3. ✅ **Explore banking products APIs**
4. ✅ **Review error handling patterns**

### **Deep Dive Learning**
1. **[📋 API Standards](/api/docs/standards)** - Implementation guidelines
2. **[🏗️ Architecture](/api/docs/architecture)** - Design patterns and principles
3. **[🛡️ Security](/api/docs/security)** - Security patterns and best practices
4. **[🏦 Banking Products](/api/docs/bank-product)** - Business domain deep dive

---

## 🆘 Getting Help

### **Documentation Resources**
- **Platform Team**: Contact for infrastructure questions
- **Business Domains**: Refer to module-specific documentation
- **Standards**: Check API conventions and patterns

### **Common Issues**
- **Authentication Errors**: Verify token format and expiration
- **Database Connections**: Check environment variables and service status
- **API Errors**: Review request format and required parameters

### **Support Channels**
- **Technical Issues**: Platform engineering team
- **Business Logic**: Domain experts and module documentation
- **Emergency**: 24/7 on-call support for production issues

---

*🎉 **Welcome to the Platform!** You're now ready to build amazing financial applications with our APIs.*

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

    SwaggerModule.setup('api/docs/getting-started', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/getting-started`;
  }
}
