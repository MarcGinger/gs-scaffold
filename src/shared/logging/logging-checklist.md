# Common Logging Implementation Checklist

This checklist ensures all logging in the project follows the centralized strategy described in COPILOT_INSTRUCTIONS_LOGGING.md.

---

## 1. Foundation & Dependencies

- [x] `nestjs-pino`, `nestjs-cls`, and required transports installed

## 2. Logging Module

- [x] `LoggingModule` scaffolds with config-driven sink selection
- [x] All logs include `app`, `environment`, `version`

## 3. CLS & Trace Middleware

- [x] `nestjs-cls` configured for async context
- [x] `TraceMiddleware` sets/propagates `traceId` in CLS
- [x] CLS context includes `traceId`, `correlationId`, `tenantId`, `userId`

## 4. Centralized Log Helpers

- [x] `structured-logger.ts` implements typed log helpers
- [x] All code uses log helpers (not direct logger calls)

## 5. BullMQ & ESDB Integration

- [x] BullMQ jobs propagate `traceId`/`correlationId` in metadata
- [x] BullMQ workers set CLS context from job metadata
- [x] ESDB events include full metadata; consumers set CLS context

## 6. Security & Redaction

- [x] Sensitive headers and payloads redacted
- [x] No secrets or PII in logs

## 7. Observability & Performance

- [x] Log sinks configured per environment
- [x] Batching enabled for network sinks
- [x] Large objects avoided in logs

## 8. Testing

- [x] Unit tests for logger wrappers (required fields)
- [x] E2E tests for trace propagation and log content
- [x] Smoke tests for BullMQ trace propagation

## 9. Migration & Enforcement

- [ ] All direct logger calls replaced with log helpers
- [ ] Dashboards/alerts updated to new log fields
- [ ] CI checks for log shape and required fields

## 10. Documentation & PR Checklist

- [ ] Logging conventions documented for contributors
- [ ] PR checklist items ensure logging standards

---

**Use this checklist for every new feature, refactor, or review involving logging.**
