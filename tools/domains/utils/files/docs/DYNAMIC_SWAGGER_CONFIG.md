# 🌐 Dynamic Swagger Server Configuration

This project uses dynamic server URL detection for Swagger documentation, making it environment-aware and deployment-friendly.

## 🚀 Quick Start

### Basic Usage

The system automatically detects the appropriate server URL based on your environment:

```typescript
// Before: Static localhost URL
.addServer(`http://localhost:${port}`)

// After: Dynamic environment-aware URL
SwaggerConfigUtil.addServers(config, port);
```

### Environment Variables

Set these environment variables to customize the Swagger server URLs:

```bash
# Protocol (http/https)
SWAGGER_PROTOCOL=http

# Host (overrides auto-detection)
SWAGGER_HOST=localhost

# Full URL (overrides protocol + host + port)
PUBLIC_API_URL=https://api.yourbank.com

# Staging environment URL
STAGING_API_URL=https://staging-api.yourbank.com
```

## 🔧 Configuration Examples

### Development (Default)

```bash
# .env.development
SWAGGER_PROTOCOL=http
SWAGGER_HOST=localhost
```

**Result:** `http://localhost:3002`

### Docker Compose

```bash
# .env.docker
SWAGGER_PROTOCOL=http
SWAGGER_HOST=fintech-banking-api
```

**Result:** `http://fintech-banking-api:3002`

### Kubernetes

```bash
# ConfigMap or env vars
SWAGGER_PROTOCOL=https
SWAGGER_HOST=api-service.banking.svc.cluster.local
```

**Result:** `https://api-service.banking.svc.cluster.local:3002`

### Production

```bash
# .env.production
NODE_ENV=production
PUBLIC_API_URL=https://api.yourbank.com
```

**Result:** `https://api.yourbank.com`

## 🎯 Auto-Detection Priority

The system uses this priority order for host detection:

1. **SWAGGER_HOST** - Explicit override
2. **HOST** - General host environment variable
3. **HOSTNAME** - Container hostname
4. **KUBERNETES_SERVICE_HOST** - K8s service discovery
5. **CONTAINER_HOST** - Docker container hostname
6. **localhost** - Fallback default

## 📋 Multi-Environment Support

The system automatically creates multiple server options in development:

```json
{
  "servers": [
    {
      "url": "https://api.yourbank.com",
      "description": "production server"
    },
    {
      "url": "http://localhost:3002",
      "description": "Local development server"
    },
    {
      "url": "https://staging-api.yourbank.com",
      "description": "Staging server"
    }
  ]
}
```

## 🛠️ Implementation Guide

### 1. Update Documentation Classes

```typescript
import { SwaggerConfigUtil } from '../../../shared/docs/swagger-config.util';

export class YourDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('Your API')
      .setDescription('Your API description')
      .setVersion('1.0')
      .addTag('your-tag', 'Your tag description');

    // Add dynamic servers instead of static .addServer()
    SwaggerConfigUtil.addServers(config, port);

    const document = SwaggerModule.createDocument(app, config.build(), {
      include: [YourModule],
    });

    SwaggerModule.setup('api/docs/your-path', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/your-path`;
  }
}
```

### 2. Environment Configuration

Create appropriate `.env` files for each environment:

```bash
# .env.development
SWAGGER_PROTOCOL=http
SWAGGER_HOST=localhost

# .env.staging
SWAGGER_PROTOCOL=https
SWAGGER_HOST=staging-api.yourbank.com

# .env.production
NODE_ENV=production
PUBLIC_API_URL=https://api.yourbank.com
```

### 3. Docker Configuration

```dockerfile
# Dockerfile
ENV SWAGGER_PROTOCOL=http
ENV SWAGGER_HOST=your-container-name
```

```yaml
# docker-compose.yml
services:
  api:
    environment:
      - SWAGGER_PROTOCOL=http
      - SWAGGER_HOST=fintech-banking-api
```

### 4. Kubernetes Configuration

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: swagger-config
data:
  SWAGGER_PROTOCOL: 'https'
  SWAGGER_HOST: 'api-service.banking.svc.cluster.local'

---
# deployment.yaml
spec:
  template:
    spec:
      containers:
        - name: api
          envFrom:
            - configMapRef:
                name: swagger-config
```

## 🎭 Use Cases

### Cloud-Native Deployments

- **Auto-detects** Kubernetes service names
- **Adapts** to container orchestration environments
- **Supports** service mesh configurations

### Multi-Environment CI/CD

- **Development**: localhost URLs for local testing
- **Staging**: staging domain URLs for QA testing
- **Production**: production domain URLs for live documentation

### Container Orchestration

- **Docker Compose**: Service name resolution
- **Kubernetes**: Service discovery integration
- **Docker Swarm**: Stack service naming

## 🔍 Troubleshooting

### Server URL Not Detected

```bash
# Check environment variables
echo $SWAGGER_HOST
echo $SWAGGER_PROTOCOL
echo $PUBLIC_API_URL

# Set explicit host
export SWAGGER_HOST=your-custom-host
```

### Multiple Servers Not Showing

- Ensure `NODE_ENV !== 'production'` for development servers
- Check that `STAGING_API_URL` is set if you want staging servers

### Container Resolution Issues

```bash
# Set explicit container host
export CONTAINER_HOST=your-container-name

# Or use Kubernetes service discovery
export KUBERNETES_SERVICE_HOST=service.namespace.svc.cluster.local
```

## 📚 API Reference

### SwaggerConfigUtil Methods

```typescript
// Get single server URL
SwaggerConfigUtil.getServerUrl(port: string | number): string

// Get multiple server configurations
SwaggerConfigUtil.getServerConfigurations(port: string | number):
  Array<{ url: string; description: string }>

// Apply servers to DocumentBuilder
SwaggerConfigUtil.addServers(builder: DocumentBuilder, port: string | number):
  DocumentBuilder
```

This dynamic configuration ensures your Swagger documentation works seamlessly across all deployment environments! 🎉
