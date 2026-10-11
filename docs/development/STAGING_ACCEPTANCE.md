# CB-03 isolated staging proposal and acceptance

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

## Unmet acceptance

- Exact recurring quote and target approval.
- Reviewed, committed implementation revision and exact-revision CI.
- Resource provisioning, operator migration/seed, matching deployments/configuration.
- Actual observed 30-minute window and retained counts-only evidence.

Do not mark CB-03 or the foundation milestone done until these are satisfied. CB-10 remains blocked by the agreed foundation gate.
