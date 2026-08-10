# Partner Demo — 5-Minute Call Script

Internal guide for pitching Sioona.ai Shadow Mode. Not customer-facing.

## One-sentence ask

> Send one Intercom or WhatsApp export; we’ll show opportunity lift and review precision before any integration work.

## Cold demo (no partner data)

1. Open http://localhost:3000 (or https://sioona-demo.vercel.app) → **Start Partner Demo** (FastAPI must be up so Neon dual-write fills needs-review; if Insights shows a sync warning, check `BACKEND_URL` / hosted FastAPI per `web/DEPLOY.md`, then Re-run Detection)
2. **Insights** — 7-day pilot checklist strip + Neon pending queue (not JSON-only pending)
3. Open a **retention** or **lead** card: summary, evidence, suggested action (display-only)
4. **SignalScore** — mark ≥5 reviews (`correct` / `incorrect` / `partially_correct`)
5. **Eval** — labeled P/R + Pilot Metrics (≥80% target, go/no-go) + set partner baseline for lift + Next Step copy
6. Ask for a **7-day Shadow Mode pilot**: weekly export → Neon pending → SignalScore → Eval baseline / go-no-go

On hold / below target: use **Adapt From Reviews** on Eval to add phrases or negatives from rejects, then re-detect.

## Week-1 pilot rhythm (visible in the strip)

| When | What | Where |
|------|------|--------|
| Day 1 | Upload or Partner Demo | Upload → Insights |
| Mid-week | Re-upload weekly export | Upload → Insights (Neon pending) |
| Ongoing | Mark ≥5 SignalScore reviews | Insights |
| Before share-out | Set baseline + read go/no-go | Eval |

Same strip on Upload, Insights, and Eval. No autonomous actions — suggested next steps stay display-only.

## With a partner file

1. **Upload Partner Export** (or drop CSV / Intercom JSON / WhatsApp `.txt`)
2. Same Insights → SignalScore → Eval path (mid-week step completes on partner file ingest)
3. Set their baseline (“how many opportunities do you find today?”) so lift is credible

## Sample pack

| File | Format |
|------|--------|
| `web/data/samples/sample-upload.csv` | Sioona CSV |
| `web/data/samples/sample-intercom.json` | Intercom API shape |
| `web/data/samples/sample-whatsapp.txt` | WhatsApp Business export |

**Run Partner Demo** resets fixtures and loads Intercom + WhatsApp samples automatically.

## What not to promise on the call

- Live Intercom/WhatsApp webhooks, Auth0, or autonomous actions
- Outcome-based fees or chatbot replacement

Phase 1 sells: ingest → scored signals → human trust via SignalScore → precision gate.
