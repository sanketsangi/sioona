# Deploying Sioona (`web/`) to Vercel

The Sioona app is a **Next.js 15 App Router** project that lives in the `web/`
subdirectory of the repo. Deploy with the Vercel **Root Directory** set to `web`.

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

## Notes

- Config lives in [`web/vercel.json`](./vercel.json) (framework + build/install
  commands). No environment variables are required for the demo — the app uses
  the JSON file store.
- `web/data/store.json` is **runtime data** and must not be committed or shipped
  as source; on Vercel the store re-seeds from the fixtures in
  `src/data/fixtures/sample-store.ts`.
- Use **Start Partner Demo** in the UI to reset + load the Intercom/WhatsApp
  samples for a cold demo.

## CI / token-based deploy (optional)

If you prefer non-interactive deploys, create a token at
`https://vercel.com/account/tokens` and run:

```bash
cd web
npx vercel --prod --yes --token "$VERCEL_TOKEN"
```
