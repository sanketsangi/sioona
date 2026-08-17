# Partner Demo — 5-Minute Call Script

Internal guide for pitching Sioona.ai Shadow Mode. Not customer-facing.

## One-sentence ask

> Send one Intercom or WhatsApp export; we’ll show opportunity lift and review precision before any integration work.

## Cold demo (no partner data)

1. Open http://localhost:3000 (or https://sioona-demo.vercel.app) → **Start Partner Demo** (FastAPI must be up so Neon dual-write fills needs-review; if Insights shows a sync warning, check `BACKEND_URL` / hosted FastAPI per `web/DEPLOY.md`, then Re-run Detection)
2. **Insights** — Neon pending queue (not JSON-only pending). Empty pending after go: **Mark Acted** on Correct (advances to the next; does not send), then next week’s export — not a dead heading.
3. Open a **retention** or **lead** card: summary, evidence, suggested action (display-only)
4. **SignalScore** — mark ≥5 reviews (`correct` / `incorrect` / `partially_correct`)
5. **Eval** — labeled P/R + Pilot Metrics (≥80% target, go/no-go) + set partner baseline for lift + Next Step copy
6. Ask for a **2-week Shadow Mode pilot**: weekly export → Neon pending → SignalScore → Eval baseline / go-no-go

On hold / below target: use **Adapt From Reviews** on Eval to add phrases or negatives from rejects, then re-detect.

Cold open and **Reset Demo** also load the same showcase corpus (`testing.json`, ~41 conversations).

## Week-1 pilot rhythm (visible in the strip)

| When | What | Where |
|------|------|--------|
| Day 1 | Upload or Partner Demo | Upload → Insights |
| Mid-week | Re-upload weekly export | Upload → Insights (Neon pending) |
| Ongoing | Mark ≥5 SignalScore reviews | Insights |
| Before share-out | Set baseline + read go/no-go | Eval |

Same strip on Upload, Insights, and Eval. No autonomous actions — suggested next steps stay display-only.

**Hosted week-1 (sioona-demo):** set Eval baseline (dual-writes to Neon `pilot_settings`) + mid-week partner CSV re-upload with `replaced=false` (upsert by `externalId`, no Day-1 prune). Week-1 dry-run logged 2026-08-14: baseline 12, keep-set n=6 / precision 0.83 → go, lift 23. No new Detect engine.

**Week-2 dry-run (2026-08-14):** CLI `--week2` scored held-out `week2.local.csv` (34 labeled; base P 0.75 / R 0.31; adapt P 0.89 / R 0.55 — not week-1 1.00). sioona-demo mid-week upsert `replaced=false` (34 chats / 18 signals / sync failed=0). **Week-window SignalScore logged:** keep-set **n=7 / correct=7 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **6** (18 − 12). Not week-1 n=6 / 0.83. Do not expand `taxonomy.ts`. Never commit `*.local.csv`.

**This week keep-set (2026-08-17):** sioona-demo Day-1 replace of `partner-shaped-labeled.csv` (16 / 10) → mid-week **`replaced=false`** (`weekly_export_count` 2; sync failed=0) → **6** Correct reviews → Eval `?scoreFrom=2026-08-17` keep-set **n=6 / correct=6 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **−2** (10 − 12). Not week-1 0.83 / not week-2 n=7.

**Next-week keep-set (2026-08-18):** sioona-demo Groww Batch-01 JSON upsert **`replaced=false`** (100 chats / 7 signals / sync failed=0; not `*.local.csv`) → `weekly_export_count` **3** → **7** reviews → Eval `?scoreFrom=2026-08-17T19:34:00.000Z` keep-set **n=7 / correct=6 / incorrect=1 / precision 0.86 → go**; baseline **12**; lift **18** (30 − 12). Window Corrects **Acted 6/6**. Not the closed 2026-08-17 n=6 / 1.00.

**Week-2 share-outs:** Eval / Insights SignalScore and go/no-go use the **review window** (`feedback.reviewed_at`, default last 7 days UTC) ∩ conversation keep-set — not the recycled week-1 n=6 alone. Empty window → 0 reviewed / null score / **Insufficient Data** until new reviews land (hosted verified PR #37 on sioona-demo — no labeled-fixture Go shortcut). On Eval Metrics, pick **This Week** or a From date (`?scoreFrom=`); Insights preserves the param; `SIGNAL_SCORE_FROM` remains a server override.

## With a partner file

1. **Upload Partner Export** (or drop CSV / Intercom JSON / WhatsApp `.txt`)
2. Same Insights → SignalScore → Eval path (mid-week step completes on partner file ingest)
3. Set their baseline (“how many opportunities do you find today?”) so lift is credible

## Showcase corpus

| File | Role |
|------|------|
| Repo-root `testing.json` | Canonical labeled corpus (eval measurement) |
| `web/data/samples/testing.json` | Deployable copy for Next/Vercel runtime (keep in sync with root) |

**Run Partner Demo** resets the store and loads only `testing.json`, dual-writes predictions to FastAPI/Neon, and sets the cold-demo baseline.

Partner upload / eval lanes (not the showcase seed):

| File | Format |
|------|--------|
| `web/data/samples/partner-shaped-labeled.csv` | Sioona CSV + `ground_truth` |
| `web/data/samples/real-partner-export.template.csv` | Day-1 pilot template |
| `web/data/samples/real-partner-export.local.csv` | Gitignored real export drop-in (week-1; default `npm run eval:partner-export`) |
| `web/data/samples/real-partner-export.week2.local.csv` | Gitignored week-2 held-out drop-in (`--week2` / `PARTNER_EXPORT=week2`; never scores week-1 as week-2) |

## What not to promise on the call

- Live Intercom/WhatsApp webhooks, Auth0, or autonomous actions
- Outcome-based fees or chatbot replacement

Phase 1 sells: ingest → scored signals → human trust via SignalScore → precision gate.
