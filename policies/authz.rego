package authz

import rego.v1

# Default deny - secure by default
default allow := false

# Allow access if user has the required role
allow if {
    input.user.roles[_] == input.required_role
}

# Allow access to public endpoints
allow if {
    input.path == "public"
}

# Allow users to access their own resources
allow if {
    input.action == "read"
    input.resource_owner == input.user.sub
}

# Admin users can access everything
allow if {
    input.user.roles[_] == "admin"
}

# Tenant-based access control
allow if {
    input.user.tenant == input.resource_tenant
    input.user.roles[_] == "user"
    input.action in ["read", "list"]
}

# Role-based access for specific resources
allow if {
    input.resource_type == "orders"
    input.user.roles[_] in ["order_manager", "admin"]
    input.action in ["read", "create", "update"]
}

allow if {
    input.resource_type == "users"
    input.user.roles[_] in ["user_manager", "admin"]
    input.action in ["read", "list"]
}

# Detailed decision reasons for debugging
reason := "public_endpoint" if {
    input.path == "public"
}

reason := "user_has_required_role" if {
    input.user.roles[_] == input.required_role
}

reason := "admin_access" if {
    input.user.roles[_] == "admin"
}

reason := "own_resource_access" if {
    input.action == "read"
    input.resource_owner == input.user.sub
}

reason := "tenant_user_access" if {
    input.user.tenant == input.resource_tenant
    input.user.roles[_] == "user"
    input.action in ["read", "list"]
}

reason := "access_denied" if {
    not allow
}
