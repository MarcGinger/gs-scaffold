# Phase 1 JWT Authentication Test Endpoints 🧪

## Overview

These endpoints are specifically designed to test and validate Phase 1 JWT authentication functionality. Use these to verify that your JWT authentication is working correctly before proceeding to Phase 2 (OPA Authorization).

## Prerequisites

- **Keycloak server** running and configured
- **Valid JWT token** from Keycloak
- **Environment variables** properly configured (see `PHASE_1_AUTHENTICATION_COMPLETE.md`)

## Test Endpoints

### 1. **JWT Token Validation Test** 🔐

```http
GET /auth-test/phase1/jwt-validation
Authorization: Bearer <your-jwt-token>
```

**Purpose**: Validates JWT token and extracts all user information
**Tests**:

- JWT signature validation via JWKS
- Token claims extraction
- User object mapping
- Multi-tenant support

**Expected Response**:

```json
{
  "phase": "Phase 1 - JWT Authentication",
  "testName": "JWT Token Validation",
  "status": "SUCCESS",
  "results": {
    "tokenValidated": true,
    "jwksVerified": true,
    "userExtracted": true,
    "claimsProcessed": true
  },
  "extractedData": {
    "subject": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "tenant": "tenant-code",
    "roles": ["user", "admin"],
    "groups": ["developers"],
    "permissions": ["read", "write"]
  }
}
```

### 2. **Decorators Functionality Test** 🎯

```http
GET /auth-test/phase1/decorators-test
Authorization: Bearer <your-jwt-token>
```

**Purpose**: Tests all current user decorators
**Tests**:

- `@CurrentUserId()` decorator
- `@CurrentUserRoles()` decorator
- `@CurrentUser()` decorator

**Expected Response**:

```json
{
  "phase": "Phase 1 - JWT Authentication",
  "testName": "Current User Decorators",
  "status": "SUCCESS",
  "results": {
    "currentUserIdDecorator": true,
    "currentUserRolesDecorator": true,
    "currentUserDecorator": true,
    "decoratorsWorking": true
  },
  "extractedViaDecorators": {
    "userId": "user-uuid",
    "roles": ["user", "admin"],
    "fullUserObject": {...}
  }
}
```

### 3. **Multi-Tenant Support Test** 🏢

```http
GET /auth-test/phase1/multi-tenant-test
Authorization: Bearer <your-jwt-token>
```

**Purpose**: Validates multi-tenant configuration
**Tests**:

- Tenant code extraction from JWT
- Tenant ID extraction
- Multi-tenant setup detection

**Expected Response**:

```json
{
  "phase": "Phase 1 - JWT Authentication",
  "testName": "Multi-Tenant Support",
  "status": "SUCCESS",
  "results": {
    "multiTenantSupported": true,
    "tenantExtractionWorking": true,
    "tenantIsolationReady": true
  },
  "tenantInfo": {
    "hasTenant": true,
    "tenantCode": "tenant-code",
    "tenantId": "tenant-uuid",
    "isMultiTenantSetup": true
  }
}
```

### 4. **Role-Based Access Control Test** 👥

```http
GET /auth-test/phase1/role-based-test
Authorization: Bearer <your-jwt-token>
```

**Purpose**: Tests role, group, and permission extraction
**Tests**:

- Role extraction from JWT
- Group membership extraction
- Permission extraction
- Basic role checking logic

**Expected Response**:

```json
{
  "phase": "Phase 1 - JWT Authentication",
  "testName": "Role-Based Access Control (Simple)",
  "status": "SUCCESS",
  "results": {
    "roleExtractionWorking": true,
    "groupExtractionWorking": true,
    "permissionExtractionWorking": true,
    "readyForPhase2": true
  },
  "roleData": {
    "roles": ["user", "admin"],
    "groups": ["developers"],
    "permissions": ["read", "write"],
    "roleChecks": {
      "hasRoles": true,
      "isAdmin": true,
      "isUser": true
    }
  }
}
```

### 5. **Security Context & Features Test** 🛡️

```http
GET /auth-test/phase1/security-context-test
Authorization: Bearer <your-jwt-token>
```

**Purpose**: Tests enterprise security features
**Tests**:

- MFA verification status
- Security level extraction
- Client ID identification
- Audit trail readiness

**Expected Response**:

```json
{
  "phase": "Phase 1 - JWT Authentication",
  "testName": "Security Context & Features",
  "status": "SUCCESS",
  "results": {
    "jwtAuthenticationComplete": true,
    "securityContextExtracted": true,
    "auditTrailReady": true,
    "enterpriseFeaturesSupported": true
  },
  "securityContext": {
    "subject": "user-uuid",
    "tenant": "tenant-code",
    "mfaVerified": true,
    "securityLevel": "high"
  },
  "metadata": {
    "phase1Status": "COMPLETE ✅",
    "readyForPhase2": true
  }
}
```

## How to Test

### 1. First Test (Without Token - Expected 401)

Before setting up Keycloak, test that the endpoint is working by calling it without authentication:

```bash
# This should return 401 Unauthorized - which means the endpoint is working
curl -X GET http://localhost:3000/auth-test/phase1/jwt-validation

# Expected Response: 401 Unauthorized
# This confirms the JWT guard is working correctly
```

### 2. Get a JWT Token

If you have Keycloak configured, obtain a JWT token from your Keycloak server:

```bash
# Example token request (adjust for your Keycloak setup)
curl -X POST "http://localhost:8080/realms/gs-scaffold/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=gs-scaffold-api" \
  -d "client_secret=your-client-secret" \
  -d "username=your-username" \
  -d "password=your-password"
```

### 3. Test All Endpoints

Run through all the test endpoints to validate Phase 1 functionality:

```bash
# Set your token
TOKEN="your-jwt-token-here"

# Test 1: JWT Validation
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/auth-test/phase1/jwt-validation

# Test 2: Decorators
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/auth-test/phase1/decorators-test

# Test 3: Multi-tenant
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/auth-test/phase1/multi-tenant-test

# Test 4: Role-based
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/auth-test/phase1/role-based-test

# Test 5: Security context
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/auth-test/phase1/security-context-test
```

### 4. Expected Results

✅ **All tests should return `"status": "SUCCESS"`**
✅ **User information should be extracted correctly**
✅ **Multi-tenant setup should be detected (if configured)**
✅ **Roles, groups, and permissions should be available**

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check JWT token validity
   - Verify Keycloak JWKS endpoint is accessible
   - Confirm environment variables are set correctly

2. **Missing tenant information**
   - Check Keycloak client mappers
   - Verify tenant claims are included in JWT
   - Review token-to-user mapper configuration

3. **No roles/permissions**
   - Configure Keycloak role mappers
   - Check client scopes in Keycloak
   - Verify user has assigned roles

4. **JWKS validation failures**
   - Check `KEYCLOAK_URL` environment variable
   - Verify network connectivity to Keycloak
   - Check JWKS cache configuration

## Success Criteria for Phase 1

Phase 1 is complete when:

- ✅ All test endpoints return `SUCCESS` status
- ✅ JWT tokens are validated against Keycloak JWKS
- ✅ User information is extracted from JWT claims
- ✅ Current user decorators work correctly
- ✅ Multi-tenant support is functional (if required)
- ✅ Basic role/permission extraction works
- ✅ Security context is properly established

Once Phase 1 is validated, you're ready to proceed with **Phase 2: OPA Authorization Framework**! 🚀

## Next Steps

After validating Phase 1:

1. Review the results from all test endpoints
2. Fix any issues identified
3. Proceed to Phase 2 OPA integration
4. Use the existing OPA test endpoints (products, orders, users) to validate Phase 2
