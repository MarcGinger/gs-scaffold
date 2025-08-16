import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { SwaggerConfigUtil } from './swagger-config.util';

/**
 * 🔐 Security Documentation
 *
 * This module provides comprehensive documentation about our platform's
 * security architecture, authentication, authorization, and security best practices.
 */
export class SecurityDocumentation {
  static setup(app: INestApplication, port: string | number): void {
    const config = new DocumentBuilder()
      .setTitle('🔐 Platform Security Documentation')
      .setDescription(
        `
# 🔐 Platform Security Documentation

Welcome to our **Platform Security Documentation**. This guide covers our security architecture, authentication methods, authorization models, and security best practices that protect our platform and data.

---

## 🎯 **Authentication Methods**

**Primary Authentication:**
\`\`\`http
Authorization: Bearer <your-jwt-token>
\`\`\`

**Supported Authentication Providers:**
- **🔑 JWT Tokens**: Stateless authentication with configurable expiration
- **🏢 LDAP Integration**: Active Directory and OpenLDAP support for enterprise SSO
- **🌐 OAuth 2.0/OIDC**: Third-party identity provider integration
- **🔐 API Keys**: Service-to-service authentication for system integrations

---

## 🏗️ **Authorization Architecture**

### **Open Policy Agent (OPA) Integration**
Our platform uses **OPA** for fine-grained authorization policies:

\`\`\`rego
# Example OPA Policy for Resource Operations
package platform.authorization

default allow = false

# Allow users to access their own resources
allow {
    input.method == "GET"
    input.path[1] == "resources"
    input.path[2] == input.user.resource_id
}

# Allow managers to access subordinate resources
allow {
    input.user.role == "manager"
    input.method == "GET"
    input.path[1] == "resources"
    subordinate_resource(input.path[2])
}

subordinate_resource(resource_id) {
    resource_id in input.user.managed_resources
}
\`\`\`

**OPA Policy Categories:**
- **Resource Access**: Entity, transaction, and resource permissions
- **Operation Permissions**: CRUD operations based on user context
- **Time-based Access**: Business hours and maintenance window restrictions
- **Geographic Restrictions**: Location-based access controls
- **Risk-based Authorization**: Dynamic permissions based on operation risk scores

---

## 🎛️ **Access Control Models**

### **RBAC (Role-Based Access Control)**
Traditional role-based permissions for organizational hierarchy:

\`\`\`json
{
  "roles": {
    "user": {
      "permissions": ["read:own_resource", "create:request", "read:own_data"]
    },
    "operator": {
      "permissions": ["read:user_resource", "create:operation", "update:status"]
    },
    "manager": {
      "permissions": ["read:all_resources", "approve:large_operation", "create:resource"]
    },
    "admin": {
      "permissions": ["*"]
    }
  }
}
\`\`\`

**RBAC Use Cases:**
- **Organizational Structure**: Department-based access (operations, management, support)
- **Functional Roles**: Operator, supervisor, analyst, auditor
- **System Roles**: API consumer, batch processor, monitoring service

### **ABAC (Attribute-Based Access Control)**
Dynamic permissions based on user, resource, environment, and action attributes:

\`\`\`json
{
  "policy": {
    "description": "Allow resource access based on user relationship",
    "condition": {
      "and": [
        {"equals": [{"var": "user.department"}, "operations"]},
        {"equals": [{"var": "resource.type"}, "standard"]},
        {"less_than": [{"var": "action.impact_level"}, 5]},
        {"in": [{"var": "environment.time"}, {"var": "business_hours"}]}
      ]
    }
  }
}
\`\`\`

**ABAC Attributes:**
- **User Attributes**: Department, seniority, location, security clearance
- **Resource Attributes**: Resource type, classification, risk rating, owner
- **Environment Attributes**: Time, IP location, device type, network
- **Action Attributes**: Operation type, impact level, frequency, risk score

---

## 🛡️ **Security Features**

### **Multi-Factor Authentication (MFA)**
\`\`\`http
# Step 1: Initial authentication
POST /api/v1/auth/login
{
  "username": "user@company.com",
  "password": "secure_password"
}

# Response includes MFA challenge
{
  "requires_mfa": true,
  "challenge_id": "ch_abc123",
  "methods": ["sms", "email", "totp", "hardware_token"]
}

# Step 2: MFA verification
POST /api/v1/auth/mfa/verify
{
  "challenge_id": "ch_abc123",
  "method": "totp",
  "code": "123456"
}
\`\`\`

### **API Security Controls**
- **🚦 Rate Limiting**: Per-user and per-endpoint throttling
- **📍 IP Allowlisting**: Restrict access to known networks
- **🔒 TLS 1.3**: End-to-end encryption for all communications
- **🕵️ Request Signing**: HMAC-based request integrity verification
- **⏰ Token Expiration**: Configurable JWT lifetime and refresh policies

### **LDAP Integration**
\`\`\`yaml
# LDAP Configuration Example
ldap:
  server: "ldaps://corporate-ad.company.com:636"
  base_dn: "ou=users,dc=company,dc=com"
  bind_dn: "cn=api-service,ou=services,dc=company,dc=com"
  attributes:
    username: "sAMAccountName"
    email: "mail"
    department: "department"
    manager: "manager"
    groups: "memberOf"
  group_mapping:
    "CN=Platform-Operators,OU=Groups,DC=company,DC=com": "operator"
    "CN=Platform-Managers,OU=Groups,DC=company,DC=com": "manager"
    "CN=IT-Admins,OU=Groups,DC=company,DC=com": "admin"
\`\`\`

### **Audit & Compliance**
\`\`\`json
{
  "audit_log": {
    "timestamp": "2025-07-23T10:30:00.000Z",
    "user_id": "user123",
    "session_id": "sess_abc123",
    "action": "resource.operation.create",
    "resource": "resource/456789",
    "result": "allowed",
    "policy_decision": {
      "policies_evaluated": ["operation_limits", "business_hours", "user_permissions"],
      "decision_time_ms": 15,
      "decision_reason": "User has operation permission and within daily limit"
    },
    "request_context": {
      "ip_address": "192.168.1.100",
      "user_agent": "PlatformApp/2.1.0",
      "geo_location": "New York, NY",
      "risk_score": 0.2
    }
  }
}
\`\`\`

---

## 🔧 **Security Implementation Guidelines**

### **Token Management**
\`\`\`javascript
// JWT Token Structure
{
  "header": {
    "typ": "JWT",
    "alg": "RS256",
    "kid": "platform-signing-key-2025"
  },
  "payload": {
    "sub": "user123",
    "iat": 1642781400,
    "exp": 1642785000,
    "aud": "platform-api",
    "iss": "platform-auth-service",
    "roles": ["user"],
    "permissions": ["read:own_resource", "create:operation"],
    "mfa_verified": true,
    "device_id": "dev_abc123"
  }
}
\`\`\`

### **Error Handling & Security**
\`\`\`json
{
  "statusCode": 403,
  "message": "Insufficient permissions for this operation",
  "error": "Forbidden",
  "timestamp": "2025-07-23T10:30:00.000Z",
  "path": "/api/v1/resource/123456",
  "security_context": {
    "policy_violation": "action_not_permitted",
    "required_permission": "resource:modify",
    "user_permissions": ["resource:view", "resource:create"]
  }
}
\`\`\`

### **Best Practices**
- **🔄 Token Rotation**: Implement automatic token refresh before expiration
- **🚫 Principle of Least Privilege**: Grant minimum required permissions
- **📊 Continuous Monitoring**: Real-time security event analysis
- **🔍 Regular Audits**: Periodic access reviews and permission cleanup
- **🛡️ Defense in Depth**: Multiple security layers (authentication, authorization, encryption)
- **📱 Device Binding**: Associate tokens with specific devices for enhanced security

---

## 🔐 **Data Protection & Encryption**

### **Encryption Standards**
- **Encryption at Rest**: AES-256 encryption for stored data
- **Encryption in Transit**: TLS 1.3 for all network communications
- **Key Management**: Hardware Security Modules (HSM) for key storage
- **Certificate Management**: Automated certificate lifecycle management

### **Data Classification**
| Classification | Description | Protection Level |
|----------------|-------------|------------------|
| **Public** | Information intended for public consumption | Basic protection |
| **Internal** | Information for internal use only | Standard encryption |
| **Confidential** | Sensitive business information | Enhanced encryption + access controls |
| **Restricted** | Highly sensitive data (PII, financial) | Maximum encryption + strict access controls |

### **Privacy Controls**
- **Data Masking**: Sensitive data protection in non-production environments
- **Pseudonymization**: Replace personally identifiable information with pseudonyms
- **Right to Erasure**: Automated data deletion capabilities
- **Data Minimization**: Collect and process only necessary data

---

## 🚨 **Threat Detection & Response**

### **Security Monitoring**
- **Real-time Threat Detection**: Machine learning-based anomaly detection
- **Security Information and Event Management (SIEM)**: Centralized log analysis
- **User and Entity Behavior Analytics (UEBA)**: Behavioral baseline monitoring
- **Threat Intelligence**: Integration with external threat feeds

### **Incident Response**
1. **Detection**: Automated alerts and monitoring systems
2. **Analysis**: Security team investigation and threat assessment
3. **Containment**: Immediate actions to limit damage
4. **Eradication**: Remove threats and vulnerabilities
5. **Recovery**: Restore systems and monitor for recurrence
6. **Lessons Learned**: Post-incident review and improvements

### **Vulnerability Management**
- **Regular Security Scans**: Automated vulnerability assessments
- **Penetration Testing**: Quarterly third-party security testing
- **Dependency Scanning**: Continuous monitoring of third-party libraries
- **Security Patching**: Automated patch management with testing pipelines

---

## 🛡️ **Compliance & Governance**

### **Regulatory Compliance**
- **SOC 2 Type II**: Service Organization Control compliance
- **ISO 27001**: Information Security Management System
- **PCI DSS**: Payment Card Industry Data Security Standard
- **GDPR**: General Data Protection Regulation compliance

### **Security Governance**
- **Security Policies**: Comprehensive security policy framework
- **Risk Assessments**: Regular security risk evaluations
- **Security Training**: Mandatory security awareness programs
- **Third-party Risk**: Vendor security assessment processes

### **Audit & Reporting**
- **Continuous Auditing**: Automated compliance monitoring
- **Security Metrics**: Key performance indicators for security
- **Executive Reporting**: Regular security posture reports
- **Regulatory Reporting**: Automated compliance report generation

---

## 🔒 **Secure Development Practices**

### **Secure Code Development**
- **Security Code Reviews**: Mandatory peer reviews with security focus
- **Static Application Security Testing (SAST)**: Automated code analysis
- **Dynamic Application Security Testing (DAST)**: Runtime security testing
- **Interactive Application Security Testing (IAST)**: Real-time security feedback

### **DevSecOps Integration**
- **Security Gates**: Automated security checks in CI/CD pipelines
- **Container Security**: Image scanning and runtime protection
- **Infrastructure as Code Security**: Security testing for IaC templates
- **Secrets Management**: Secure storage and rotation of secrets

### **Security Testing**
- **Unit Tests**: Security-focused unit testing
- **Integration Tests**: Security validation across components
- **End-to-End Tests**: Complete security workflow testing
- **Chaos Engineering**: Security resilience testing

---

## 💡 **Security Resources**

### 📚 **Quick Reference**
- **[🔐 Authentication Guide]**: Step-by-step authentication setup
- **[🛡️ Authorization Policies]**: OPA policy examples and templates
- **[🔧 Security Tools]**: Development security tooling
- **[📊 Security Metrics]**: Monitoring and alerting dashboards

### 🛠️ **Security Tools**
- **Security Scanners**: Automated vulnerability detection
- **Policy Engines**: OPA policy testing and validation
- **Key Management**: Secure key generation and rotation
- **Audit Tools**: Comprehensive audit trail analysis

### 📖 **Security Training**
- **Security Awareness**: Regular training programs
- **Secure Coding**: Development best practices
- **Incident Response**: Emergency response procedures
- **Compliance Training**: Regulatory requirement education

---

*💬 **Security Questions?** Contact the security team for guidance on security policies, threat assessment, or incident response.*

`,
      )
      .setVersion('1.0');

    // Add dynamic server configuration
    SwaggerConfigUtil.addServers(config, port);

    // Create document with empty include array - security documentation only
    const document = SwaggerModule.createDocument(app, config.build(), {
      include: [], // Security documentation only - no actual endpoints
      deepScanRoutes: false,
      ignoreGlobalPrefix: false,
    });

    // Clear any accidentally included paths and schemas
    document.paths = {};
    document.components = document.components || {};
    document.components.schemas = {
      // Only include security-related schemas
      SecurityPolicy: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'AUTH-001' },
          name: { type: 'string', example: 'JWT Authentication Policy' },
          description: {
            type: 'string',
            example: 'Defines JWT token validation and expiration rules',
          },
          rules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                condition: { type: 'string' },
                action: { type: 'string', enum: ['allow', 'deny'] },
                priority: { type: 'number' },
              },
            },
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'draft'],
            example: 'active',
          },
          lastUpdated: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'description', 'rules', 'status'],
      },
      AuditEvent: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          userId: { type: 'string', example: 'user123' },
          sessionId: { type: 'string', example: 'sess_abc123' },
          action: { type: 'string', example: 'resource.operation.create' },
          resource: { type: 'string', example: 'resource/456789' },
          result: {
            type: 'string',
            enum: ['allowed', 'denied'],
            example: 'allowed',
          },
          ipAddress: { type: 'string', example: '192.168.1.100' },
          userAgent: { type: 'string', example: 'PlatformApp/2.1.0' },
          riskScore: { type: 'number', minimum: 0, maximum: 1, example: 0.2 },
        },
        required: [
          'timestamp',
          'userId',
          'action',
          'resource',
          'result',
          'ipAddress',
        ],
      },
    };

    SwaggerModule.setup('api/docs/security', app, document);
  }

  static getEndpoint(port: string | number): string {
    return `${SwaggerConfigUtil.getServerUrl(port)}/api/docs/security`;
  }
}
