# 📚 Modular Swagger Documentation Structure

## 🎯 Overview

This project implements a **DDD-aligned, modular approach** to organizing Swagger documentation that co-locates documentation with domain modules, making the codebase more maintainable and ownership clearer.

## 📁 New Directory Structure

```
src/
├── shared/
│   └── docs/
│       ├── index.ts                     # 📦 Re-exports and interfaces
│       ├── api-hub.doc.ts              # 📚 Main documentation hub
│       ├── system-operations.doc.ts    # 🔧 Cross-cutting system ops
│       └── README.md                   # 📋 This documentation
└── fintech-banking-product/
    ├── rail/
    │   └── docs/
    │       └── rail.doc.ts             # 🚊 Railway-specific docs
    ├── currency/
    │   └── docs/
    │       └── currency.doc.ts         # 💱 Currency-specific docs
    ├── channel/
    │   └── docs/
    │       └── channel.doc.ts          # 📱 Channel-specific docs
    ├── transactional-fee/
    │   └── docs/
    │       └── transactional-fee.doc.ts # 🔄 Transactional fee docs
    ├── product/
    │   └── docs/
    │       └── product.doc.ts          # 🏷️ Product-specific docs
    └── fee/
        └── docs/
            └── fee-management.doc.ts   # � Comprehensive fee docs
```

## 🏗️ Architecture Benefits

### ✅ **Co-location with Domain Code**

- Documentation lives next to the module it documents
- Easy to find and update when changing module code
- Clear ownership - team owning module also owns its docs

### ✅ **DDD Alignment**

- Documentation structure mirrors bounded contexts
- Domain experts can maintain their own API documentation
- Clear separation between different business domains

### ✅ **Scalability & Maintainability**

- Adding new modules automatically gets its own docs folder
- No central docs folder that becomes bloated
- Modules can be extracted as packages/services with their docs

### ✅ **Flexible Documentation Strategy**

- **Consolidated docs**: Groups related domains (e.g., all fees together)
- **Individual docs**: Domain-specific focused documentation
- **Both approaches**: Can serve different audiences and use cases

## 🌐 Available Documentation Endpoints

### 📚 **Consolidated Documentation**

| Endpoint                   | Purpose           | Domains Included                |
| -------------------------- | ----------------- | ------------------------------- |
| `/api/docs`                | 📚 Main Hub       | Navigation to all documentation |
| `/api/docs/core-reference` | 🏦 Core Data      | Rails, Currencies, Channels     |
| `/api/docs/fees`           | 💸 Fee Management | All fee types consolidated      |
| `/api/docs/products`       | 🏷️ Product Config | Banking products and rules      |
| `/api/docs/system`         | 🔧 Operations     | Health checks and monitoring    |

### 🎯 **Individual Domain Documentation**

| Endpoint                       | Purpose         | Domain                      |
| ------------------------------ | --------------- | --------------------------- |
| `/api/docs/rails`              | 🚊 Rails API    | Payment settlement networks |
| `/api/docs/currencies`         | 💱 Currency API | Currency management         |
| `/api/docs/channels`           | 📱 Channel API  | Customer access channels    |
| `/api/docs/transactional-fees` | 🔄 Fee API      | Per-transaction charges     |
| `/api/docs/products`           | 🏷️ Product API  | Banking product management  |

## 🎛️ Usage Patterns

### Adding New Domain Documentation

1. **Create domain documentation file:**

   ```typescript
   // src/fintech-banking-product/new-domain/docs/new-domain.doc.ts
   import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
   import { INestApplication } from '@nestjs/common';
   import { NewDomainModule } from '../new-domain.module';

   export class NewDomainDocumentation {
     static setup(app: INestApplication, port: string | number): void {
       const config = new DocumentBuilder()
         .setTitle('🆕 New Domain API')
         .setDescription('Domain-specific documentation...')
         .addTag('new-domain', '🆕 New domain operations')
         .build();

       const document = SwaggerModule.createDocument(app, config, {
         include: [NewDomainModule],
       });

       SwaggerModule.setup('api/docs/new-domain', app, document);
     }

     static getEndpoint(port: string | number): string {
       return `http://localhost:${port}/api/docs/new-domain`;
     }
   }
   ```

2. **Re-export from shared/docs/index.ts:**

   ```typescript
   export { NewDomainDocumentation } from '../../fintech-banking-product/new-domain/docs/new-domain.doc';
   ```

3. **Add to main.ts setup:**
   ```typescript
   NewDomainDocumentation.setup(app, port);
   ```

### Module Extraction Strategy

When extracting a module as a separate service:

1. **Documentation moves with the module** ✅
2. **No central docs to update** ✅
3. **Clear ownership boundaries** ✅
4. **Independent deployment** ✅

## 🔧 Key Features

- **Production Safety**: Documentation disabled in production
- **Domain-Focused**: Each doc module focuses on single business domain
- **Rich Context**: Detailed descriptions with business use cases
- **Type Safety**: Full TypeScript support with proper interfaces
- **Flexible Setup**: Both consolidated and individual documentation approaches
- **Easy Navigation**: Clear hub page linking to all documentation

## 💡 Best Practices Implemented

1. **Single Responsibility**: Each doc module handles one domain
2. **Co-location**: Documentation lives with the code it documents
3. **Domain Language**: Uses ubiquitous language from each domain
4. **Clear Ownership**: Teams own both code and documentation
5. **Scalable Architecture**: Grows naturally with the modular monolith

## 🚀 Migration Path

The current setup supports **both approaches simultaneously**:

- **Legacy consolidated docs**: Still available for teams that prefer grouped documentation
- **New modular docs**: Co-located with domain modules for better ownership
- **Gradual migration**: Teams can migrate their documentation at their own pace

This structure provides a **professional, maintainable, and domain-aligned** approach to API documentation that perfectly supports modular monolith architecture!
