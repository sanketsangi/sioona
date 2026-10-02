# Sioona.ai Insights (Phase 0–1)

Shadow Mode conversation intelligence: upload chats, detect revenue signals (lead / retention / upsell), review in a prioritized queue, and track SignalScore feedback.

## Quick start

```bash
cd web
npm install
cp .env.example .env   # BACKEND_URL=http://localhost:8000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → redirects to `/insights`. The Signal Score API in [`../backend`](../backend/README.md) must be running for feedback, the pending queue, and Eval scores.

## What's included

- **Insights** — Shadow Mode queue (status/type filters, pagination, pending highlight)
- **Upload** — Sioona CSV/JSON, Intercom JSON, WhatsApp `.txt` ingest + auto-detect
- **Eval** — labeled P/R, per-type metrics, SignalScore review precision, pilot go/no-go
- **Taxonomy** — MVP signal definitions
- Demo fixtures: cold open / Reset from Groww `testing.json`; Partner Demo wipes Neon then loads `zerodha_batch_02.json`

## Showcase corpus

- `data/samples/testing.json` — Groww Batch 02; canonical labeled corpus, cold open + Reset
- `data/samples/zerodha_batch_02.json` — Zerodha Batch 02; Run Partner Demo only (wipe then replace)
- Upload still accepts partner CSV / Intercom JSON / WhatsApp `.txt`
- Eval lanes (not Upload pack): `src/data/fixtures/partner-shaped-labeled.csv`, `src/data/fixtures/real-partner-export.template.csv`

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
- `npm test` — Vitest (domain logic in `src/lib`, API route handlers, and `eval/` helpers; no network or Neon needed)
- `npm run test:watch` — Vitest in watch mode
- `npm run eval` / `eval:signal` / `eval:signal:injection` / `eval:signal:smoke` — promptfoo signal evals (need `GROQ_API_KEY`)
- `npm run eval:partner-export` — score a partner export against the heuristics
- `npm run ops:week6-keep-set` — keep-set operations script (`scripts/`)
- `npm run clean` — remove `.next` and the TypeScript build cache

## Auth

Pilot sign-in uses a signed `sioona_session` cookie (`AUTH_SECRET`). With `AUTH_SECRET` unset, local `next dev` stays open. Production requires it. See `.env.example` and [`DEPLOY.md`](./DEPLOY.md).

Product brief: [`../PRODUCT.md`](../PRODUCT.md).
