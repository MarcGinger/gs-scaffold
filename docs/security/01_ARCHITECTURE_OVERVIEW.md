# Security Architecture Overview

_Keycloak (AuthN) + OPA (AuthZ) + Audit + PII Protection + Result Interceptor_

---

## 1) Goals & Non-Goals

**Goals:** strong bearer-token authentication, policy-driven authorization, tenant isolation, auditability, PII protection, and production-ready observability with bounded, standardized error handling at the HTTP boundary.

**Non-Goals:** building a custom IdP, inventing a new policy language, or logging raw sensitive data.

---

## 2) High-Level Components

- **Keycloak (IdP)** issues JWTs (RS256) and exposes JWKS; application validates audience/issuer and signature. Mapper converts claims into a hardened `IUserToken`.
- **OPA sidecar** evaluates Rego policies (RBAC + ABAC + obligations) to return allow/deny + obligations and a policy version/checksum for audit.
- **Security Guards**:
  - `JwtAuthGuard` (Passport) → verifies token, normalizes user.
  - `OpaGuard` → builds input (subject/action/resource/context), calls OPA, applies obligations, fail-closed on error/timeout.
  - (Optional) composite `SecurityGuard` registered as `APP_GUARD`.

- **Decision/Audit Logger** records every sensitive decision with stable IDs, sampling, redaction, and bounded sizes.
- **PII Framework** scans & protects data (mask, redact, hash, encrypt, tokenize, block) and feeds monitoring.
- **Result Interceptor** standardizes responses with RFC-9457 Problem Details, attaches correlation/trace/tenant context, and ensures explicit status codes.
- **Security Headers + CORS** hardened defaults via Helmet, environment-aware CORS, and ingress-propagated correlation/trace headers.

---

## 3) End-to-End Request Flow (Happy Path)

1. **Client → API** with `Authorization: Bearer <JWT>`; gateway forwards `x-correlation-id` / `x-trace-id`.
2. **JwtAuthGuard** validates signature via JWKS (cached/rate-limited), enforces `aud`/`iss`, tolerates small clock skew, and maps claims to `IUserToken` with bounded/normalized roles.
3. **OpaGuard** constructs `input { subject, action, resource, context, payload }`, calls sidecar, fails closed on timeout, and attaches obligations (e.g., field masking).
4. **Controller/Service** executes business logic; PII framework optionally protects data prior to persistence/logging.
5. **Decision Logger** writes structured audit (allow/deny, policy version, obligations), with redaction/sampling/size caps.
6. **Result Interceptor** returns either `200 OK` with value or an RFC-9457 Problem Details error with explicit status; context fields (correlationId, tenantId, traceId, ip, ua) are attached.

> **Fallbacks:** If OPA is unavailable/slow, access **denies** (fail-closed) and is audited; if JWT is invalid/missing, return **401/403** with standardized errors (no 500s from strategy).

---

## 4) Authorization Model (Rego)

- **Tenant isolation**: subject.tenant must match resource.tenant (system accounts may bypass per policy).
- **RBAC/ABAC hybrid**: role maps for typical actions + attribute checks for ownership and sensitive operations.
- **Obligations**: mask fields, require MFA, emit row filters; returned alongside decisions for the app to enforce.

---

## 5) Identity Mapping & Claim Hygiene

- **Hardened Token Mapper**: immutable config, prototype-pollution-safe traversal, deterministic outputs, bounded role/group lists, and normalized string handling to prevent memory/DoS and output drift.
- **Strategy improvements**: base64url-correct parsing via `jwks-rsa`, signature verification with caching/limits, centralized error factory, header preflight guard for friendly 401s.

---

## 6) Audit, Monitoring & PII Protection

- **Audit**: redaction (emails/IP/tokens), fixed UUIDv4 IDs, exact size caps (reason, metadata, payload), reason codes aligned to OPA, intelligent sampling (e.g., 5% allow, 100% deny/error).
- **Monitoring**: authN/authZ/PII/error/emergency metrics, thresholds, trend analysis, and alerts.
- **PII Engine**: detectors (patterns + field names + confidence), protection actions (mask/redact/hash/encrypt/tokenize/block), risk scoring, compliance status, full audit trails.

---

## 7) Error Handling & API Contract

- **Result Interceptor**:
  - Transforms `Result<T,E>` to either success body or RFC-9457 Problem Details error.
  - Explicitly sets HTTP status; context preserved and logged at the boundary.
  - Ready-to-document responses in Swagger (global ProblemDetails).

---

## 8) Production Readiness & Ops

- **Security headers (Helmet)**, restrictive **CORS**, **OPA audit integration**, and test scaffolds are in place; the stack is production-ready with optional follow-on items (rate limiting, advanced monitoring) tracked.
- **JWT debugging guidance** ensures 401s instead of 500s, with options for dev mocks and local Keycloak.

---

## 9) Deployment & Topology (dev parity)

- **Docker compose** brings up Keycloak + Postgres + OPA; app depends on both and consumes `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `JWT_AUDIENCE`, `OPA_URL`, `OPA_TIMEOUT_MS`.
- **Ingress/Gateway** should forward correlation/trace headers; sidecar model for OPA recommended per service/pod.

---

## 10) Security Posture & Compliance Outcomes

- **Defense-in-depth**: verified JWTs → policy checks → obligations → PII controls → bounded, redacted audit.
- **Compliance**: GDPR/CCPA-friendly by default (masking, hashing, tokenization, redaction, audit, retention).
- **Operational**: structured logs with correlation/tenant/user bindings; sampling keeps costs predictable.

---

## 11) Open Questions / Next Decisions

1. **Circuit-breaker & latency SLOs for OPA** (what thresholds/alerts?).
2. **Policy bundles & versioning** (checksum surfaced in every decision + CI/CD bundling).
3. **Global composite guard vs. per-route** (trade-off simplicity vs. fine-grained overrides).
4. **Rate limiting & advanced bot protection** at edge (post-MVP).

---

## 12) Appendix: Document Map (source of truth)

- Enhanced Token Mapper Security
- JWT Authentication Security Enhancements
- JWT Debug Analysis
- Production Audit Implementation (Complete)
- Result Interceptor Enhancements
- Security Framework / Implementation (Complete)
- Security Monitoring & PII Implementation (Complete)

---

### TL;DR

A production-ready security spine: **Keycloak**-validated JWTs → **OPA** policies (RBAC/ABAC + obligations) → **PII** protection & standardized error boundary → audited, redacted, sampled logs with full context. Decide policy bundling/versioning, OPA circuit-breaker thresholds, and edge rate limiting to finish the last mile.
