package rbac

import rego.v1

# Role-Based Access Control policies
default allow := false

# Define role hierarchy
role_hierarchy := {
    "admin": ["user_manager", "order_manager", "user"],
    "user_manager": ["user"],
    "order_manager": ["user"],
    "user": []
}

# Check if user has role (including inherited roles)
has_role(user_roles, required_role) if {
    required_role in user_roles
}

has_role(user_roles, required_role) if {
    some user_role in user_roles
    required_role in role_hierarchy[user_role]
}

# Resource-based permissions
permissions := {
    "users": {
        "read": ["user", "user_manager", "admin"],
        "create": ["user_manager", "admin"],
        "update": ["user_manager", "admin"],
        "delete": ["admin"]
    },
    "orders": {
        "read": ["user", "order_manager", "admin"],
        "create": ["user", "order_manager", "admin"],
        "update": ["order_manager", "admin"],
        "delete": ["admin"]
    },
    "admin": {
        "read": ["admin"],
        "create": ["admin"],
        "update": ["admin"],
        "delete": ["admin"]
    }
}

# Main authorization rule
allow if {
    required_roles := permissions[input.resource][input.action]
    some required_role in required_roles
    has_role(input.user.roles, required_role)
}

# Special case: users can always access their own data
allow if {
    input.resource == "users"
    input.action == "read"
    input.resource_id == input.user.sub
}

# Tenant isolation - users can only access resources in their tenant
allow if {
    input.user.tenant == input.resource_tenant
    required_roles := permissions[input.resource][input.action]
    some required_role in required_roles
    has_role(input.user.roles, required_role)
}

# Debugging information
effective_roles := input.user.roles

decision := {
    "allow": allow,
    "user_roles": input.user.roles,
    "effective_roles": effective_roles,
    "required_roles": permissions[input.resource][input.action],
    "resource": input.resource,
    "action": input.action,
    "tenant": input.user.tenant,
    "resource_tenant": input.resource_tenant
}
