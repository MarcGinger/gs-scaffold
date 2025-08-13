# Fintech Compliance Gaps Checklist

> Scope: POPIA (ZA), FICA/AML-CFT, PCI DSS (if card data in scope), SARB/PASA payments participation, and baseline ISO 27001/SOC 2 controls. Tailored to your stack: EventStoreDB (ESDB), Redis, BullMQ/Outbox, Keycloak, OPA, Slack notifications, Doppler (secrets), GitHub Actions CI/CD.

**How to use**

- Treat each checkbox as a control you must design, implement, and evidence.
- Add an _Owner_, _Due_, and link _Evidence_ (runbooks, screenshots, configs).
- Prioritise: 🔴 Critical (legal/regulatory), 🟠 High (security), 🟡 Medium (process).

---

## 1) Governance & Registration

- [ ] 🔴 Determine regulatory perimeter & licences required (e.g., accountable institution under FICA; payment-activity authorisations under SARB/PASA).
- [ ] 🔴 Appoint Compliance Officer; define Board/ExCo oversight and reporting cadence.
- [ ] 🟠 Establish a documented Compliance Program Charter (scope, roles, change control).
- [ ] 🟠 Create a Control Register mapping every item below to policy + evidence.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 2) POPIA Privacy Program

- [ ] 🔴 Records of Processing Activities (RoPA) for all services and queues (ESDB, Redis, BullMQ, Slack).
- [ ] 🔴 Lawful-basis mapping for each purpose (contract, legitimate interest, legal obligation, consent where required).
- [ ] 🔴 Data Subject Rights process (access, rectification, deletion/objection) + SLAs; automation hooks into projections and notification logs.
- [ ] 🔴 Breach notification runbook ("as soon as reasonably possible") with contact tree and regulator templates.
- [ ] 🟠 Data minimisation standards for domain events & logs (no PAN/PII; use tokens/IDs).
- [ ] 🟠 Retention & deletion schedule for events, projections, logs, Slack messages; cryptographic deletion patterns for immutable streams (see §7).
- [ ] 🟠 Cross‑border transfer assessment (POPIA s72); vendor DPAs and transfer mechanisms.
- [ ] 🟡 Privacy by Design check in SDLC (DPIA for new features with personal data).

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 3) FICA / AML‑CFT (if in scope)

- [ ] 🔴 Register with FIC as an Accountable Institution (if applicable) and file RMCP.
- [ ] 🔴 Implement KYC onboarding controls; retain KYC + transactional data ≥5 years post-relationship/transaction.
- [ ] 🔴 Sanctions & PEP screening integrated in workflows; keep screening logs.
- [ ] 🔴 Suspicious/Unusual Transaction Reports (STR), Cash Threshold Reports (CTR), Terrorist Property Reports (TPR) processes + tooling.
- [ ] 🟠 Transaction monitoring scenarios & thresholds with tuning governance.
- [ ] 🟠 Staff AML training & annual attestations; keep attendance records.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 4) PCI DSS (only if cardholder data ever touches your systems)

- [ ] 🔴 Scope decision: **Avoid** storing/processing/transmitting PAN—use PSP tokenisation; else define network segmentation and SAQ/ROC path.
- [ ] 🔴 MFA everywhere in-scope; strong auth for admins and service accounts.
- [ ] 🔴 Prohibit PAN/track/CVV in events, logs, Slack, or debug dumps; add pre‑commit and runtime detectors.
- [ ] 🟠 Quarterly ASV scans + annual penetration tests; remediate findings.
- [ ] 🟠 Key management with HSM/KMS, dual control, rotation, and crypto erasure.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 5) SARB / PASA Payments Participation (if performing payment activities)

- [ ] 🔴 Identify relevant payment activities (acquiring, issuing, EFT debits/credits, remittance, e‑money, etc.) and required authorisations.
- [ ] 🔴 Scheme/rulebook compliance (applicable EFT/debit order rules, dispute/chargeback handling, reversals, settlement timelines).
- [ ] 🟠 Settlement & reconciliation controls with daily variance reporting.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 6) Security Baseline (ISO 27001 / SOC 2)

- [ ] 🔴 Access control: least privilege, JIT/JEA for admin; break‑glass; SoD for prod changes.
- [ ] 🔴 Vulnerability management: SCA, SAST, DAST, container & IaC scanning; patch SLAs.
- [ ] 🔴 Incident response: playbooks, table‑top exercises, post‑mortem policy.
- [ ] 🔴 Vendor risk: DPAs, security reviews, data location, uptime SLAs, right to audit.
- [ ] 🟠 Change management: approvals, CAB (lightweight), documented rollbacks.
- [ ] 🟠 Asset inventory for services, keys, secrets, data stores, queues.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 7) Data Architecture & Event‑Sourcing Controls

- [ ] 🔴 **PII strategy for events**: store stable identifiers; keep mutable PII in projections; reference via IDs; never emit raw PII to Slack or logs.
- [ ] 🔴 **Right‑to‑erasure** pattern for immutable streams: encryption envelope per subject + key revocation (crypto‑delete) OR redaction overlays excluded from projections.
- [ ] 🟠 Event versioning policy (semantic, with up‑casters/down‑casters); non‑breaking changes documented.
- [ ] 🟠 Multi‑tenant isolation tests: prove a tenant cannot read another’s projections or streams; include fuzz tests.
- [ ] 🟠 Idempotency keys & dedup across Outbox/BullMQ/consumers.
- [ ] 🟡 Data classification labels on events, snapshots, projections.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 8) Access & Authorization

- [ ] 🔴 Centralised AuthN via Keycloak; MFA enforced for admins; service accounts scoped and rotated.
- [ ] 🔴 AuthZ via OPA: separate **policy‑as‑guard** (access control) from **policy‑as‑business‑rule**; policy review/approval workflow and version pinning.
- [ ] 🟠 Admin surfaces (config UIs, feature flags) require SoD + approvals.
- [ ] 🟠 Secrets management via Doppler (or equivalent) with least privilege and audit.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 9) Logging, Monitoring & Audit

- [ ] 🔴 **No PII/PAN** in logs, metrics, traces, or Slack alerts; add structured redaction.
- [ ] 🔴 Tamper‑evident audit logs (hash chain or WORM storage) with retention per POPIA/FICA.
- [ ] 🟠 End‑to‑end correlation: `traceId` + `correlationId` across ESDB events, BullMQ jobs, HTTP/gRPC, and Slack notifications.
- [ ] 🟠 Centralised log pipeline (e.g., Loki/ELK) with retention tiers and access control.
- [ ] 🟠 Alerting for auth failures, policy denies, queue backlogs, projection lag, unusual admin actions.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 10) SDLC & CI/CD

- [ ] 🔴 GitHub Actions hardened: OIDC to cloud, no long‑lived deploy keys; branch protection; required reviews; signed commits/tags.
- [ ] 🔴 Secrets never in repo; Doppler/Key Vault integration; secret scanning enforced.
- [ ] 🟠 Build provenance/SBOM; dependency‑pinning and automated updates with review.
- [ ] 🟠 Pre‑prod security gates (lint, tests, SAST, SCA) and policy checks.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 11) Incident & Breach Response

- [ ] 🔴 24×7 on‑call rota & escalation paths; regulator/customer comms templates (POPIA, FIC, partners).
- [ ] 🟠 Forensic‑ready logging/time sync; snapshot/backup preservation steps.
- [ ] 🟠 Lessons‑learned with control updates and evidence capture.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 12) Vendor & Third‑Party Risk

- [ ] 🔴 DPAs & security addenda with Slack, PSPs, cloud, Doppler, observability, etc.
- [ ] 🔴 Data residency & cross‑border clauses validated against POPIA.
- [ ] 🟠 Annual reassessments; monitor breach disclosures and SOC/ISO reports.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 13) Business Continuity & Disaster Recovery

- [ ] 🔴 Defined RTO/RPO per domain; approved by business owners.
- [ ] 🔴 Backups for ESDB, Redis, databases encrypted with KMS; quarterly restore tests.
- [ ] 🟠 Regional failover plan and runbooks; queue replay & projection rebuild tested.

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 14) Documentation & Training

- [ ] 🔴 Mandatory annual training: POPIA, AML (if applicable), secure coding, incident response.
- [ ] 🟠 Up‑to‑date runbooks: onboarding/offboarding, key rotation, OPA policy changes, Slack app lifecycle.
- [ ] 🟡 Control evidence index (where to find configs, screenshots, logs).

**Owner:** \_\_\_\_ **Due:** \_\_\_\_ **Evidence:** \_\_\_\_

---

## 15) Technology‑Specific Hardening

### EventStoreDB

- [ ] 🔴 TLS required; mutual auth between services and ESDB.
- [ ] 🔴 Authentication & RBAC per service; no shared admin creds.
- [ ] 🟠 Stream naming + ACL conventions; secure `$all` access; persistent checkpoints.
- [ ] 🟠 Snapshot encryption at rest; backup/restore rehearsals; compaction strategy.

### Redis / BullMQ / Outbox

- [ ] 🔴 Redis TLS + ACLs; disable `FLUSH*` in prod; key‑rotation for passwords/certs.
- [ ] 🔴 Job idempotency keys; poison‑pill handling; dead‑letter queues and retries with backoff.
- [ ] 🟠 Memory/persistence settings (RDB/AOF) with encrypted backups; eviction policy defined.
- [ ] 🟠 Observability: queue depth, processing time, failure rate SLOs.

### Keycloak / OPA

- [ ] 🔴 Enforce MFA, conditional access for privileged roles; rotate admin secrets.
- [ ] 🔴 Versioned OPA policies; CI checks; policy decision logs retained.
- [ ] 🟠 Separate policy bundles for **AuthZ** vs **Business Rules**; rollout strategy with canary tests.

### Slack Notifications

- [ ] 🔴 Limit payloads to non‑sensitive summaries; never include PII/PAN.
- [ ] 🟠 Workspace/app hardening (tokens, scopes, rotation, audit logs); retention aligned to policy.

### Secrets & Config (Doppler / Cloud KMS)

- [ ] 🔴 Centralised secrets with access logs; per‑env separation; short‑lived tokens where possible.
- [ ] 🟠 Automated rotation for DB/Redis/Slack/API keys; break‑glass process documented.

### CI/CD (GitHub Actions)

- [ ] 🔴 OIDC‑based cloud auth; least‑privilege cloud roles; environment protection rules.
- [ ] 🟠 Required reviewers; mandatory checks before deploy; provenance/SBOM attached to releases.

---

## 16) Evidence Matrix (fill as you implement)

| Control ID | Control Name                     | Owner | Due | Evidence Link |
| ---------- | -------------------------------- | ----- | --- | ------------- |
| DA‑01      | PII strategy for events          |       |     |               |
| AU‑02      | Tamper‑evident audit logs        |       |     |               |
| AM‑03      | RMCP & STR/CTR processes         |       |     |               |
| PC‑04      | PCI scoping/tokenisation         |       |     |               |
| SE‑05      | Redis TLS + ACLs                 |       |     |               |
| SE‑06      | ESDB TLS + RBAC                  |       |     |               |
| IR‑07      | Breach notification runbook      |       |     |               |
| DR‑08      | Backup restore test (quarterly)  |       |     |               |
| VM‑09      | SAST/SCA/DAST pipelines          |       |     |               |
| AU‑10      | Correlation & tracing end‑to‑end |       |     |               |

---

**Notes**

- Keep this checklist in version control; link each item to tickets and merge requests.
- For each control, store evidence (screenshots, configs, policy docs) in a dedicated `compliance-evidence/` location with timestamps.
