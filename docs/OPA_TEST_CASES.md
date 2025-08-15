# OPA Policy Test Cases

## Test Data Based on Your JWT Token

Your JWT token contains:

- **sub**: `e9edbc6-33204f73-a8ce-a70b5b44ce25`
- **name**: `Marc Ginger`
- **email**: `marc.s.ginger@gmail.com`
- **tenant**: `core`
- **tenant_id**: `12345`
- **roles**: From realm_access - not directly provided but would be extracted by TokenMapper

## Test Cases for OPA Integration

### 1. Test API Endpoint Access

```json
{
  "input": {
    "path": "/auth-test/protected",
    "method": "GET",
    "user": {
      "sub": "e9edbc6-33204f73-a8ce-a70b5b44ce25",
      "name": "Marc Ginger",
      "email": "marc.s.ginger@gmail.com",
      "tenant": "core",
      "roles": ["user"]
    }
  }
}
```

### 2. Test Public Endpoint Access

```json
{
  "input": {
    "path": "/users",
    "method": "GET",
    "user": null
  }
}
```

### 3. Test Admin Endpoint Access

```json
{
  "input": {
    "path": "/auth-test/admin",
    "method": "GET",
    "user": {
      "sub": "e9edbc6-33204f73-a8ce-a70b5b44ce25",
      "tenant": "core",
      "roles": ["admin"]
    }
  }
}
```

### 4. Test Resource-Based Access

```json
{
  "input": {
    "resource": "users",
    "action": "read",
    "resource_tenant": "core",
    "user": {
      "sub": "e9edbc6-33204f73-a8ce-a70b5b44ce25",
      "tenant": "core",
      "roles": ["user"]
    }
  }
}
```

### 5. Test Own Resource Access

```json
{
  "input": {
    "action": "read",
    "resource_owner": "e9edbc6-33204f73-a8ce-a70b5b44ce25",
    "user": {
      "sub": "e9edbc6-33204f73-a8ce-a70b5b44ce25",
      "tenant": "core",
      "roles": ["user"]
    }
  }
}
```

## Ready to Test!

The policies are now loaded in OPA. We can test them using:

1. Direct OPA API calls
2. Integration with your application's OPA service
3. Your application's protected endpoints with the JWT token
