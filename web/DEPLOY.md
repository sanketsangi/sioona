# Deploying Sioona (`web/`) to Vercel

The Sioona app is a **Next.js 15 App Router** project that lives in the `web/`
subdirectory of the repo. Deploy with the Vercel **Root Directory** set to `web`.

Production alias: [https://sioona-demo.vercel.app](https://sioona-demo.vercel.app)
(Vercel project name: `web`).

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

1. Host FastAPI + Neon per [`backend/README.md`](../backend/README.md#hosted-deploy-demo).
2. In the Vercel project **Settings → Environment Variables**, set `BACKEND_URL` for **Production**.
3. Redeploy so serverless functions pick up the env var.

Unset or `localhost` `BACKEND_URL` on Vercel makes dual-write fail (`syncFailed`) and the Insights pending queue unavailable.

### Verify (Shadow Mode demo)

1. `curl -sS "$BACKEND_URL/health"` → `{"status":"ok"}`
2. Confirm Vercel Production has `BACKEND_URL` set; redeploy if you just added it.
3. Open https://sioona-demo.vercel.app → **Start Partner Demo**
4. **Insights:** no `syncFailed` banner; Neon pending queue loads; Signal Score panel works.
5. If sync still fails after the backend is healthy: **Re-run Detection**.

## Notes

- `web/data/store.json` is **runtime data** and must not be committed or shipped
  as source; on Vercel the store re-seeds from `testing.json`
  (`web/data/samples/testing.json` → `loadTestingJsonIntoStore`).
- Use **Start Partner Demo** in the UI to reset + reload `testing.json` for a
  cold demo (requires reachable FastAPI for Neon dual-write).

## CI / token-based deploy (optional)

If you prefer non-interactive deploys, create a token at
`https://vercel.com/account/tokens` and run:

```bash
cd web
npx vercel --prod --yes --token "$VERCEL_TOKEN"
```
