# COPILOT_INSTRUCTIONS.md — Security Baseline (AuthN, AuthZ, Secrets, Audit)

> Use these instructions to scaffold consistent, production-grade security across services in this DDD + CQRS + ESDB stack.

---

## TL;DR (Security Order)

1. **AuthN & Identity** (Keycloak/JWT) →
2. **Service-to-Service Trust** (mTLS + JWKS pinning) →
3. **AuthZ** (OPA policies, inputs, decision logging) →
4. **Data Protection** (PII classification, encryption, tokenization) →
5. **Audit & Traceability** (decision logs, ESDB metadata, log correlation) →
6. **Secrets & Config** (vault, rotations) →
7. **Supply Chain & Hardening** (SBOM, SAST, Docker/K8s)

---

## Core Assumptions

- **Keycloak** issues JWTs (users + service accounts).
- **OPA** enforces **authorization** (PEP in app, PDP in sidecar or central).
- **Multi-tenant**: all tokens and events carry `tenant` claims/fields.
- **Event Sourcing**: events immutable; **no secrets or raw PII** in payloads.
- **Standard metadata** propagates across HTTP → Commands → ESDB → Outbox/BullMQ → Workers → Projections.

---

## Types & Contracts (Repo-Wide)

### `IUserToken`

Use this shape everywhere the authenticated subject is required.

```ts
export interface IUserToken {
  sub: string;
  name: string;
  email: string;
  preferred_username?: string;
  tenant?: string;
  tenant_id?: string;
  client_id?: string;
}
```

**Mapping guidance**

- Prefer `tenant` (string code) for routing and keys; use `tenant_id` (UUID) for storage joins if available.
- For service-to-service calls, `client_id` identifies the calling service.
- Derive `roles`/`scope` from JWT claims (realm/app roles) in the **AuthN layer** and pass as computed fields to OPA input (do not extend `IUserToken`).

### Event/Job Metadata

```ts
export type EventMetadata = {
  correlationId: string;
  causationId?: string;
  tenant: string; // prefer token.tenant || token.tenant_id
  user?: { id: string; email?: string; name?: string };
  source: string; // service/component
  occurredAt: string; // ISO
  traceId?: string; // W3C traceparent id
};

export interface StandardJobMetadata {
  correlationId: string;
  source: string;
  timestamp: string; // ISO
  user?: { id: string; email?: string; tenant?: string };
  businessContext?: Record<string, any>;
  traceId?: string;
}
```

### OPA Input Contract (Stable)

```json
{
  "subject": {
    "id": "sub",
    "tenant": "t1",
    "client_id": "svc-a",
    "roles": ["manager"]
  },
  "action": { "type": "command", "name": "product.update" },
  "resource": { "type": "product", "tenant": "t1", "ownerId": "..." },
  "context": {
    "correlationId": "uuid",
    "traceId": "uuid",
    "time": "2025-08-14T11:00:00Z",
    "ip": "1.2.3.4"
  },
  "payload": { "changes": { "price": 1000 } }
}
```

> **Rule:** Version this contract when fields/semantics change (e.g., `input_version: 2`).

---

## What Copilot Should Scaffold — In Order

### 1) Authentication (Keycloak / JWT)

**Goals:** Validate JWTs; unify claims; propagate identity through commands/events/jobs.

**Required files/modules**

- `src/security/auth/jwt.strategy.ts`
  - Validate `iss`, `aud`, `exp`, `iat`, `nbf`, `kid`.
  - Fetch & cache JWKS; pin `iss` and accepted `aud`.

- `src/security/auth/current-user.decorator.ts` + request typing
- `src/security/auth/auth.guard.ts` (HTTP + RPC variants)
- `src/security/auth/token-to-user.mapper.ts` → map JWT claims → `IUserToken`

**Copilot prompts**

- “Create a NestJS `JwtAuthGuard` that validates Keycloak tokens via JWKS, pins issuer/audience, and exposes `IUserToken` on request context.”
- “Generate a `tokenToUser` mapper that extracts `sub,name,email,preferred_username,tenant,tenant_id,client_id` into `IUserToken`.”

**Definition of Done**

- Public routes explicitly annotated; everything else requires valid JWT.
- Unit tests for expired token, wrong audience, wrong issuer, rotated keys.

---

### 2) Service-to-Service Trust (Zero-trust inside the mesh)

**Goals:** Prevent spoofing; bind identity to channel.

**Requirements**

- **mTLS** between services (Ingress + sidecars/service mesh).
- Outbound HTTP clients use TLS + **certificate pinning** where feasible.
- For internal calls, prefer **client-credentials JWT** issued by Keycloak.

**Copilot prompts**

- “Add Axios/Nest HTTP module that attaches service JWT and validates upstream TLS; retries only on idempotent methods.”

**DoD**

- Calls fail closed if TLS/JWT invalid; retry logic bounded & idempotent.

---

### 3) Authorization with OPA (Rego)

**Goals:** Centralize policy; keep PEPs thin; log decisions.

**Policy model (suggested packages)**

- `authz/roles.rego` — RBAC/ABAC role resolution.
- `authz/tenancy.rego` — enforce `input.tenant == resource.tenant`.
- `authz/actions.rego` — allow/deny per action (`command`, `query`).
- `authz/attributes.rego` — field-level rules, conditional approvals.
- `authz/decisions.rego` — final `allow`, plus `obligations` (e.g., mask fields).

**PEP integration (NestJS)**

- `src/security/opa/opa.client.ts` (sidecar HTTP client + timeout + circuit breaker).
- `src/security/opa/opa.guard.ts` (`@UseGuards(OpaGuard)` on commands/queries).
  - Build input from `IUserToken`, route metadata (resource/action), request/body.
  - Deny by default; attach obligations (e.g., redact fields for queries).

**Copilot prompts**

- “Generate `OpaGuard` that calls OPA sidecar with stable input, denies on timeout, and emits structured decision logs (correlationId/traceId).”
- “Create Rego packages for RBAC + tenancy + action checks with versioned bundles.”

**DoD**

- Timeouts deny; **decision logs** include `allow`, `policy_version`, `input_hash`.
- Integration tests for allow/deny, cross-tenant deny, field-masking.

---

### 4) Data Protection (PII/Secrets)

**Goals:** Keep events clean; minimize sensitive data exposure.

**Conventions**

- **PII classification**: `PUBLIC`, `INTERNAL`, `SENSITIVE`, `RESTRICTED`.
  - Tag DTO fields; prohibit `SENSITIVE/RESTRICTED` in **events**.

- **Redaction/masking** middleware for logs and error details.
- **Encryption at rest**: DB + disk; **in transit**: TLS everywhere.
- **Tokenize** high-risk identifiers (e.g., PANs) before entering domain.

**Copilot prompts**

- “Add a Nest interceptor `RedactSensitiveFieldsInterceptor` using field path allowlist; ensure logs and ProblemDetails exclude secrets.”

**DoD**

- Tests verify events contain no restricted fields; logs are redacted.

---

### 5) Audit & Traceability

**Goals:** Full chain of custody for every mutation.

**Standards**

- **Event metadata**: enforce presence in command handlers.
- **Decision logs**: store OPA decisions (or ship to Loki/ELK) with `correlationId`.
- **Trace IDs**: inject `traceId` into logs, events, jobs (reuse `correlationId` or distinct `traceId` via W3C `traceparent`).

**Copilot prompts**

- “Create a `TraceMiddleware` that extracts/creates `traceId` (W3C), puts it on `AsyncLocalStorage`, enriches Pino logs and ESDB metadata.”

**DoD**

- E2E test: `traceId` visible in request logs, ESDB event metadata, BullMQ jobs, and OPA decision log.

---

### 6) Secrets & Config

**Goals:** Centralized, audited, rotatable.

**Requirements**

- Use a **vault** (Doppler, Vault, Azure Key Vault).
- **12-factor** env mapping → typed config with validation (`zod`/`joi`).
- **Key rotation runbooks** (JWT clients, DB creds, webhook secrets).

**Copilot prompts**

- “Add `ConfigModule` with schema validation, strict required vars, and secret providers (Doppler/AKV) with caching and TTL.”

**DoD**

- App fails fast on missing/invalid config; secrets never logged.

---

### 7) Supply Chain & Runtime Hardening

**Goals:** Reduce attack surface.

**Requirements**

- Enable **SAST** (CodeQL), **dependency audit**, and **SBOM** generation.
- Minimal base images, non-root user, read-only FS, drop Linux caps.
- K8s: NetworkPolicies, PodSecurity, resource limits, liveness/readiness.

**Copilot prompts**

- “Generate Dockerfile with distroless/node, non-root, read-only; add GH Actions to build SBOM and run CodeQL + `npm audit --production`.”

**DoD**

- CI fails on critical vulns; images run non-root & read-only.

---

## Example Snippets

**Nest route metadata for OPA**

```ts
export const Resource = (type: string, action: string) =>
  SetMetadata('resource', { type, action });

@UseGuards(JwtAuthGuard, OpaGuard)
@Resource('product', 'product.update')
@Post(':id')
updateProduct(/* ... */) { /* ... */ }
```

**OPA Guard (shape)**

```ts
@Injectable()
export class OpaGuard implements CanActivate {
  constructor(private readonly opa: OpaClient) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<{ user: IUserToken } & Request>();
    const { type, action } = this.getResourceMeta(ctx);
    const input = buildOpaInput(req, type, action);
    const decision = await this.opa.evaluate('authz/decisions/allow', input);
    if (!decision.allow)
      throw new ForbiddenException(decision.reason ?? 'Denied');
    attachObligations(req, decision.obligations);
    return true;
  }
}
```

**Event/Job metadata enforcement**

```ts
export function buildStandardMeta(
  user: IUserToken | undefined,
  source: string,
  corrId?: string,
) {
  return {
    correlationId: corrId ?? crypto.randomUUID(),
    source,
    occurredAt: new Date().toISOString(),
    user: user && { id: user.sub, email: user.email, name: user.name },
    tenant: user?.tenant ?? user?.tenant_id ?? 'unknown',
    traceId: getTraceId(),
  } satisfies EventMetadata;
}
```

**Redis key helper**

```ts
export const rkey = (parts: (string | number | undefined)[]) =>
  parts.filter(Boolean).join(':');
// rkey(['app', env, token.tenant ?? token.tenant_id, 'product', id])
```

---

## Acceptance Tests (Security)

- **JWT validation:** wrong `aud`/`iss` rejected; key rotation handled.
- **OPA deny-by-default:** removal of policy/bundle → requests denied.
- **Tenancy isolation:** cross-tenant access always denied.
- **Field masking:** forbidden attributes removed per obligations.
- **Event hygiene:** no restricted PII in payloads; metadata always present.
- **Trace continuity:** same `traceId` visible in logs → OPA decision → ESDB → BullMQ.

---

## PR Checklist (append to security-touching PRs)

- [ ] JWT validation & JWKS caching with issuer/audience pinning
- [ ] OPA input contract versioned; sidecar timeouts deny
- [ ] Decision logging emits `correlationId`/`traceId`
- [ ] No sensitive fields in events/logs (tests updated)
- [ ] Secrets via vault; config schema validated
- [ ] Dockerfile hardened; CI SAST/deps audit/SBOM enabled

---

## Next Steps (suggested sequence)

1. Add `JwtAuthGuard` + JWKS client and wire into gateway/service apps.
2. Introduce `TraceMiddleware` + `AsyncLocalStorage`; enrich Pino + ESDB + BullMQ.
3. Add `OpaClient` + `OpaGuard` and a minimal Rego bundle (RBAC + tenancy + action).
4. Turn on decision logging to Loki/ELK with `correlationId`.
5. Add PII classification decorators + redaction interceptor.
6. Harden Dockerfiles; enable CodeQL + SBOM in GitHub Actions.
7. Document runbooks: key rotation, incident response, policy rollout/rollback.
