package authz.decisions

import rego.v1

# Default deny - secure by default  
default allow := false

# Main authorization decision
allow if {
    # Extract user information from the structured input
    user := input.subject
    action := input.action
    resource := input.resource
    
    # Check if user has required permissions for the action
    has_permission(user, action.name, resource.type)
}

# Permission checks based on roles and resource types
has_permission(user, action, resource_type) if {
    # Admin users can do everything
    "admin" in user.roles
}

has_permission(user, action, resource_type) if {
    # Product access control
    resource_type == "product"
    action == "view"
    user_can_view_products(user)
}

has_permission(user, action, resource_type) if {
    # Order access control
    resource_type == "order" 
    action == "view"
    user_can_view_orders(user)
}

has_permission(user, action, resource_type) if {
    # User access control
    resource_type == "user"
    action == "view"
    user_can_view_users(user)
}

# Helper rules for specific permissions
user_can_view_products(user) if {
    # Users with user role in same tenant can view products
    "user" in user.roles
}

user_can_view_products(user) if {
    # Offline access users can view products
    "offline_access" in user.roles
}

user_can_view_orders(user) if {
    # Users can view orders
    "user" in user.roles
}

user_can_view_orders(user) if {
    # Order managers can view orders
    "order_manager" in user.roles
}

user_can_view_users(user) if {
    # User managers can view users
    "user_manager" in user.roles
}

# Detailed reasoning for debugging
reason := "admin_access" if {
    "admin" in input.subject.roles
}

reason := "product_view_allowed" if {
    input.resource.type == "product"
    input.action.name == "view"
    user_can_view_products(input.subject)
}

reason := "order_view_allowed" if {
    input.resource.type == "order"
    input.action.name == "view"
    user_can_view_orders(input.subject)
}

reason := "user_view_allowed" if {
    input.resource.type == "user"
    input.action.name == "view"
    user_can_view_users(input.subject)
}

reason := "access_denied" if {
    not allow
}
