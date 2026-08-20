# Deploying Sioona (`web/`) to Vercel

The Sioona app is a **Next.js 15 App Router** project that lives in the `web/`
subdirectory of the repo. Deploy with the Vercel **Root Directory** set to `web`.

Production alias: [https://sioona-demo.vercel.app](https://sioona-demo.vercel.app)
(Vercel project name: `web`).

## Deploy gate (every deploy)

Run this **before** pushing/deploying and **after** Vercel/Render settle. Copy-paste as-is. Render free-tier may cold-start (~15m idle); if `/health` fails, retry once after ~30s.

Set env vars first:

```bash
export BACKEND_URL="https://sioona-api.onrender.com"   # Render FastAPI
export VERCEL_URL="https://sioona-demo.vercel.app"     # Vercel web
export TENANT="tenant_demo"
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
  -H "X-Tenant-Id: $TENANT"
# expect: JSON array (may be empty)

# 5. Signal Score API
curl -sS "$BACKEND_URL/v1/tenants/$TENANT/signal-score" \
  -H "X-Tenant-Id: $TENANT"
# expect: reviewed_count, signal_score fields
```

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
  as source; on Vercel the store re-seeds from `testing.json`
  (`web/data/samples/testing.json` → `loadTestingJsonIntoStore`).
- Use **Start Partner Demo** in the UI to wipe Neon and load `zerodha_batch_02.json` for a
  cold demo (requires reachable FastAPI for Neon dual-write). Reset Demo still seeds
  `testing.json`.

## CI / token-based deploy (optional)

If you prefer non-interactive deploys, create a token at
`https://vercel.com/account/tokens` and run:

```bash
cd web
npx vercel --prod --yes --token "$VERCEL_TOKEN"
```
