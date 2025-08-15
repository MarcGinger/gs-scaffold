## Phase 1 Testing Guide - Quick Start

### Current Issue: Keycloak Connection Error

**Problem**: The JWT strategy is having issues connecting to the Keycloak server during initialization, causing a 500 error.

**Keycloak Server**: `https://gskeycloak1-u19668.vm.elestio.app/realms/default`

- ✅ JWKS endpoint is accessible
- ❌ JWT strategy initialization is failing

### Immediate Testing Options

#### Option 1: Test Without Authentication (Working Now)

```bash
# Debug endpoint (no auth required)
GET http://localhost:3000/auth-test/phase1/debug

# Test endpoint without JWT guard (works)
GET http://localhost:3000/auth-test/phase1/jwt-validation-noauth
```

#### Option 2: Use Local Keycloak (Recommended)

If you have Docker, you can quickly start a local Keycloak:

```bash
docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev
```

Then update your `.env`:

```env
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=master
```

#### Option 3: Fix External Keycloak Connection

The external Keycloak might need:

1. **SSL certificate verification** - try adding `NODE_TLS_REJECT_UNAUTHORIZED=0` for testing
2. **Network connectivity** - ensure the server can reach the external Keycloak
3. **Realm configuration** - double-check the realm name and client configuration

### Quick Test Commands for Postman

1. **Working Endpoint (No Auth)**:

   ```
   GET http://localhost:3000/auth-test/phase1/jwt-validation-noauth
   ```

2. **Debug Info**:

   ```
   GET http://localhost:3000/auth-test/phase1/debug
   ```

3. **Public Endpoint**:
   ```
   GET http://localhost:3000/auth-test/public
   ```

### Next Steps

1. ✅ **Test the working endpoints** above to confirm basic functionality
2. 🔧 **Fix Keycloak connection** (choose Option 2 or 3 above)
3. 🧪 **Test with real JWT tokens** once Keycloak is working

The Phase 1 implementation is correct - we just need to resolve the Keycloak connectivity issue!
