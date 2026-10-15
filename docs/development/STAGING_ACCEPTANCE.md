# CB-03 isolated staging proposal and acceptance

## Approved operating and launch decisions — 2026-10-16

Approver: **Sanket**, explicit approval in this session. These choices close decision inputs; they do not assert hosted execution or authorize account upgrades, resource spend, live customer ingestion, or external writes.

- Reject populated Neon `sioona-actor-staging` (`fragrant-voice-56460486`). Preserve it unchanged. Require a **new, empty target with zero application rows**, alongside Render workspace **Sioona** (`tea-d9t31uugekts73clssa0`). Record target IDs and zero-row proof before migrating through `033_supervised_action_executions`, then seed synthetic memberships. A schema-only clone is not an unmigrated empty database; record its exact state. The telemetry closeout additionally requires additive `034_operational_telemetry` **before** deploying these handlers. Exact hosting SKU, recurring cost and actual provisioning remain operator gates; no provider stack is selected implicitly.
- Pilot recovery targets: **RTO 4 hours; RPO 24 hours**. Provider backup retention/expiry remains natural; no immediate backup scrubbing promise. Confirm the selected plan and backup cadence can meet RPO and rehearse restore; targets are not achieved measurements. Require a **direct, session-preserving Postgres connection** for CB-18 session advisory export locks (transaction pooling is insufficient). No customer uptime SLA until **60 days of telemetry**, followed by explicit approval.
- Initial tenant attempt-mode operating policy: **500 attempts/day**, **120 attempts/run**, **Asia/Kolkata** budget day, pause propagation **≤60 seconds**, switch/alert owner **Sanket**. These are approved initial configuration values, not automatic enablement: unconfigured tenants and controls remain fail-closed. Operator configures scoped limits explicitly; USD enforcement remains disabled without an approved evaluated output ceiling.
- Keep baseline `qwen/qwen3.8-27b`; no prompt/model/route change. Candidate promotion **CB-13 / OP-5 is deferred** until an approved external corpus has **n ≥120 and ≥30 per retention/upsell/lead/none**, baseline identity/checksum and bounded evaluation authorization. Existing n=100 is insufficient.
- Accept **chunked standard-call historical worker execution as complete CB-14 scope**. No remote provider Batch API adapter is required. Hosted worker enablement still waits for signed CB-10 acceptance and a separate operator go; retain `SIOONA_DETECTION_EXECUTION=inline`, `SIOONA_WORKER_PAUSE=1` for that rollout policy.
- Keep `LIVE_INGEST=0` and `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`. CB-16 enablement needs customer consent, workspace credentials and hosted acceptance. CB-17 needs approved live sandbox credentials/allowlisted targets and explicit exact-payload approval for each sandbox write. Ordinary Approve Draft sends nothing.
- Official Groq model/pricing and caching documentation was rechecked on **2026-10-16**. The uncommitted draft's four prices/cached discounts were not verified. Publish only Qwen **$0.80 input / $4.00 output per million tokens**, no supported cached discount, and GPT-OSS 20B **$0.075 input / $0.30 output**, with **$0.037 cached input** as published on the model-specific page (the generic caching page describes an approximately 50% discount). Rates begin on the verification date; older/unknown models remain unknown and existing ledger rows are not silently repriced. Sources: [Qwen](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [GPT-OSS 20B](https://console.groq.com/docs/model/openai/gpt-oss-20b), [caching](https://console.groq.com/docs/prompt-caching). The legacy `meta/llama-3.3-70b-versatile` ID and DeepSeek candidate lack verified current prices and remain unknown.

### Hosted acceptance still required

- **OP-1:** current entitlement/protection readback, enforced review/check rules. No GitHub Pro purchase authorized by the attached checklist alone.
- **OP-2:** approved exact empty staging target/cost/backup plan, deployment and synthetic membership seed, observed ≥30-minute actor shadow journey, enforce-mode revocation/permission checks and sign-off.
- **OP-3:** human-run schema/current verification, owner/runtime URL separation, forced-RLS tenant A/B/missing-context/connection-reuse proof; CB-10 entity reconciliation, single writer, restart/outage proof without runtime JSON and Sanket's sign-off.
- **OP-4:** hosted pause propagation/exhaustion/outage/resumption/concurrent admission, provider/ledger reconciliation, worker/drill and alert-delivery acceptance.
- **OP-5:** deliberately deferred external corpus/baseline/candidate comparison and authorized canary; no synthetic substitute.
- **Hosted staging/production sign-off:** lifecycle export/deletion/holds/backup restore, measured recovery against RTO/RPO, source evidence reconstruction, consent/sandbox enablement where applicable, exact-revision CI/review and post-release upload → review smoke. Local tests do not close these gates.

---

Status: **prepared; hosted acceptance remains blocked**. Reconciled 17 October 2026.
The Step 1 approval and Step 2 human operator runbook below supersede earlier target and cost proposals.

## Reconciled staging Blueprint

- Existing approved API: sioona-api-staging (srv-db62psijnfac73c74oj0), Render workspace Sioona, Virginia, plan free ($0/mo), manual deployments only. Startup checks the deployed schema before running Uvicorn; shutdown budget is 120 seconds.
- Approved database target: genuinely empty Neon sioona_staging_clean on a direct session connection. No Render database is defined or provisioned by this Blueprint. Preserve the historical Neon database unchanged.
- Separate Web proposal: sioona-web-staging, Render Node 22, root web, plan 0.5c-512mb, manual deployments only. Exact target and cost approval is still required before creation or Blueprint application; Step 1 approved only the existing API.
- Synthetic users only. No marketing site, worker, cron, provider credentials, or outbound integration is included.

## Cost approval gate

The existing API is approved at zero new charges. The historical USD 13/21 estimates are not current quotes or spend authorization. Obtain separate exact-target and recurring-cost approval for the Web proposal. Do not create a Render database, upgrade the API, or adopt services automatically.

## Configuration and safety preflight

1. Require green CI and independent review for the exact implementation revision before deployment. Local verification does not establish exact-revision hosted CI or acceptance.
2. Confirm the approved existing API id; provision new resources only after their separate approval. Record ids, URLs, deployment revision, and pre-window rollback revision in a counts-only acceptance record.
3. Backend `SIOONA_ENV=production` keeps the shared-token gate and hides public API documentation. Set actor mode `shadow` on both services (`SIOONA_ACTOR_AUTH=shadow`). Use new matching actor/service keys, supplied securely; record only match/presence, never values.
4. Render `sioona-api-staging`: start command runs CB-19 schema check (`python -m scripts.check_schema && exec uvicorn app.main:app --host 0.0.0.0 --port $PORT --timeout-graceful-shutdown 110`). It fails closed if the database schema does not match the deployed code head.
5. Render `sioona-web-staging`: set `BACKEND_URL` to the approved staging API origin (e.g. `https://sioona-api-staging.onrender.com`), `DETECT_LLM=0`, `LIVE_INGEST=0`, `SIOONA_PUBLIC_DEMO=0`, `SIOONA_ALLOW_DEMO_ACTIONS=1`, `SIOONA_ENV=production`, `SIOONA_ACTOR_AUTH=shadow`, a new random session secret (`AUTH_SECRET`), matching `SIOONA_SERVICE_TOKEN`, `SIOONA_ACTOR_KEY`, stable `SIOONA_IDENTITY_KEY`, and synthetic `SIOONA_PILOT_USERS`. Do not configure a provider key or outbound credentials. Do not reuse existing production env vars.
6. Independently verify API database resource id and web backend URL against the approved Step 1 ids and fresh Neon target; reject production resources. Verify no worker/cron/site/integration is connected. Keep CB-07 tenant controls disabled.
7. Human operator: follow Step 2 below for the empty-target check, migrations through 034_operational_telemetry, restricted runtime role, synthetic seed, schema and forced-RLS verification. Keep the direct owner URL in the human terminal as HOSTED_MIGRATION_DATABASE_URL. Service DATABASE_URL uses the separate direct restricted runtime connection to sioona_staging_clean. The optional MIGRATION_DATABASE_URL placeholder is not needed at runtime. Never run migrations from service startup or an agent session. Retain a fresh counts-only receipt before deployment.

## Observed acceptance window

Use the existing CB-03 task-record procedure: at least 30 minutes, three full synthetic upload → review → reload → approve → reload journeys through `sioona-web-staging`, a fresh session after assertion expiry, demo reads, and an authorized reset of staging-only `tenant_demo`.

Before and after normal traffic, issue a deliberately missing-actor read and confirm the expected `reason=missing_actor` log. Keep intentional controls separate from normal traffic. Retain time bounds, completed journey/request counts, failures, normal mismatch counts by reason/route, and persisted decision/no-send outcomes. Zero traffic or missing logs is inconclusive. Enforce-mode denial/revocation and principal permissions are proved in automated tests; shadow itself does not reject invalid assertions.

Pass only with observable start/end controls, all journeys complete, zero unexplained normal mismatches, and no behavior regressions. On failure stop test traffic and restore the recorded prior staging deployment/mode; do not drop or downgrade tables. Production enforce remains unauthorized.

## Unmet acceptance

- Exact recurring quote and target approval for the Render staging stack.
- Reviewed, committed implementation revision and exact-revision CI.
- Approved API adoption, separately approved Web provisioning, operator Neon bootstrap, and matching deployments/configuration.
- Actual observed 30-minute window and retained counts-only evidence.

Do not mark CB-03 or the foundation milestone done until these are satisfied. CB-10 remains blocked by the agreed foundation gate.

## Step 1 approval & human operator execution runbook — 2026-10-16

- Approver: **Sanket** (2026-10-16).
- Approved Staging Target:
  - Render workspace **Sioona** (`tea-d9t31uugekts73clssa0`), web service `sioona-api-staging` (`srv-db62psijnfac73c74oj0`), plan `free` ($0/mo, zero new charges).
  - Genuinely empty, zero-row Neon Postgres database named `sioona_staging_clean` on a direct (non-pooled) session connection.
  - Historical database `sioona_migration_test` in `sioona-actor-staging` (`fragrant-voice-56460486`) is preserved untouched.
  - Recovery targets: **RTO = 4 hours, RPO = 24 hours** (natural provider backup window; session advisory locks require direct session connection).
  - Ingress/Controls: `DETECT_LLM=0`, `LIVE_INGEST=0`, `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`.
- Agent Safety Contract: Per `backend/AGENTS.md` and `docs/DEVELOPMENT_COOKBOOK.md` §5.3/§5.6, agent sessions are strictly prohibited from holding org admin tokens (`NEON_API_KEY`) or executing Alembic/SQL against non-test hosted databases. All hosted DDL, role provisioning, and seed commands are executed exclusively by the human operator.

### Operator Step 2 execution sequence (human terminal)

Execute from repository root (`backend` venv active):

```bash
set -euo pipefail

# 1. Export direct owner URL and desired runtime password
export HOSTED_MIGRATION_DATABASE_URL="postgresql+psycopg://cloud_admin:<PASSWORD>@<HOST>/sioona_staging_clean?sslmode=require"
export SIOONA_RUNTIME_PASSWORD="<GENERATE_SECURE_RANDOM_PASSWORD>"

# 2. Run the secret-free bootstrap script
# Performs preflight 0-table check, Alembic 001->034, sioona_runtime role provisioning,
# synthetic membership seeding, check_schema, forced-RLS verification, and writes redacted receipt.
(cd backend && python -m scripts.operator_staging_bootstrap)
```

The script verifies:
1. Exactly 0 public tables exist before migrating (fails closed otherwise).
2. Alembic head reaches `034_operational_telemetry`.
3. `sioona_runtime` is created with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
4. Synthetic staging memberships are seeded for `tenant_staging_a`, `tenant_staging_b`, and `tenant_demo`.
5. Schema startup gate (`scripts.check_schema`) passes.
6. Forced RLS on all tenant tables, missing-tenant-context denial, cross-tenant A/B isolation, and pooled connection-reuse safety pass.
7. Emits a redacted, counts-only verification receipt at `docs/development/evidence/staging-bootstrap-receipt.json` with zero credentials or URLs.

The retained `evidence/staging-bootstrap-receipt.json` predates the role-isolation preflight and does not identify its execution target. It is historical evidence only; it does not establish hosted acceptance or verify the current script revision. A fresh operator receipt and the observed shadow window are still required.
