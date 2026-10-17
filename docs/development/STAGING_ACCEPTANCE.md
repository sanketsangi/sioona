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
4. Exactly **6 synthetic memberships** are seeded: admin@staging.test (admin) and reviewer@staging.test (reviewer) on each of `tenant_staging_a` and `tenant_staging_b`; admin@staging.test (admin) and demo@staging.test (demo) on `tenant_demo`. The demo admin membership was added in `eddd0651` and is required for the runner’s demo reset-guard check.
5. Schema startup gate (`scripts.check_schema`) passes.
6. Forced RLS on all tenant tables, missing-tenant-context denial, cross-tenant A/B isolation, and pooled connection-reuse safety pass.
7. Emits a redacted, counts-only verification receipt at `docs/development/evidence/staging-bootstrap-receipt.json` with zero credentials or URLs.

The retained `evidence/staging-bootstrap-receipt.json` records **5 memberships** from the pre-`eddd0651` seed and predates the role-isolation preflight. It does not identify its execution target. It is historical evidence only; it does not establish hosted acceptance or verify the current script revision. A fresh operator receipt and the observed shadow window are still required.


## Operator Step 3 — staging shadow observation

Run only after Step 2 has succeeded for the approved target, the six active memberships above have been verified, and the matching API revision/configuration has been deployed. Confirm `SIOONA_ACTOR_AUTH=shadow`, `DETECT_LLM=0`, `LIVE_INGEST=0`, and `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`; no provider or outbound credentials should be configured. Verify the runtime database target and matching actor/service keys without recording their values. A five-membership historical receipt does not satisfy this preflight. Do not rerun the empty-database bootstrap against an already populated target; any seed repair requires a separately approved human operator action.

Execute the following in **Bash**, from repository root, using the backend venv. The target below must match the approved API. Enter the deployed staging secrets at the silent prompts; never paste them into command history or acceptance evidence. This command sends synthetic writes and deliberately tests the legacy demo deletion guard.

```bash
set -euo pipefail
set +x
export FASTAPI_BASE_URL="https://sioona-api-staging.onrender.com"
read -r -s -p 'Staging service token: ' SIOONA_SERVICE_TOKEN; printf '\n'
read -r -s -p 'Staging actor key: ' SIOONA_ACTOR_KEY; printf '\n'
export SIOONA_SERVICE_TOKEN SIOONA_ACTOR_KEY
# Prevent an inherited short-run flag from shortening the observation window.
unset DRY_RUN
(
  cd backend
  .venv/bin/python -m scripts.run_shadow_observation \
    --base-url "$FASTAPI_BASE_URL" \
    --duration 30 \
    --receipt ../docs/development/evidence/staging-shadow-observation-receipt.json
)
unset SIOONA_SERVICE_TOKEN SIOONA_ACTOR_KEY
```

Do **not** add `--dry-run` for acceptance: it is a short **LIVE** run, not an offline simulation. The explicit receipt path above is relative to `backend`; the script’s default path is anchored to the repository. Retain prior receipts separately before rerunning, because the selected receipt file is overwritten on successful completion. A failure may leave an earlier receipt in place; verify fresh start/end timestamps and the exact tested revision.

The runner performs a health check, missing-actor start control, two API journeys across staging A/B, a fresh assertion read after 65 seconds, a third journey, demo read and the expected HTTP 409 `use_lifecycle_deletion_confirmation` guard, paced heartbeat reads, and the missing-actor end control. It uploads synthetic conversations/predictions, submits feedback, reloads conversations, and persists approved draft decisions. It does not perform a model inference or an external-send operation.

A successful script exit produces a receipt with `status=pending_operator_verification`; it does not establish hosted acceptance. Require three completed API journeys, both intentional controls, a fresh assertion check, `short_run=false`, and an actual window of at least 1,800 seconds. Then complete and retain separate operator evidence for:

- Start/end `reason=missing_actor` actor logs, with intentional controls separated from normal traffic and zero unexplained normal mismatches by reason/route. Missing logs or zero traffic is inconclusive.
- Three full browser upload → review → reload → approve → reload journeys, including a fresh browser session after assertion expiry. The runner mints API assertions directly and cannot prove browser session refresh.
- An explicitly authorized lifecycle reset of staging-only `tenant_demo`. The legacy HTTP 409 guard proves no completed reset; the receipt correctly leaves `demo_reset_completed=false`.
- Persisted decision reload and no-send verification. Receipt safety counts are runner declarations, not an independent audit of backend/model/provider activity.

Retain counts-only evidence and operator sign-off; never retain tokens, raw response bodies, transcripts, or customer identities. Stop on unexpected statuses or mismatches and use the recorded staging rollback procedure. Hosted acceptance remains open until these checks and the existing approval gates are satisfied.

### Local readiness verification — 2026-10-17

All bootstrap and shadow-observation tests plus the selected fresh/existing-schema, membership-upgrade, actor read/mutate/revoke, and runtime-role RLS tests passed on a newly created disposable loopback PostgreSQL 17 cluster: **61 passed, 63 deselected, zero skips**. The bootstrap test asserts six memberships and restores the cluster-wide runtime role to NOLOGIN afterward so migration tests do not inherit its LOGIN state. Step 3 Bash syntax and `git diff --check` passed. The retained five-membership receipt was left unchanged. This is local scoped verification; it does not establish a hosted observation window or full backend-suite acceptance.

## Operator OP-4 — provider-free admission drill

`backend/scripts/operator_staging_op4_drill.py` supplies the CB-07/CB-19 hosted admission drill. It uses authenticated HTTP control/reservation endpoints only; it never opens a database connection, runs migrations, or invokes provider dispatch. **Creating this tool or passing local tests does not close OP-4.** A human executes it on the isolated staging API and reviews the receipt and operational evidence before sign-off.

Preflight in a dedicated maintenance window:

- Confirm the approved staging API/database IDs, exact deployed revision and restricted runtime role. Configure `SIOONA_GLOBAL_CONTROL_TENANT=tenant_staging_a` and verify active admin@staging.test admin membership there. Global pause affects the entire staging stack; stop all other staging admission traffic for the window.
- Read back deployed `DETECT_LLM=0`, `LIVE_INGEST=0`, `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`, disabled provider dispatch/worker execution and absent provider/outbound credentials. The local environment flag cannot prove remote configuration; retain operator readback evidence separately. Never enable detection to run this drill.
- Require zero prior attempt reservations for tenant_staging_a in the current **Asia/Kolkata** budget day, and allow enough time before midnight. The drill creates fresh run IDs, verifies exactly **500/day** and **120/run**, and refuses admissions across the local IST day boundary. Keep operator/server clocks synchronized. A prior or ambiguous reservation can make the run fail; do not erase counters or refund attempts to obtain a pass. Use a separately approved fresh synthetic tenant/day workflow if the allowance has already been consumed; this version intentionally fixes the tenant to tenant_staging_a.
- Expect 500 synthetic pending/unknown-usage ledger rows, corresponding reservations and audit events. They are admission-only artifacts, not paid inferences or actual zero-token provider responses. Preserve them for reconciliation; the script neither fabricates usage nor rewrites ledger history. Settlement does not refund attempt allowances.

In Bash at repository root, enter the deployed staging secrets via silent prompts (no command history values). Choose a fresh receipt destination if the default already exists; the tool refuses to overwrite evidence.

```bash
set -euo pipefail
set +x
export DETECT_LLM=0
read -r -s -p 'Staging service token: ' SIOONA_SERVICE_TOKEN; printf '\n'
read -r -s -p 'Staging actor key: ' SIOONA_ACTOR_KEY; printf '\n'
export SIOONA_SERVICE_TOKEN SIOONA_ACTOR_KEY
(
  cd backend
  .venv/bin/python -m scripts.operator_staging_op4_drill \
    --base-url https://sioona-api-staging.onrender.com \
    --approved-staging-drill --confirmed-provider-disabled \
    --receipt ../docs/development/evidence/staging-op4-drill-receipt.json
)
unset SIOONA_SERVICE_TOKEN SIOONA_ACTOR_KEY
```

Both flags attest to the preflight and explicit approval of these staging control writes and synthetic admissions. There is no dry-run mode. Origin validation permits only the named staging HTTPS origin or loopback HTTP for local tests; redirects are not followed. No org-admin/provider/owner credentials are accepted.

The drill establishes admission before each pause, commits tenant and global pauses separately, then measures until a fresh reservation is denied with `paused`. Each measurement includes the control request and must be **≤60 seconds**. It resumes inference only within this exclusive drill, races eight independent requests for the final run slot (one authorized, seven `run_limit`), fills the daily allowance, then races eight for the final daily slot (one authorized, seven `daily_limit`). A subsequent request must also be denied. Any unexpected HTTP response, denial reason, timeout, rollover or count fails the drill.

The tool attempts to **leave global and tenant inference paused at 500/day and 120/run**, on success and on handled failure. It does not restore the previous enabled state. Verify `cleanup_paused=true` and read back both controls independently. SIGTERM and ordinary exceptions attempt cleanup; a hard-killed process, network loss or failed cleanup requires immediate manual pause verification; do not infer cleanup from an old receipt. Resume staging only through a separately approved operator action. A run failure retains a failed counts-only receipt where possible and prints no exception or response details.

A successful receipt remains `pending_operator_verification`. Attach exact-revision and target/configuration readbacks separately, reconcile all 500 synthetic pending reservations/ledger entries and no provider activity, confirm both final pauses, and obtain Sanket's sign-off. This measures fresh admission API propagation; separately retain application-cache/worker propagation, outage/recovery/resumption and alert-delivery evidence required by the broader OP-4 operational acceptance. Do not mark that broader gate closed solely from this receipt.


### OP-4 local regression proof — 2026-10-17

New OP-4 unit and disposable PostgreSQL tests, existing inference-budget tests, and bootstrap/shadow tests passed together: **90 passed, zero skips**, in 4.80 seconds on a fresh loopback PostgreSQL 17 cluster. The real API regression used the restricted runtime role and forced RLS, blocked external HTTP, verified 500 reservations and pending/unknown-usage ledger rows, exact daily/run counters, both eight-contender races, audited control writes, and final global/tenant pauses. The cluster was stopped and removed. The admission response now serializes its validated request ID after commit, avoiding an expired-ORM refresh that returned 503 under runtime-role RLS even after a reservation committed.

From `backend`, rerun with `PG_TEST_DATABASE_URL` pointing only to a dedicated disposable loopback `sioona_migration_test` database and an empty `MIGRATION_DATABASE_URL`:

```bash
.venv/bin/python -m pytest tests/test_operator_staging_op4_drill.py tests/test_inference_budget.py tests/test_operator_staging_bootstrap.py tests/test_run_shadow_observation.py -q
```

The PostgreSQL CI step includes the new OP-4 regression; hosted CI has not been run for this uncommitted patch. Operator-command Bash syntax and `git diff --check` passed. No hosted drill receipt was generated, no staging controls were changed, and OP-4 remains pending human execution and sign-off.
