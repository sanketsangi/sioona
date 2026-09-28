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
- Demo fixtures: cold open / Reset from Groww `testing.json`; Partner Demo wipes Neon then loads `zerodha_batch_02.json`

## Showcase corpus

- Repo-root `testing.json` — canonical labeled corpus
- `data/samples/testing.json` — Groww Batch 02; cold open + Reset (keep in sync with repo root)
- `data/samples/zerodha_batch_02.json` — Zerodha Batch 02; Run Partner Demo only (wipe then replace)
- Upload still accepts partner CSV / Intercom JSON / WhatsApp `.txt`
- Eval lanes (not Upload pack): `src/data/fixtures/partner-shaped-labeled.csv`, `src/data/fixtures/real-partner-export.template.csv`

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
- `npm test` — Vitest (`detect` / `ingest` / `eval`)
- `npm run eval` — Promptfoo Detect v2 eval (needs `GROQ_API_KEY`; same Qwen JSON classifier as production)
- `npm run eval:mock` — same asserts, no Groq call (harness check)

Product brief: [`../PRODUCT.md`](../PRODUCT.md).
