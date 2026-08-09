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
- Demo fixtures seeded on first run (`data/store.json`)

## Sample uploads

- `data/samples/sample-upload.csv` — Sioona CSV
- `data/samples/sample-intercom.json` — Intercom-shaped export
- `data/samples/sample-whatsapp.txt` — WhatsApp Business chat export

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
- `npm test` — Vitest (`detect` / `ingest` / `eval`)

Product brief: [`../PRODUCT.md`](../PRODUCT.md).
