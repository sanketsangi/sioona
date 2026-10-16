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

Status: **prepared, not provisioned; operational acceptance blocked**. 12 October 2026.
No production mode, deployment, database, or account has changed. Render workspace listing was unauthorized in the 12 October session, so nothing was created. The historical USD 13 reference is still not an approved exact quote.

## Concrete target proposal

- Render workspace: Sioona (`tea-d9t31uugekts73clssa0`), pending human target confirmation. Blueprint: `infra/staging/render.yaml`.
- New API: `sioona-api-staging`, Virginia, 0.5c-512mb (legacy Starter), Python 3.12.8, manual deployments only.
- New empty Postgres: `sioona-staging-db` / `sioona_staging`, Virginia, 0.1c-256mb (legacy Basic-256mb), 1 GB storage with autoscaling disabled, internal-only connections, Postgres 17. No production clone, branch, or imported data. Runtime database credentials are new.
- New Vercel project: `sioona-web-staging`, root `web`, team `team_XCZvynLrpLlsR6dCGAvXBwdC` (`sanketsangi-7195s-projects`), Node 22. No new seats, custom domain, cron, or production environment groups. Project id/URL do not exist yet.
- Synthetic users only; admin, reviewer, demo membership seeded by the operator. Reset Demo is enabled only on disposable `tenant_demo` in this new stack. Never use a production tenant or production users.

Existing Vercel inventory contains `web`, `sioona-site`, and `pepernet-media`; none is designated staging. Existing Neon inventory contains production project `sioona`; it is not a staging target. Render workspace inventory was read, but service inventory requires workspace confirmation.

## Cost approval gate

Proposal: Render 0.5c-512mb API plus 0.1c-256mb database with explicit 1 GB storage. Historical published reference is approximately **USD 13/month compute**, excluding storage, metered bandwidth and tax; Vercel adds no proposed seats but account-specific usage/plan eligibility remains unverified. This is **not an approved exact quote**. Sources: [Render pricing](https://render.com/pricing), [Render hosting cost reference](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses), [Vercel pricing](https://vercel.com/pricing).

Current plan IDs and explicit storage are verified against [Render compute plans](https://render.com/docs/compute-plans) and [Blueprint reference](https://render.com/docs/blueprint-spec). No implicit 15 GB disk or storage autoscaling is proposed. Account-specific storage/bandwidth/build usage and Vercel billing remain unverified.

Before creating anything, confirm the Render workspace and Vercel team, retrieve the current account-specific SKU quote and usage limits, present exact recurring charges and overage policy, and obtain Sanket's explicit approval. If a SKU or account requirement changes the quote, stop before creation. No account upgrade is authorized.

## Configuration and safety preflight

1. Require green CI and independent review for the exact implementation revision before deployment. Current work is uncommitted; it has no hosted CI result.
2. Provision only approved new resource ids. Record ids, URLs, deployment revision, and pre-window rollback revision in a counts-only acceptance record.
3. Backend `SIOONA_ENV=production` keeps the shared-token gate and hides public API documentation. Set actor mode `shadow` on both services. Use new matching actor/service keys, supplied securely; record only match/presence, never values.
4. Vercel: set `BACKEND_URL` to the new staging API, `DETECT_LLM=0`, `LIVE_INGEST=0`, `SIOONA_PUBLIC_DEMO=0`, `SIOONA_ALLOW_DEMO_ACTIONS=1`, a new session secret and synthetic `SIOONA_PILOT_USERS`. Do not configure a provider key or outbound credentials. Do not reuse existing production env vars.
5. Independently verify API database resource id and web backend URL against the new ids; reject any existing production project/service/DB. Verify no worker/cron/integration is connected. Keep CB-07 tenant controls disabled.
6. Human operator: apply Alembic through head `024_tenant_rls` (this includes `023_inference_budgets`) and seed synthetic memberships using internal service access or a separately authorized temporary operator IP allowlist (restore internal-only access afterward). Leave `sioona_runtime` `NOLOGIN` for the shadow window and keep `DATABASE_URL` on the owner connection. Backend AGENTS.md prohibits agent Alembic/SQL against non-test databases. Record head and role counts without identities or transcripts.

## Observed acceptance window

Use the existing CB-03 task-record procedure: at least 30 minutes, three full synthetic upload → review → reload → approve → reload journeys, a fresh session after assertion expiry, demo reads, and an authorized reset of staging-only `tenant_demo`.

Before and after normal traffic, issue a deliberately missing-actor read and confirm the expected `reason=missing_actor` log. Keep intentional controls separate from normal traffic. Retain time bounds, completed journey/request counts, failures, normal mismatch counts by reason/route, and persisted decision/no-send outcomes. Zero traffic or missing logs is inconclusive. Enforce-mode denial/revocation and principal permissions are proved in automated tests; shadow itself does not reject invalid assertions.

Pass only with observable start/end controls, all journeys complete, zero unexplained normal mismatches, and no behavior regressions. On failure stop test traffic and restore the recorded prior staging deployment/mode; do not drop or downgrade tables. Production enforce remains unauthorized.

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
