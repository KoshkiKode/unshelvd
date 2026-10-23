# Unshelv'd canonical delivery backlog

**State:** post-PR #148, on `main` at merge commit `ff584c2` (October 2026)  
**Hosting direction:** GoDaddy owns the domain/DNS; Google Cloud is the only
production-cloud direction. AWS is retired.

This is the canonical actionable backlog. Items are deliberately limited to
work supported by the repository and current planning evidence; deployment,
store publication, and third-party account configuration are not assumed to be
complete unless marked below.

## Completed baseline

- [x] React 19/TypeScript/Vite web client with Express API, PostgreSQL/Drizzle,
      Passport authentication, marketplace listings, requests, offers,
      messaging, moderation/admin surfaces, and work/edition catalog flows.
- [x] Capacitor Android and iOS projects use application ID
      `com.koshkikode.unshelvd`; version synchronization is driven by
      `package.json`.
- [x] Stripe Connect and optional PayPal payment paths exist, including
      webhook routes and transaction/fulfillment flows. Payment production
      enablement is not implied.
- [x] PR #146 migrated profile-image storage from AWS/S3 assumptions to native
      Google Cloud Storage (`GCS_BUCKET_NAME`, optional
      `GCS_PUBLIC_BASE_URL`), with local data-URL fallback.
- [x] PR #147 and PR #148 repaired GitHub Actions pins and merged runtime/cloud
      configuration hardening. CI uses Node 24; the production Dockerfile
      remains a separate Node-version decision.
- [x] GoDaddy/Google Cloud deployment intent is documented for Cloud Run,
      Cloud SQL for PostgreSQL, and Cloud Storage. The self-hosted Docker/Caddy
      path remains a fallback, not the production-cloud status.
- [x] Local validation recorded after the merged hardening work:
      `npm run check`, `npm test` (14 files/732 tests), and `npm run build`
      passed. These results do not prove a live production deployment.
- [x] No open PRs or unmerged branch commits were identified in the prior
      branch-consolidation audit.

## P0 — release and production safety

### P0.1 — Unblock and prove CI

- **Dependencies:** GitHub account owner resolves the account billing lock;
  repository credentials/secrets must be available for release jobs.
- **Tasks:** Resolve the GitHub Actions billing/account lock; rerun CI,
  analysis, CodeQL, dependency review, and relevant mobile workflows; record
  run URLs and outcomes. Do not disable required checks to mask the blocker.
- **Acceptance/verification:** Required workflows start on hosted runners and
  pass (or have documented, actionable failures); release secrets are
  confirmed without exposing values.
- **Status:** Blocked externally. Earlier failures occurred before runner
  allocation with “account is locked due to a billing issue”; no application
  failure was established.

### P0.2 — Establish the real Google Cloud production path

- **Dependencies:** P0.1 for deploy validation; GoDaddy DNS access; Google
  Cloud project, billing, service identity, Cloud SQL instance, GCS bucket,
  Secret Manager (or an explicitly documented equivalent), and Stripe/SMTP
  credentials.
- **Tasks:** Provision Cloud Run, Cloud SQL PostgreSQL, GCS bucket/IAM, secrets,
  domain mapping/DNS records, TLS, migrations, and a non-demo deployment.
  Keep AWS out of runtime and documentation.
- **Acceptance/verification:** `https://unshelvd.koshkikode.com/api/health`
  returns the documented healthy response; a smoke test covers login, browse,
  listing/image upload, checkout sandbox, webhook delivery, email, and
  WebSocket connection; Cloud Run logs and rollback procedure are documented.

### P0.3 — Make startup and shutdown Cloud Run safe

- **Dependencies:** P0.2 environment; existing `server/index.ts`, jobs, pool,
  and WebSocket lifecycle.
- **Tasks:** Separate liveness from database readiness as needed; ensure
  migrations are run by a controlled release step rather than every instance;
  add graceful shutdown for HTTP/WebSocket/database/background jobs; verify
  SIGTERM, startup failure, and instance replacement behavior.
- **Acceptance/verification:** Automated tests cover readiness failure and
  SIGTERM; a deployed revision drains connections without dropped in-flight
  requests and does not run duplicate startup work.

### P0.4 — Protect payment and webhook state transitions

- **Dependencies:** P0.2 test credentials; current payment schema/routes.
- **Tasks:** Audit Stripe and PayPal webhook signature checks, idempotency,
  replay handling, transaction boundaries, duplicate delivery, refund/dispute,
  transfer failure, and fulfillment transitions. Add regression tests before
  changing behavior.
- **Acceptance/verification:** Replayed and out-of-order events are safe and
  observable; each money-moving transition is atomic and has an audit trail;
  sandbox purchase/refund/dispute scenarios reconcile with provider state.

## P1 — reliability, security, and operability

### P1.1 — Remove sensitive request-body logging

- **Dependencies:** None; inspect current `server/index.ts` middleware.
- **Tasks:** Replace API response/request-body logging with structured,
  redacted metadata; define retention and correlation IDs; ensure passwords,
  tokens, payment data, messages, and profile data never enter logs.
- **Acceptance/verification:** Tests or a local request capture prove sensitive
  fields are redacted; production logs contain request ID, route, status, and
  duration without bodies or secrets.

### P1.2 — Harden browser and native transport

- **Dependencies:** P0.2 production HTTPS/WSS endpoint.
- **Tasks:** Restrict Android cleartext traffic to debug/local builds; verify
  Capacitor production builds use HTTPS/WSS; review CORS, CSRF, cookies,
  origin allowlists, CSP, and upload limits for web and native clients.
- **Acceptance/verification:** Release manifest/config has no global cleartext
  allowance; negative tests reject disallowed origins and invalid CSRF/session
  requests; native smoke tests authenticate and use WebSockets over TLS.

### P1.3 — Make abuse controls fail safely

- **Dependencies:** P0.2 managed PostgreSQL availability and observability.
- **Tasks:** Decide and document the availability/security tradeoff of the
  PostgreSQL-backed rate limiter’s fail-open behavior; add bounded fallback or
  fail-closed protection for authentication, password reset, uploads,
  messaging, and payment endpoints.
- **Acceptance/verification:** Tests cover store outage and recovery; abuse
  limits remain effective during a database or cache failure without locking
  out normal traffic.

### P1.4 — Backups, recovery, and observability

- **Dependencies:** P0.2 provisioned Cloud SQL/GCS.
- **Tasks:** Configure encrypted, tested Cloud SQL backups/PITR and GCS
  lifecycle/versioning; define RPO/RTO; add uptime, error-rate, database,
  storage, webhook, and job metrics/alerts; rehearse restore.
- **Acceptance/verification:** A documented restore rehearsal succeeds in a
  non-production target and records measured RPO/RTO; alerts have owners and
  links to runbooks.

### P1.5 — Align build/runtime and release reproducibility

- **Dependencies:** P0.1 workflow access.
- **Tasks:** Decide one supported Node major (or document the intentional
  split), align Docker/CI/local docs, pin mobile build inputs where practical,
  and verify Android/iOS signing/version automation without committing keys.
- **Acceptance/verification:** Clean checkout reproduces `npm ci`, check, test,
  build, and documented mobile debug builds; release jobs fail clearly when
  required signing secrets are absent.

## P2 — product completeness and scale

### P2.1 — Catalog identity and discovery quality

- **Dependencies:** P0.2 stable database; catalog import budget and provider
  limits.
- **Tasks:** Measure and improve ISBN/edition/work deduplication, metadata
  provenance, search ranking, pagination, indexing, import retries, and
  Open Library throttling. Preserve historical nations, languages, scripts,
  and condition metadata.
- **Acceptance/verification:** Fixture-based identity tests cover translations,
  printings, missing ISBNs, and duplicates; representative searches meet a
  documented latency target with explainable ranking.

### **P2.2 — Marketplace trust and lifecycle

- **Dependencies:** P0.4 payment invariants; P1.4 audit/alerts.
- **Tasks:** Define and implement seller verification/trust signals, shipping
  and returns policy surfaces, delivery evidence, dispute workflows, listing
  moderation, and buyer/seller notifications.
- **Acceptance/verification:** End-to-end state diagrams and tests cover
  listing → purchase → shipment → delivery/auto-complete → refund/dispute,
  including cancellation and moderator intervention.

### **P2.3 — Messaging and mobile resilience

- **Dependencies:** P0.2 TLS endpoint; P1.2 transport hardening.
- **Tasks:** Add reconnect/backoff, offline queue/read state, duplicate
  suppression, message pagination, push-notification decision, and WebSocket
  health instrumentation.
- **Acceptance/verification:** Browser, Android, and iOS tests demonstrate
  reconnect after network loss without duplicate/lost messages and preserve
  unread state across restart.

### **P2.4 — Product growth surfaces

- **Dependencies:** P2.1 search quality and P2.2 trust foundations.
- **Tasks:** Prioritize saved searches/alerts, recommendations, SEO/shareable
  catalog pages, analytics with privacy boundaries, and seller tooling based
  on observed user demand. Do not begin all features concurrently.
- **Acceptance/verification:** Each selected feature has an owner, metric,
  privacy review, rollout plan, and tests before implementation.

### P2.5 — Desktop scope decision

- **Dependencies:** Product priority and maintainer capacity.
- **Tasks:** Either create and validate the documented Tauri v2 `src-tauri`
  implementation, or explicitly mark desktop as deferred and keep
  `DESKTOP.md` from implying an integrated build.
- **Acceptance/verification:** The chosen outcome is represented by committed
  sources plus a working build command, or by corrected documentation and a
  recorded deferral decision.

## Operating rules

- Google Cloud + GoDaddy is the production direction; do not add AWS services
  or restore AWS terminology.
- Keep changes narrowly scoped to one backlog item and update this document
  when status or evidence changes.
- Before merging code changes, run the smallest relevant tests plus
  `npm run check`, `npm test`, `npm run build` when the shared runtime is
  affected, and `git diff --check`.
- Treat account, DNS, cloud billing, payment, SMTP, signing, and app-store
  access as external prerequisites; record them as blockers rather than
  claiming implementation completion.
