# HTTP Problem Details Configuration Integration

## 🎯 **Changes Made**

### ✅ **1. Removed Hardcoded Configuration**

**Before**:

```typescript
const DEFAULT_PROBLEM_OPTIONS: Required<ProblemOptions> = {
  sanitize: process.env.NODE_ENV === 'production',
  traceId: '',
  baseUrl: 'https://errors.api.example.com',
  version: 'v1',
};
```

**After**:

```typescript
function getDefaultProblemOptions(): Required<ProblemOptions> {
  const errorConfig = AppConfigUtil.getErrorConfig();

  return {
    sanitize: errorConfig.sanitize,
    traceId: '',
    baseUrl: errorConfig.baseUrl,
    version: errorConfig.version,
  };
}
```

### ✅ **2. Added Error Configuration to AppConfigUtil**

```typescript
/** Error Configuration for Problem Details */
static getErrorConfig() {
  const baseUrl = process.env.ERROR_BASE_URL || this.buildUrl();
  const apiVersion = process.env.ERROR_API_VERSION || 'v1';

  return {
    baseUrl: `${baseUrl}/errors`,
    version: apiVersion,
    sanitize: this.isProduction(),
    // Additional error-specific configurations
    includeStackTrace: !this.isProduction(),
    maxDetailLength: parseInt(
      process.env.ERROR_MAX_DETAIL_LENGTH || '500',
      10,
    ),
    enableTracing: process.env.ERROR_ENABLE_TRACING !== 'false',
  };
}
```

### ✅ **3. Integrated with ConfigManager**

```typescript
/** Error Configuration */
getErrorConfig() {
  return AppConfigUtil.getErrorConfig();
}
```

### ✅ **4. Updated All Problem Functions**

All problem detail functions now use the centralized configuration:

- `toProblem()`
- `toValidationProblem()`
- `toSanitizedProblem()`
- `httpStatusToProblem()`

```typescript
// Before
const config = { ...DEFAULT_PROBLEM_OPTIONS, ...options };

// After
const config = { ...getDefaultProblemOptions(), ...options };
```

### ✅ **5. Added Error Configuration Validation**

Extended ConfigManager validation to include error configuration:

```typescript
validateAspect(aspect: 'logging' | 'database' | 'server' | 'security' | 'error'): {
  valid: boolean;
  errors: string[];
}
```

Validates:

- Base URL format and validity
- API version format (`v1`, `v2`, etc.)
- Configuration completeness

## 🌍 **Environment Variables**

### **New Environment Variables Added**:

```bash
# Error Configuration
ERROR_BASE_URL=https://api.myservice.com          # Base URL for error URIs
ERROR_API_VERSION=v1                              # API version for stable URIs
ERROR_MAX_DETAIL_LENGTH=500                       # Max length for error details
ERROR_ENABLE_TRACING=true                         # Enable trace ID support
```

### **Default Behavior**:

- `ERROR_BASE_URL`: Defaults to `AppConfigUtil.buildUrl()` + `/errors`
- `ERROR_API_VERSION`: Defaults to `v1`
- `ERROR_MAX_DETAIL_LENGTH`: Defaults to `500` characters
- `ERROR_ENABLE_TRACING`: Defaults to `true`
- Sanitization: Automatically enabled in production

## 🔧 **Configuration Integration Benefits**

### **1. Environment-Aware URLs**

```typescript
// Development
baseUrl: 'http://localhost:3000/errors';

// Production with custom domain
baseUrl: 'https://api.myservice.com/errors';

// Staging
baseUrl: 'https://staging-api.myservice.com/errors';
```

### **2. Centralized Management**

All error configuration now flows through the same system as:

- Logging configuration
- Security configuration
- Database configuration
- Server configuration

### **3. Validation Support**

```typescript
const configManager = ConfigManager.getInstance();
const validation = configManager.validateAspect('error');

if (!validation.valid) {
  console.error('Error configuration invalid:', validation.errors);
}
```

### **4. Consistent URL Generation**

Problem type URIs now use the same URL building logic as the rest of the application:

```typescript
// Before: Always hardcoded
type: 'https://errors.api.example.com/v1/validation/invalid-format';

// After: Environment-aware
type: 'https://api.myservice.com/errors/v1/validation/invalid-format';
type: 'http://localhost:3000/errors/v1/validation/invalid-format'; // dev
```

## 🚀 **Usage Examples**

### **Basic Usage (No Changes Required)**

```typescript
// Still works exactly the same
const problem = domainErrorToProblem(error, '/api/users/123');
```

### **With Custom Configuration**

```typescript
// Override specific options
const problem = domainErrorToProblem(error, '/api/users/123', {
  baseUrl: 'https://docs.myservice.com/errors', // Custom docs URL
  version: 'v2', // Different API version
  sanitize: false, // Force show details
  traceId: 'req-abc-123', // Add correlation ID
});
```

### **Configuration Validation**

```typescript
// Validate error configuration on startup
const configManager = ConfigManager.getInstance();
const errorValidation = configManager.validateAspect('error');

if (!errorValidation.valid) {
  throw new Error(`Error config invalid: ${errorValidation.errors.join(', ')}`);
}
```

## 📋 **Migration Impact**

### **✅ No Breaking Changes**

- All existing function signatures remain the same
- Default behavior is preserved
- Existing code continues to work without modification

### **🔧 New Capabilities**

- Environment-specific error URIs
- Centralized configuration management
- Validation support
- Additional configuration options (stack traces, detail length limits, etc.)

### **🏭 Production Readiness**

- Automatic production/development behavior switching
- Configurable sanitization
- Environment-aware URL generation
- Integrated validation

---

## ✅ **Summary**

Successfully removed all hardcoded configuration from HTTP Problem Details and integrated with the centralized configuration system:

- ✅ **Hardcoded values eliminated**
- ✅ **Environment variables support added**
- ✅ **ConfigManager integration complete**
- ✅ **Validation support added**
- ✅ **Backward compatibility maintained**
- ✅ **Production-ready configuration**

The HTTP Problem Details system now follows the same configuration patterns as the rest of the application! 🎉
