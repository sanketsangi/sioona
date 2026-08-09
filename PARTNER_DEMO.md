# Partner Demo — 5-Minute Call Script

Internal guide for pitching Sioona.ai Shadow Mode. Not customer-facing.

## One-sentence ask

> Send one Intercom or WhatsApp export; we’ll show opportunity lift and review precision before any integration work.

## Cold demo (no partner data)

1. Open http://localhost:3000 → **Start Partner Demo**
2. **Insights** — show the “What You Got” strip (opportunities by type + pending)
3. Open a **retention** or **lead** card: summary, evidence, suggested action (display-only)
4. **SignalScore** — accept / reject 2–3 signals in ~10 seconds
5. **Eval** — labeled P/R + Pilot Metrics (≥80% target, go/no-go) + set partner baseline for lift + Next Step copy
6. Ask for a **2-week Shadow Mode pilot**: weekly export, joint review vs their current process

On hold / below target: use **Adapt From Reviews** on Eval to add phrases or negatives from rejects, then re-detect.

## With a partner file

1. **Upload Partner Export** (or drop CSV / Intercom JSON / WhatsApp `.txt`)
2. Same Insights → SignalScore → Eval path
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
