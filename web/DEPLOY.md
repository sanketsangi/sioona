# Deploying Sioona (`web/`) to Vercel

The Sioona app is a **Next.js 16 App Router** project that lives in the `web/`
subdirectory of the repo. Deploy with the Vercel **Root Directory** set to `web`.

Production alias: [https://sioona-demo.vercel.app](https://sioona-demo.vercel.app)
(Vercel project name: `web`).

## Deploy gate (every deploy)

Run this **before** pushing/deploying and **after** Vercel/Render settle. Copy-paste as-is. Render free-tier may cold-start (~15m idle); if `/health` fails, retry once after ~30s.

Set env vars first:

```bash
export BACKEND_URL="https://sioona-api.onrender.com"   # Render FastAPI
export VERCEL_URL="https://sioona-demo.vercel.app"     # Vercel web
export TENANT="tenant_partner"                         # not tenant_demo for a real partner
# Optional. When SIOONA_SERVICE_TOKEN is set on Render, send it on /v1 calls.
# export SIOONA_SERVICE_TOKEN="(same value as Vercel and Render; do not commit)"
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
curl -sS -o /dev/null -w "insights=%{http_code}\n" "$VERCEL_URL/?view=insights"
curl -sS -o /dev/null -w "upload=%{http_code}\n" "$VERCEL_URL/?view=upload"
curl -sS -o /dev/null -w "eval=%{http_code}\n" "$VERCEL_URL/?view=eval"

# 3. Legacy signal deep-link redirect
curl -sS -D- -o /dev/null "$VERCEL_URL/insights/sig_test" | rg -i "^location:"
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

Set these in the Vercel and Render dashboards, then redeploy. This repo does not change production env for you.

Vercel (`web`):

- `AUTH_SECRET` — long random string. Signs the `sioona_session` cookie.
- `SIOONA_SERVICE_TOKEN` — same value as Render. The browser never sees it.
- `SIOONA_TENANT_ID` — partner tenant, for example `tenant_partner`. Must not be `tenant_demo`.
- `SIOONA_ADMIN_EMAIL` and `SIOONA_ADMIN_PASSWORD` — one admin. Or `SIOONA_PILOT_USERS` as a JSON array of `{email, role, tenantId, password}` or `passwordHash` (`scrypt$…` from `node web/scripts/hash-pilot-password.mjs`).
- Optional `SIOONA_REVIEWER_EMAIL` and `SIOONA_REVIEWER_PASSWORD`.
- Optional `SIOONA_PUBLIC_DEMO=1` — anonymous read-only access to `tenant_demo` only. Leave unset in production until that tenant holds no real chats.
- Optional `SIOONA_ALLOW_DEMO_ACTIONS=1` — lets an admin run Reset and Partner Demo in production. Those actions only touch `tenant_demo`.
- Optional `SIOONA_ENV=production`.

Render (`backend`):

- `SIOONA_SERVICE_TOKEN` — same value as Vercel.
- `SIOONA_ENV=production` — disables `/docs`, `/redoc`, and `/openapi.json`. If this is production and the token is empty, `/v1` returns 503.

Neon:

```bash
cd backend && alembic upgrade head
```

That applies revision `010_outcomes_taxonomy_fk` (outcome columns, `taxonomy_overrides`, Postgres foreign key). Run it yourself against the pilot database. Do not point it at a throwaway URL from this repo.

Until `AUTH_SECRET` is set on Vercel production, the app requires sign-in (`VERCEL_ENV=production` turns enforcement on) and the public demo stays closed. Local `next dev` without `AUTH_SECRET` stays open for development.

Real export checklist: [`../docs/REAL_EXPORT.md`](../docs/REAL_EXPORT.md).

## One-time: log in

The automated deploy could not run because the local Vercel CLI has no valid
credentials (`vercel whoami` → "The specified token is not valid"). Run:

```bash
cd web
npx vercel login          # opens browser / email OTP to authenticate
```

## First deploy (creates the project)

```bash
cd web
npx vercel --yes          # preview deploy; links/creates the project
```

When prompted for settings, accept the Next.js defaults:

- Framework Preset: **Next.js**
- Root Directory: **`web`** (if deploying from the repo root instead of `cd web`)
- Build Command: `next build` (default)
- Output Directory: `.next` (default)
- Install Command: `npm install` (default)

## Production deploy

```bash
cd web
npx vercel --prod --yes
```

The command prints the production URL on success (e.g.
`https://<project>.vercel.app`).

## Environment variables (required for Shadow Mode / Signal Score)

Config lives in [`web/vercel.json`](./vercel.json) (framework + build/install
commands).

The JSON file store alone is enough to browse fixtures after reseeding, but
**hosted Shadow Mode demos require a live FastAPI + Neon** dual-write path.

| Variable | Scope | Value |
|----------|--------|--------|
| `BACKEND_URL` | Production (server-only; **not** `NEXT_PUBLIC_`) | Public FastAPI base URL, no trailing slash (e.g. `https://sioona-api.onrender.com`) |
| `DETECT_LLM` | Production (server-only) | `1` to enable Groq pass 2. Omit or `0` = heuristics only ($0). |
| `GROQ_API_KEY` | Production (server-only, Sensitive) | Groq key. Never commit. **Production only.** Cap spend at **$20/mo** in the Groq console. |
| `DETECT_LLM_CONCURRENCY` | Production | Set to **`2`** (also the code default). Do not use `8` — Groq Free returns 429s. No 429 retry (would blow Hobby 10s). |
| `DETECT_LLM_MAX_CALLS` | Production | Set to **`4`**. Local default is `8`; Production `4` so detect + Neon sync fit in Hobby ~10s. |

1. Host FastAPI + Neon per [`backend/README.md`](../backend/README.md#hosted-deploy-demo).
2. In the Vercel project **Settings → Environment Variables**, set `BACKEND_URL` for **Production**.
3. **Detect v2 (when you have a Groq key):** same page, Production only:
   - [Vercel project → Settings → Environment Variables](https://vercel.com/sanketsangi/web/settings/environment-variables)
   - Add `DETECT_LLM` = `1` (Production)
   - Add `GROQ_API_KEY` (Sensitive) = your `gsk_…` key (Production only)
   - Add `DETECT_LLM_CONCURRENCY` = `2` (Production)
   - Add `DETECT_LLM_MAX_CALLS` = `4` (Production) — detect + Neon sync must fit Hobby ~10s
   - Leave `DETECT_LLM_MODEL` unset. The code default is `qwen/qwen3.8-27b`. Groq shut down `qwen/qwen3.6-27b` on 2026-09-14; that id fails every call.
   - Cap Groq spend at **$20/mo** in the Groq console (when Developer billing exists)
   - Leave Preview/Development unset so previews stay $0
   - Redeploy Production so serverless functions pick up the vars
4. Redeploy after any env change.

Without both `DETECT_LLM=1` and `GROQ_API_KEY`, pass 2 never runs (heuristic-only, $0).

Unset or `localhost` `BACKEND_URL` on Vercel makes dual-write fail (`syncFailed`) and the Insights pending queue unavailable.

### Verify (Shadow Mode demo)

After every production deploy, also run the **After each deploy** 7-step curl smoke above.

1. `curl -sS "$BACKEND_URL/health"` → `{"status":"ok"}`
2. Confirm Vercel Production has `BACKEND_URL` set; redeploy if you just added it.
3. Open https://sioona-demo.vercel.app → **Start Partner Demo**
4. **Insights:** no `syncFailed` banner; Neon pending queue loads; Signal Score panel works.
5. If sync still fails after the backend is healthy: **Re-run Detection**.

## Notes

- `web/data/store.json` is **runtime data** and must not be committed or shipped
  as source; on Vercel the store re-seeds from Groww `testing.json`
  (`web/data/samples/testing.json` → `loadTestingJsonIntoStore`).
- **Start Partner Demo** wipes Neon then loads `zerodha_batch_02.json` only
  (requires reachable FastAPI for Neon dual-write). Reset Demo returns Groww.

## CI / token-based deploy (optional)

If you prefer non-interactive deploys, create a token at
`https://vercel.com/account/tokens` and run:

```bash
cd web
npx vercel --prod --yes --token "$VERCEL_TOKEN"
```

## Revenue leak report

No new environment variables. The report is `/?view=report` (anonymised by default). Download PDF is `GET /api/revenue-report/pdf`.

Outcomes use the existing `signal_predictions` columns from Alembic `010_outcomes_taxonomy_fk` (`retained`, `churned`, `converted`, `no_change`, `unknown`). Saved / Lost / Converted on the report write those columns through `POST /api/signals/:id/outcome`. No extra migration. Do not point a laptop `alembic upgrade` at production Neon. Nothing is sent.

## LLM-first detection

When `DETECT_LLM=1`, Groq classifies every chat unless `DETECT_LLM_PRIMARY=0` (that keeps the old miss-only second pass). Heuristics remain the fallback when a call fails, the quote is not in the customer text, or the run hits the cap. Skipped conversation ids resume on the next re-detect.

| Variable | Scope | Value |
|----------|--------|--------|
| `DETECT_LLM_PRIMARY` | Server | Omit or `1` for LLM-first. `0` restores miss-only pass 2. |
| `DETECT_LLM_MAX_CALLS` | Server | Still **`4`** on Vercel Hobby so one request stays under ~10s. Unset locally covers about 120 chats. Re-detect continues the remainder. |
| `DETECT_LLM_MAX_ATTEMPTS` | Server | `3` (default). Retries 429, 5xx, and timeouts only. |
| `DETECT_LLM_MIN_INTERVAL_MS` | Server | `200` (default) between Groq calls. |

Do not raise the Hobby cap in the Vercel dashboard unless the runtime can finish the batch. Nothing is sent to a customer.

## Urgency and value

No new environment variables. Each signal stores `urgency` (`high` / `medium` / `low`), an optional timeframe, and `mentioned_value_inr` when the customer stated an amount. Alembic `011_signal_urgency_value` adds those nullable columns on `signal_predictions`. Render’s deploy migration applies it. Do not run it against production Neon from a laptop. The Insights queue sorts by urgency × value. Older rows without the columns stay in the previous stable order.

## Early-warning signals

No new environment variables and no migration. Insights shows an At risk list for repeated complaints, unresolved issues, failed withdrawals or payouts, slow agent replies, and a negative trend across one customer's chats. Those rows are not `lead` / `retention` / `upsell` predictions, so they do not change SignalScore. Nothing is sent.

## Reviewer workflow

No new environment variables. The Insights review pane records Saved, Lost, or Converted (buttons or `1` / `2` / `3`). `/?view=insights&call=today` is the Top 10, ranked by urgency × value. Reply drafts follow the customer’s language (Hindi, Hinglish, or English) and stay on screen until a person copies them. Sioona does not send them.

## Live read-only ingestion

Off unless `LIVE_INGEST=1`. Leave it unset on Vercel until a pilot asks for it. Secrets stay in the host environment. Do not commit them.

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
