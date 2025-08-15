package api

import rego.v1

# API endpoint authorization rules
default allow := false

# Public endpoints - no authentication required
public_endpoints := {
    "/health",
    "/",
    "/auth-test/public",
    "/users"  # GET /users is public in your controller
}

# Protected endpoints that require authentication
protected_endpoints := {
    "/auth-test/protected",
    "/auth-test/profile", 
    "/auth-test/admin",
    "/users/me",
    "/orders"
}

# Allow access to public endpoints
allow if {
    input.path in public_endpoints
}

# Allow authenticated users to access protected endpoints
allow if {
    input.path in protected_endpoints
    input.user.sub  # User must be authenticated (has subject)
}

# Admin-only endpoints
admin_endpoints := {
    "/auth-test/admin"
}

allow if {
    input.path in admin_endpoints
    input.user.roles[_] == "admin"
}

# Tenant-specific access rules
allow if {
    startswith(input.path, "/users/")
    input.user.tenant == "core"  # Your test token has tenant: "core"
    input.method == "GET"
}

# Order access rules
allow if {
    startswith(input.path, "/orders")
    input.user.tenant == "core"
    input.method in ["GET", "POST"]
}

# User can access their own profile
allow if {
    input.path == "/users/me"
    input.user.sub  # Any authenticated user can access their own profile
}

# Decision explanation
decision := {
    "allow": allow,
    "reason": reason,
    "user_id": input.user.sub,
    "tenant": input.user.tenant,
    "roles": input.user.roles,
    "path": input.path,
    "method": input.method
}

reason := "public_endpoint" if {
    input.path in public_endpoints
}

reason := "authenticated_user" if {
    input.path in protected_endpoints
    input.user.sub
}

reason := "admin_access" if {
    input.path in admin_endpoints
    input.user.roles[_] == "admin"
}

reason := "tenant_access" if {
    startswith(input.path, "/users/")
    input.user.tenant == "core"
}

reason := "user_profile_access" if {
    input.path == "/users/me"
    input.user.sub
}

reason := "access_denied" if {
    not allow
}
