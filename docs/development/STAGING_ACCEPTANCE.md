# CB-03 isolated staging proposal and acceptance

**2026-10-16 custom-domain verification: BLOCKED.** Marketing TLS/redirects/metadata and synthetic intake receipts passed using published-address resolution; app/API custom domains and authenticated tenant smoke remain incomplete. See the dated post-deployment audit below.

Status: **prepared, not provisioned; operational acceptance blocked**. 12 October 2026.
No production mode, deployment, database, or account has changed. Render workspace listing was unauthorized in the 12 October session, so nothing was created. The historical USD 13 reference is still not an approved exact quote.

## Provider inventory recheck — 2026-10-16

The paragraph above and the original Vercel target below are historical. Read-only inventory now confirms a Neon project named `sioona-actor-staging` (`fragrant-voice-56460486`) with one ready branch `staging` (`br-patient-unit-b89us6oo`) and database `sioona_migration_test`. This database is **not empty and is not an accepted staging target**. Aggregate row counts: 1,500 messages, 500 conversations, 500 detection runs, 1,000 upload-conversation rows, 10 uploads, 155 predictions, 155 evidence rows, 2 feedback rows, 2 supervised decisions, 5 memberships, 4 users, 3 workspaces, 1 pilot setting and 1 inference-control row. No row contents were read or recorded. The branch reports `init_source=parent-data`; whether these are fixtures or otherwise, it fails the empty-database requirement. Do not seed it, clear it or point staging services at it.

This Neon project is on `free_v3`, with 0.25 CU min/max, 21,600 seconds (six hours) history retention, no snapshot schedule and no listed snapshots. That does not establish an adequate backup/restore plan. Keep this project unchanged. Use a genuinely new empty project/target, verify zero application rows before migrations, document the recovery window and backup mechanism, and rehearse restore before acceptance.

Render workspace `Sioona` is confirmed (`tea-d9t31uugekts73clssa0`). Inventory shows a free `sioona-api-staging` web service on `main` with auto-deploy off, but no `sioona-web-staging` and no Render Postgres database. The existing API start command lacks the CB-19 schema-check preflight and graceful shutdown setting in `infra/staging/render.yaml`; it is not accepted for traffic. Environment values were not copied into the task record.

Published Render pricing and limits checked 2026-10-16: Hobby is $0/month with 5 GB outbound bandwidth and 500 build-pipeline minutes; each workspace gets 750 free instance-hours/month shared across free services. The Billing page is needed for actual remaining usage, which the available provider connector does not expose. The current Blueprint's published-rate estimate is two `0.5c-512mb` web services at $7/month each, one `0.1c-256mb` Postgres compute at $6/month, plus 1 GB storage at $0.30/GB/month: about **$20.30/month**, before bandwidth over included amounts, tax or other workspace usage. This is not an account quote or cost approval. Render's pricing comparison lists a three-day Postgres PITR window; confirm backup eligibility on the selected plan and complete a restore rehearsal. Free Render Postgres has no backups and expires after 30 days.

No migration, seed, deployment, environment update or provider mutation was performed during this recheck. CB-03 shadow acceptance and CB-04 runtime-role acceptance remain open. Before proceeding, obtain current Billing usage/remaining quota, approve the exact target and cost, select a backup/restore plan, and provision a genuinely empty isolated database. Then apply migrations and seed synthetic memberships under the documented operator procedure.

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

## Post-deployment custom-domain audit — 2026-10-16

**Result: BLOCKED; partial marketing-domain verification passed.** Verification window: 05:18–05:21 UTC / 10:48–10:51 IST. This is a production custom-domain audit, not the isolated CB-03 staging acceptance window. Earlier dated staging prerequisites remain open. Existing unrelated edits in this file and the working tree were preserved.

**Attested by:** Codex, automated verifier, 2026-10-16. **Human acceptance signature:** pending; no signature is asserted for Sanket. This named attestation is supported by a SHA-256 integrity manifest, not a cryptographic identity signature. Durable receipts: [attestation](evidence/custom-domain-2026-10-16/attestation.json), [DNS](evidence/custom-domain-2026-10-16/dns.json), [HTTP/TLS/configuration](evidence/custom-domain-2026-10-16/http-tls-config.json), [smoke](evidence/custom-domain-2026-10-16/smoke.json), [provider/log metadata](evidence/custom-domain-2026-10-16/provider.json), [exact production-smoke failure](evidence/custom-domain-2026-10-16/production-smoke.log). Attestation file SHA-256: `89e54d5a28ad59825674792f6cb35edc7cf2835107e0ec11f3716722a718b33c`.

### Deployment identity

Render workspace `tea-d9t31uugekts73clssa0`, read-only inventory and latest-deployment reads:

- `sioona-site` / `srv-db7u2jcs728c739m1pug`: live `dep-db8qqg9vik4c73b9p1e0`, commit `78cfe59eea23860e7139cc4608f1053c350e1c0b`, finished 04:53:19 UTC. Apex and www are both verified Render custom domains; www redirects to apex.
- `sioona-web` / `srv-db7u5sks728c739mcof0`: live `dep-db8ag46q1p3s73a6bp6g`, commit `576c4b0fc24112e2410d475ef68ed7c08c3a9a96`, finished October 15 at 10:21:48 UTC. **No custom domains associated.** This older deployment is not the current checkout.
- `sioona-api` / `srv-d9t38fn40ujc73cr7ho0`: live `dep-db8r1duk1f9s73epihig`, commit `79ccd5d6f04017c209809cf9a110577e624cd0d0`, finished 05:07:13 UTC. **No custom domains associated.**

### DNS, TLS, redirects and marketing output

- **Public DNS PASS for marketing:** Cloudflare `1.1.1.1`, Google `8.8.8.8` and Quad9 `9.9.9.9` all return apex A `216.24.57.1`; www CNAME `sioona-site.onrender.com`, resolving to `216.24.57.16` / `216.24.57.18`. No AAAA address returned. All three return **NXDOMAIN** for `app.sioona.si` and candidate API hostname `api.sioona.si`. The latter is a tested candidate, not an approved/configured API origin.
- **Local resolver BLOCKED:** ordinary curl and the exact `node site/scripts/verify-production.mjs https://sioona.si --production` still fail name resolution (`ENOTFOUND`); the script exits 1. Marketing HTTP receipts below use `curl --resolve sioona.si:443:216.24.57.1` (and corresponding port 80/www entries), preserving the actual custom hostname, SNI and certificate verification. No `-k`, Host-only impersonation or hosts-file change was used. These establish custom-domain edge behavior but do not establish normal DNS access on this machine.
- **TLS PASS via published apex address:** verified trust chain, hostname and validity for both marketing names, TLS 1.3, Google Trust Services WE1. Apex certificate valid October 16, 2026 04:09:08 UTC through January 14, 2027 05:09:04 UTC; www valid October 16 04:08:15 UTC through January 14 05:08:12 UTC. App/API certificates could not be tested without configured domains.
- **Redirect PASS at root:** HTTP apex → HTTPS apex 301 → 200; HTTP www → HTTPS www 301 → HTTPS apex 301 → 200. No root redirect loop. Path/query preservation was not tested.
- **Marketing output PASS via published address:** `/robots.txt` and `/sitemap.xml` return 200. Robots advertises `https://sioona.si/sitemap.xml`; all ten sitemap locations use `https://sioona.si`. All nine HTML routes (`/`, `/about`, `/how-it-works`, `/pricing`, `/contact`, `/security`, `/developers`, `/privacy`, `/terms`) return 200 with route-specific canonical and `og:url`, and `og:image` on `https://sioona.si/opengraph-image`; none of these emitted URLs uses an onrender.com origin.
- **Headers partially PASS:** all nine HTML pages, robots, sitemap and tested contact POST responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Vary includes Accept and Origin on these marketing responses. **CSP and HSTS are absent.** The root edge redirects do not include those four application security headers. No blanket security-header acceptance is asserted for web/API; API health lacks them and web did not respond.

### API, schema and runtime identity

- **Hosting-host liveness PASS only:** `https://sioona-api.onrender.com/health` returned 200 `{"status":"ok"}` twice. This endpoint does not report database readiness, schema or role attributes. Custom-domain API liveness remains blocked.
- **CORS requested allowlist NOT PROVED:** OPTIONS `/v1/predictions` on the API hosting hostname, with `Access-Control-Request-Method: GET`, requested authorization/content-type headers, and Origins `https://sioona.si`, `https://app.sioona.si`, `https://untrusted.example`, returned 405 without `Access-Control-Allow-Origin` for all three. Untrusted browser access is not allowed, but trusted cross-origin access is also not enabled by this probe. This is not a demonstrated trusted-origin allowlist and does not test credentialed requests. The configured web `BACKEND_URL` uses server-to-server API access, for which browser CORS is not the authentication control.
- **Schema evidence PARTIAL:** provider log `7215fcdb-7b6c-4c5b-8110-97461cf33d5e`, timestamp `2026-10-16T00:47:19.35759493Z`, records upgrade `033_supervised_action_executions → 034_operational_telemetry`. Current API build runs `alembic upgrade head`; current start is plain uvicorn and **does not run `python -m scripts.check_schema`**. A past migration log and a live deploy are not a current runtime schema-alignment check.
- **Runtime identity configured; attributes UNVERIFIED:** Render API `DATABASE_URL` names `sioona_runtime`, using pooled endpoint `ep-rapid-feather-avz8jmy7` / `neondb`; `MIGRATION_DATABASE_URL` names `neondb_owner` on the direct endpoint. Neon metadata maps this to project `summer-haze-99931300`, branch `br-winter-cell-avh5pcw3`, and confirms the runtime role exists with password authentication. Role-list metadata does not expose `rolbypassrls`, `rolsuper`, grants or active connection identity. **NOBYPASSRLS is not signed off.** No agent SQL/Alembic was run against this non-test database, following `backend/AGENTS.md`.

### Synthetic smoke and no-send result

- **Intake HTTP/idempotency PASS:** one authorized synthetic identity, reserved address `domain-smoke@example.invalid`, no customer data. POST `https://sioona.si/api/contact` with untrusted Origin returned 403. Correct Origin `https://sioona.si` returned 200 and receipt `smoke_4a111cb9d28a4f53862157f9bcc33afb`; retry with the same payload/key returned 200 and the same receipt. Both responses were `Cache-Control: no-store`. This reached the custom-domain application through the published-address override. Independent database row readback was not performed; durable persistence/uniqueness beyond the route's receipt contract remains operator verification. No synthetic row was deleted.
- **Login/cookies BLOCKED:** app DNS is absent and Render has no web custom domain. The hosting-host `/login` also timed out twice after 25 seconds with no response bytes. No successful sign-in or observed `Set-Cookie`; Secure/HttpOnly session-cookie acceptance remains open. JSON pilot-user configuration is absent; legacy account configuration was not assessed or used. No account was created and no session was forged.
- **Tenant A/B and full workflow NOT RUN:** zero completed authenticated journeys. Upload → Supporting evidence jump → Correct feedback → Approve draft → Page reload could not start on the custom domain. No cross-tenant read/write isolation, source-span reconstruction, feedback/approval persistence or reload proof is claimed. Render web configuration reads `SIOONA_STATE_MODE=postgres`, `SIOONA_ENV=production`, `LIVE_INGEST=0`; configuration alone does not prove the path.
- **No-send scope:** zero send actions invoked by this audit; only synthetic inbound intake was written. No model call, transcript upload, draft approval, provider configuration, deployment, DNS/domain mutation or migration was performed. **Persisted `sent_external_count = 0` is UNVERIFIED (`null` in the smoke receipt), not a passing assertion.** Missing authenticated before/after counts cannot be replaced by zero traffic.

### Remaining acceptance actions

Configure and verify the approved web/API hostname mappings and DNS/TLS, resolve ordinary resolver access, restore a responsive web login, and provide two synthetic tenant accounts with server-resolved memberships. Obtain operator evidence of actual schema head `034_operational_telemetry`, runtime `current_user=sioona_runtime`, restricted role attributes including `NOBYPASSRLS`, and tenant-scoped no-send counters; reconcile the deployed startup command with the reviewed schema gate. Decide the intended browser CORS contract and address or explicitly accept the observed security-header gaps. Then run the requested authenticated journey for tenant A, verify denial from tenant B, reload persisted feedback/approval and compare before/after external-send counts. Human acceptance remains pending until these receipts exist; this audit does not approve configuration changes or waive the isolated staging window.
