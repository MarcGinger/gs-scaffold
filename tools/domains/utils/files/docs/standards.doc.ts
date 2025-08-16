import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 📋 API Standards & Conventions Documentation
 *
 * This module provides comprehensive documentation for API standards,
 * conventions, patterns, and implementation guidelines.
 */
export class StandardsDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('📋 API Standards & Conventions')
      .setDescription(
        `
# 📋 API Standards & Conventions

This documentation covers the **API standards**, **conventions**, and **implementation guidelines** that apply across all platform APIs.

---

## 🌐 API Standards & Conventions

### 📍 **Base URLs & Versioning**
- **Development:** \`http://localhost:${port}/api/\`
- **API Version:** v1 (URI versioning enabled)
- **Global Prefix:** \`/api\` (except health endpoints: \`/actuator\`)

### 🎯 **Endpoint Patterns**
- **Service APIs:** \`/api/v1/{service}/{domain}/{resource}\`
- **Health APIs:** \`/actuator/{endpoint}\`
- **Documentation:** \`/api/docs/{module}\`

### 📝 **Request/Response Standards**
All APIs use **JSON** with consistent formatting:

\`\`\`json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": { /* response data */ },
  "timestamp": "2025-07-23T10:30:00.000Z"
}
\`\`\`

**Error Format:**
\`\`\`json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request", 
  "timestamp": "2025-07-23T10:30:00.000Z",
  "path": "/api/v1/resource/123456"
}
\`\`\`

---

## ⚡ Common Response Codes

| Code | Description | Usage Context |
|------|-------------|---------------|
| **200** | Success | Request completed successfully |
| **201** | Created | Resource created (POST operations) |
| **400** | Bad Request | Invalid input or malformed request |
| **401** | Unauthorized | Missing or invalid authentication |
| **403** | Forbidden | Insufficient permissions |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Business rule violation or duplicate |
| **422** | Unprocessable Entity | Valid format but business logic error |
| **500** | Internal Server Error | Unexpected system error |

---

## 🔒 Authentication & Authorization

### **Bearer Token Authentication**
All protected endpoints require a Bearer token in the Authorization header:

\`\`\`http
Authorization: Bearer <your-jwt-token>
\`\`\`

### **Token Structure**
JWT tokens contain the following claims:
- \`sub\`: User identifier
- \`iat\`: Issued at timestamp
- \`exp\`: Expiration timestamp
- \`roles\`: User roles and permissions

---

## 📊 Pagination Standards

### **Request Parameters**
\`\`\`json
{
  "page": 1,
  "limit": 10,
  "sortBy": "createdAt",
  "sortOrder": "desc"
}
\`\`\`

### **Response Format**
\`\`\`json
{
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "items": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50,
      "itemsPerPage": 10,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  },
  "timestamp": "2025-07-23T10:30:00.000Z"
}
\`\`\`

---

## 🔍 Filtering & Search

### **Query Parameters**
- \`search\`: General text search across searchable fields
- \`filter[field]\`: Filter by specific field values
- \`dateFrom\` / \`dateTo\`: Date range filtering

### **Example**
\`\`\`
GET /api/v1/products?search=banking&filter[status]=active&dateFrom=2025-01-01
\`\`\`

---

## 🛠️ Development Guidelines

### **Naming Conventions**
- **Endpoints**: Use kebab-case (\`/bank-products\`)
- **JSON Properties**: Use camelCase (\`firstName\`, \`createdAt\`)
- **Query Parameters**: Use camelCase (\`sortBy\`, \`pageSize\`)

### **HTTP Methods**
- **GET**: Retrieve resources (idempotent)
- **POST**: Create new resources
- **PUT**: Replace entire resource (idempotent)
- **PATCH**: Partial resource updates
- **DELETE**: Remove resources (idempotent)

### **Validation Rules**
- All input data must be validated using DTOs
- Required fields must be clearly marked in documentation
- Field length limits and formats must be specified
- Business rule violations should return 422 status

---

## 📅 Date & Time Standards

### **ISO 8601 Format**
All dates and times use ISO 8601 format with UTC timezone:
\`\`\`
2025-07-23T10:30:00.000Z
\`\`\`

### **Date Only**
For date-only fields, use:
\`\`\`
2025-07-23
\`\`\`

---

## 🚦 Rate Limiting

### **Default Limits**
- **Public APIs**: 100 requests per minute
- **Authenticated APIs**: 1000 requests per minute
- **Administrative APIs**: 500 requests per minute

### **Headers**
Rate limit information is provided in response headers:
\`\`\`
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642684800
\`\`\`

---

## 🧪 Testing Standards

### **Test Categories**
- **Unit Tests**: Individual component testing
- **Integration Tests**: API endpoint testing
- **End-to-End Tests**: Complete workflow testing

### **Test Data**
- Use deterministic test data
- Clean up test data after test execution
- Use separate test databases/environments

---

*💬 **Questions?** Refer to specific module documentation for implementation details or contact the platform team for clarification.*

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

    SwaggerModule.setup('api/docs/standards', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/standards`;
  }
}
