# Sioona.ai Insights (Phase 0–1)

Shadow Mode conversation intelligence: upload chats, detect revenue signals (lead / retention / upsell), review in a prioritized queue, and track SignalScore feedback.

## Quick start

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → redirects to `/insights`.

## What's included

- **Insights** — Shadow Mode queue (status/type filters, pagination, pending highlight)
- **Upload** — Sioona CSV/JSON, Intercom JSON, WhatsApp `.txt` ingest + auto-detect
- **Eval** — labeled P/R, per-type metrics, SignalScore review precision, pilot go/no-go
- **Taxonomy** — MVP signal definitions
- Demo fixtures: Partner Demo seed from `zerodha_batch_02.json`; cold open / reset from `testing.json`

## Showcase corpus

- Repo-root `testing.json` — canonical Groww labeled corpus (cold open / reset)
- `data/samples/zerodha_batch_02.json` — Partner Demo seed (wipe + dual-write)
- `data/samples/testing.json` — deployable Groww copy used at runtime (Vercel); keep in sync with root
- Upload still accepts partner CSV / Intercom JSON / WhatsApp `.txt`
- Eval lanes: `partner-shaped-labeled.csv`, `real-partner-export.template.csv`

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
- `npm test` — Vitest (`detect` / `ingest` / `eval`)

Product brief: [`../PRODUCT.md`](../PRODUCT.md).
