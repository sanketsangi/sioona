# Deploying Sioona (`web/`) to Render

The Sioona app is a **Next.js 16 App Router** project that lives in the `web/`
subdirectory of the repo. The product service is `sioona-web` on Render at
[https://sioona-web.onrender.com](https://sioona-web.onrender.com).

## Deploy gate (every deploy)

Run this **before** pushing/deploying and **after** Render settle. Copy-paste as-is. Render free-tier may cold-start (~15m idle); if `/health` fails, retry once after ~30s.

Set env vars first:

```bash
export BACKEND_URL="https://sioona-api.onrender.com"   # Render FastAPI
export WEB_URL="https://sioona-web.onrender.com"     # Render web
export TENANT="tenant_partner"                         # not tenant_demo for a real partner
# Optional. When SIOONA_SERVICE_TOKEN is set on Render, send it on /v1 calls.
# export SIOONA_SERVICE_TOKEN="(same value as web and API; do not commit)"
```

### Before each deploy (local)

```bash
# Unit/integration gates
cd web && npm test
cd backend && .venv/bin/python -m pytest
```

Both must pass. Use `backend/.venv/bin/python -m pytest` — system `python3` may not have pytest.

### After each deploy (hosted)

Seven curls: health, Insights, Upload, Eval, legacy redirect, needs-review, signal-score.

```bash
# 1. Backend boot
curl -sS "$BACKEND_URL/health"
# expect: {"status":"ok"}

# 2. Critical UI routes (SSR must not 500)
curl -sS -o /dev/null -w "insights=%{http_code}\n" "$WEB_URL/?view=insights"
curl -sS -o /dev/null -w "upload=%{http_code}\n" "$WEB_URL/?view=upload"
curl -sS -o /dev/null -w "eval=%{http_code}\n" "$WEB_URL/?view=eval"

# 3. Legacy signal deep-link redirect
curl -sS -D- -o /dev/null "$WEB_URL/insights/sig_test" | rg -i "^location:"
# expect: Location: /?view=insights&preview=sig_test

# 4. Shadow Mode queue API
curl -sS "$BACKEND_URL/v1/tenants/$TENANT/signals/needs-review" \
  -H "X-Tenant-Id: $TENANT" \
  ${SIOONA_SERVICE_TOKEN:+-H "Authorization: Bearer $SIOONA_SERVICE_TOKEN"}
# expect: JSON array (may be empty)

# 5. Signal Score API
curl -sS "$BACKEND_URL/v1/tenants/$TENANT/signal-score" \
  -H "X-Tenant-Id: $TENANT" \
  ${SIOONA_SERVICE_TOKEN:+-H "Authorization: Bearer $SIOONA_SERVICE_TOKEN"}
# expect: reviewed_count, signal_score fields
```

## Pilot auth (manual — do not commit secrets)

Set these in the Render dashboard, then redeploy. This repo does not change production env for you.

Render (`sioona-web`):

- `AUTH_SECRET` — long random string. Signs the `sioona_session` cookie.
- `SIOONA_SERVICE_TOKEN` — same value as Render. The browser never sees it.
- `SIOONA_TENANT_ID` — partner tenant, for example `tenant_partner`. Must not be `tenant_demo`.
- `SIOONA_ADMIN_EMAIL` and `SIOONA_ADMIN_PASSWORD` — one admin. Or `SIOONA_PILOT_USERS` as a JSON array of `{email, role, tenantId, password}` or `passwordHash` (`scrypt$…` from `node web/scripts/hash-pilot-password.mjs`).
- Optional `SIOONA_REVIEWER_EMAIL` and `SIOONA_REVIEWER_PASSWORD`.
- Optional `SIOONA_PUBLIC_DEMO=1` — anonymous read-only access to `tenant_demo` only. Leave unset in production until that tenant holds no real chats.
- Optional `SIOONA_ALLOW_DEMO_ACTIONS=1` — lets an admin run Reset and Partner Demo in production. Those actions only touch `tenant_demo`.
- Optional `SIOONA_ENV=production`.

Render (`backend`):

- `SIOONA_SERVICE_TOKEN` — same value as sioona-web.
- `SIOONA_ENV=production` — disables `/docs`, `/redoc`, and `/openapi.json`. If this is production and the token is empty, `/v1` returns 503.

Neon:

```bash
cd backend && alembic upgrade head
```

That applies revision `010_outcomes_taxonomy_fk` (outcome columns, `taxonomy_overrides`, Postgres foreign key). Run it yourself against the pilot database. Do not point it at a throwaway URL from this repo.

Until `AUTH_SECRET` is set on Render production, the app requires sign-in (`NODE_ENV=production` or `SIOONA_ENV=production` turns enforcement on) and the public demo stays closed. Local `next dev` without `AUTH_SECRET` stays open for development.

Real export checklist: [`../docs/REAL_EXPORT.md`](../docs/REAL_EXPORT.md).

## Deploy and configure Render

Use the existing `sioona-web` service and the Render deployment instructions below.
Deploy the approved commit from the Render dashboard, then require a live deploy
with the matching full Git SHA before running the hosted checks.

Set server-only `BACKEND_URL` to the public FastAPI origin. Optional Groq detection
requires both `DETECT_LLM=1` and `GROQ_API_KEY`; otherwise detection uses heuristics.
Keep the approved model configuration and provider spend limits. Explicit
`DETECT_LLM_MAX_CALLS` still overrides the default; primary detection otherwise
covers up to 120 chats, and miss-only detection defaults to 8. Re-detect resumes
skipped conversations. Retries honor Retry-After up to 20 seconds with shared
pacing; there is no Vercel function-timeout cap.

Never commit or ship `web/data/store*.json`; production operational state belongs
in Postgres. Run Partner Demo only with an approved demo tenant and action.

## Revenue leak report

No new environment variables. The report is `/?view=report` (anonymised by default). Download PDF is `GET /api/revenue-report/pdf`.

Outcomes use the existing `signal_predictions` columns from Alembic `010_outcomes_taxonomy_fk` (`retained`, `churned`, `converted`, `no_change`, `unknown`). Saved / Lost / Converted on the report write those columns through `POST /api/signals/:id/outcome`. No extra migration. Do not point a laptop `alembic upgrade` at production Neon. Nothing is sent.

## LLM-first detection

When `DETECT_LLM=1`, Groq classifies every chat unless `DETECT_LLM_PRIMARY=0` (that keeps the old miss-only second pass). Heuristics remain the fallback when a call fails, the quote is not in the customer text, or the run hits the cap. Skipped conversation ids resume on the next re-detect.

| Variable | Scope | Value |
|----------|--------|--------|
| `DETECT_LLM_PRIMARY` | Server | Omit or `1` for LLM-first. `0` restores miss-only pass 2. |
| `DETECT_LLM_MAX_CALLS` | Server | Explicit override; unset primary detection covers up to 120 chats. Re-detect continues the remainder. |
| `DETECT_LLM_MAX_ATTEMPTS` | Server | `3` (default). Retries 429, 5xx, and timeouts only. |
| `DETECT_LLM_MIN_INTERVAL_MS` | Server | `200` (default) between Groq calls. |

Choose explicit batch limits for the approved workload. Nothing is sent to a customer.

## Urgency and value

No new environment variables. Each signal stores `urgency` (`high` / `medium` / `low`), an optional timeframe, and `mentioned_value_inr` when the customer stated an amount. Alembic `011_signal_urgency_value` adds those nullable columns on `signal_predictions`. Render’s deploy migration applies it. Do not run it against production Neon from a laptop. The Insights queue sorts by urgency × value. Older rows without the columns stay in the previous stable order.

## Early-warning signals

No new environment variables and no migration. Insights shows an At risk list for repeated complaints, unresolved issues, failed withdrawals or payouts, slow agent replies, and a negative trend across one customer's chats. Those rows are not `lead` / `retention` / `upsell` predictions, so they do not change SignalScore. Nothing is sent.

## Reviewer workflow

No new environment variables. The Insights review pane records Saved, Lost, or Converted (buttons or `1` / `2` / `3`). `/?view=insights&call=today` is the Top 10, ranked by urgency × value. Reply drafts follow the customer’s language (Hindi, Hinglish, or English) and stay on screen until a person copies them. Sioona does not send them.

## Live read-only ingestion

Off unless `LIVE_INGEST=1`. Leave it unset on Render until a pilot asks for it. Secrets stay in the host environment. Do not commit them.

| Variable | Scope | Value |
|----------|--------|--------|
| `LIVE_INGEST` | Server | `1` to enable the routes. Anything else returns 404. |
| `INTERCOM_CLIENT_ID` | Server | Intercom OAuth app id. Used only to build the authorize redirect. |
| `INTERCOM_CLIENT_SECRET` | Server | Reserved. The callback does not exchange the code. |
| `INTERCOM_ACCESS_TOKEN` | Server | Read-only token for `POST /api/ingest/live/intercom/poll` (GET against Intercom). |
| `INTERCOM_WEBHOOK_SECRET` | Server | Must match `X-Sioona-Webhook-Secret` on the Intercom webhook and poll. |
| `WHATSAPP_WEBHOOK_SECRET` | Server | Same header for `POST /api/ingest/live/whatsapp`. |
| `SIOONA_TENANT_ID` | Server | Partner tenant the webhook must name. Live ingest rejects `tenant_demo`. |

Intercom, WhatsApp, and the Intercom poll also send `X-Sioona-Tenant-Id` (`tenant_partner`). A missing header, a mismatch with `SIOONA_TENANT_ID`, or a missing secret is 401. Chats land in that tenant’s store.
| `WHATSAPP_PROVIDER` | Server | `gupshup` (default) or `interakt` (`?provider=`). |

When `LIVE_INGEST=1`, the session middleware lets only `POST /api/ingest/live/intercom`, `…/intercom/poll`, and `…/whatsapp` through without a cookie (`src/lib/live-ingest-paths.ts`). Those routes then enforce the secret and tenant header themselves. The Intercom OAuth start and callback still need a signed-in session.

Webhook and poll bodies go through the existing redaction and detection path. The connectors never post a reply. OAuth token exchange is left to the operator: set `INTERCOM_ACCESS_TOKEN` after authorizing, so a token is not written to disk or returned by the callback.

## Alembic `008`–`011` on Neon: check, then dry run

Render runs `alembic upgrade head` on every deploy of `main`, so `010` and `011` may already be applied. Check first. Never point a laptop `alembic upgrade` at production Neon. Every step below is read-only on production or runs on a Neon branch.

**1. Read production state (read-only SQL)**

```sql
SELECT version_num FROM alembic_version;
SELECT count(*) AS predictions FROM signal_predictions;
SELECT count(*) AS orphan_pairs FROM (
  SELECT DISTINCT p.tenant_id, p.conversation_id
  FROM signal_predictions p
  WHERE NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.tenant_id = p.tenant_id AND c.conversation_id = p.conversation_id
  )
) o;
```

- `011_signal_urgency_value`: already applied. Skip to step 4 and verify.
- `007_pilot_upload_name` through `010_outcomes_taxonomy_fk`: continue.

**2. Branch production in Neon.** Create a branch from the production branch. Export the branch connection string as `DATABASE_URL` in your shell only. Do not commit it.

**3. Migrate the branch**

```bash
cd backend
.venv/bin/alembic upgrade head
```

`010` backfills one stub `conversations` row (`channel='unknown'`) for each orphan pair, then adds `ck_signal_predictions_outcome` and `fk_signal_predictions_conversation` (`ON DELETE RESTRICT`, keyed on `uq_conversations_tenant_conversation_id`). `008` and `011` only add an index and nullable columns.

**4. Verify (branch, or production if step 1 showed `011`)**

```sql
SELECT version_num FROM alembic_version;  -- 011_signal_urgency_value
SELECT conname FROM pg_constraint
WHERE conrelid = 'signal_predictions'::regclass
  AND conname IN ('fk_signal_predictions_conversation', 'ck_signal_predictions_outcome');  -- both rows
SELECT to_regclass('taxonomy_overrides'), to_regclass('supervised_action_decisions');  -- both non-null
SELECT column_name FROM information_schema.columns
WHERE table_name = 'signal_predictions'
  AND column_name IN ('outcome','outcome_value_inr','outcome_recorded_at','urgency','urgency_timeframe','mentioned_value_inr');  -- six rows
SELECT count(*) FROM conversations WHERE channel = 'unknown';  -- equals orphan_pairs from step 1
```

**5. Smoke the branch.** Point a local backend at the branch (`DATABASE_URL` as above, `SIOONA_ENV=development`), then:

- `POST /v1/predictions` for a conversation id that does not exist returns 201 (the service creates the stub after the FK violation).
- `GET /v1/tenants/$TENANT/signals/needs-review` returns a JSON array.
- Deleting a conversation through `DELETE /v1/tenants/$TENANT/conversations/{id}` succeeds (children are removed first).

**6. Roll back.** On the branch, delete the branch. If production is ever affected, `alembic downgrade 009_supervised_actions` drops the FK, the check constraint, the outcome and urgency columns, and `taxonomy_overrides`. That discards recorded outcomes and taxonomy overrides, so export them first. The stub `conversations` rows from `010` stay.

**7. Clean up.** Delete the Neon branch. Record the verified head in `.cursor/docs/PROJECT_STATE.md` §5.

## Alembic `022_evidence_anchors`

Render must apply `022` **before** the FastAPI revision that SELECTs `messages.content_sha256` and `signal_predictions.evidence_status`. A database still on `021_inference_attempts` 500s prediction list, review, acted, and snapshot reads. Confirm `alembic current` is `022_evidence_anchors`, then deploy the API. Then run `backend/scripts/backfill_signal_evidence.py --tenant …` (dry-run, then `--apply`). Never point a laptop `alembic upgrade` at production Neon. Existing rows stay `unresolved` until that backfill.

## Render deployment configuration

The repository-root `render.yaml` proposes five services: `sioona-site`,
`sioona-web`, `sioona-api`, `sioona-detection-worker`, and
`sioona-ingestion-recovery`. Review and approve the Blueprint diff before applying
it, especially adoption of the existing dashboard-managed API. This proposal
performs no hosted changes or migrations. Worker provisioning still requires
hosted CB-10 acceptance and D9 approval; keep `SIOONA_WORKER_PAUSE=1` until the
separate worker cutover is approved. Automatic deploys are disabled for web
services and the worker; cron provisioning starts its scheduled runs.

For `sioona-web`, use a Node web service with Root Directory `web`, Node 22,
build command matching `render.yaml` (`npm ci`, install the lockfile-matched
`@rollup/rollup-linux-x64-gnu` and `@next/swc-linux-x64-gnu` optional binaries,
then `npm run build`), and start command `npm start`. This mirrors Linux CI and
avoids npm/cli#4828 when a macOS-generated lockfile omits optional packages.
Next.js listens on Render's supplied `PORT`; do not hardcode a port.
Keep `HOSTNAME=0.0.0.0`; the Blueprint probes `/` and accepts its 2xx/3xx response.
The Blueprint uses `sync: false` inputs: supply real values in Render, never Git.
Set `BACKEND_URL` to the deployed API base URL (normally HTTPS), `AUTH_SECRET`,
`SIOONA_SERVICE_TOKEN` matching the API, `SIOONA_TENANT_ID`, approved
`SIOONA_PILOT_USERS` credentials, and the stable `SIOONA_IDENTITY_KEY`.
`SIOONA_ENV=production` enforces sign-in and defaults operational state to
Postgres. `RENDER=true` (provided by Render) or `SIOONA_ENV=production` requires a configured non-localhost `BACKEND_URL`.
Configure actor-auth keys/mode and optional model or ingestion credentials to
match the approved API configuration before enabling those features.

The API entry uses Root Directory `backend`, Python 3.12.8,
`pip install -r requirements.txt`, and
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, with `/health` as its probe.
Supply the approved runtime-role `DATABASE_URL` and matching service token.
Preserve existing dashboard settings and actor keys when adopting the API.
Apply required database migrations through a separately approved operator action
before deploying dependent routes; do not turn migration execution into an
automatic build step. Worker and recovery database credentials must use their
approved roles and targets.

After an approved deployment, repeat the hosted read-only checks above with
`WEB_URL` set to the new Render web origin. Verify sign-in, tenant isolation,
and API health before changing DNS or retiring the previous host. Render's local
filesystem is ephemeral; production operational state must stay in Postgres.
For each future custom hostname, add and verify it on the matching Render service
before DNS cutover. At providers without ALIAS/ANAME flattening, use
`A @ 216.24.57.1` for an apex and `CNAME app sioona-web.onrender.com` for the
product subdomain; remove conflicting `AAAA` records. Keep the product on a
subdomain so marketing can own the apex/`www`. Configure the non-canonical
hostname as a permanent redirect to the chosen canonical HTTPS hostname (Render
automatically pairs root and `www` and redirects whichever counterpart is not
canonical), wait for Render-managed TLS, then update all origin/cookie/auth
settings and verify redirects, sign-in, tenant isolation, and `/health` before
disabling any old hostname or the Render subdomain.
See [`../site/MARKETING_RELEASE.md`](../site/MARKETING_RELEASE.md) for marketing
configuration and its release gates. Reference: [Render Blueprint specification](https://render.com/docs/blueprint-spec).
