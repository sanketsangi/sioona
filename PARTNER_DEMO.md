# Partner Demo — GTM Pack + 5-Minute Call Script

Internal guide for pitching Sioona.ai Shadow Mode. Not customer-facing. Sell-today summary also lives in [`PRODUCT.md`](./PRODUCT.md).

## One-liner offer

> Send one anonymized Intercom or WhatsApp export; we’ll show keep-set SignalScore (≥80% go) and opportunity lift vs your baseline — before any integration, Auth0, or outbound send.

**Week-4 partner note (paste-ready):** [`.cursor/docs/WEEK4_SHAREOUT.md`](.cursor/docs/WEEK4_SHAREOUT.md) — week-window keep-set SignalScore, not labeled P/R.

---

## Pilot one-pager (2-week Shadow Mode)

| | |
| --- | --- |
| **Who** | India mid-market broking / fintech CS leads on Intercom or WhatsApp |
| **Wedge** | **Retention** signals already in chats (close / switch / pause / churn risk). Lead + upsell stay available; retention is the story |
| **Offer** | Single-tenant Insights + Shadow Mode + human-gated suggestions. No autonomy. No Auth0 sell. |
| **Ask** | One redacted weekly export now; second mid-week upsert; ~30–45 min review across the window |
| **Win** | Eval keep-set SignalScore ≥**80%** on the week window (n ≥ 5 human reviews). Lift vs partner baseline documented on Eval. |
| **Honest approve** | Approve Draft / Correct / Mark Acted never send. Partner executes follow-up outside Sioona. Acted = display-only. |
| **Not in pilot** | Live webhooks, CRM writeback, Action Mode outbound, chatbot replacement, outcome fees |

**Cadence (partner-facing):**

| Day | Ask |
| --- | --- |
| 0 | Redacted export + baseline (“how many opportunities do you find today?”) |
| 1–3 | Upload → Insights → Correct / Incorrect / Partially correct (≥5) → Mark Acted on Corrects |
| ~7 | Mid-week upsert (`replaced=false`) — same external IDs, new messages |
| 10–14 | Eval share-out: keep-set go/hold + lift; decide paid pilot or stop |

Empty Neon window = **Insufficient Data** (never a labeled Go). Hold → more reviews, not Adapt phrase chasing.

---

## Anonymization guide (redaction checklist)

Partners should redact **before** share when possible. Ingest also runs `redactText` (email, phone, PAN, Aadhaar, long account numbers → `[email]` / `[phone]` / `[pan]` / `[aadhaar]` / `[account]`). Masking is defense-in-depth — not a DLP substitute. **Never commit** `*.local.csv`, raw PII, or `store.json`.

**Before sending the file**

- [ ] Strip or mask customer names if policy requires (first name only is often enough)
- [ ] Remove emails, phones, PAN, Aadhaar, account / client codes (or rely on ingest tokens)
- [ ] Drop internal agent notes that contain KYC scans, screenshots, or ticket URLs with tokens
- [ ] Prefer Intercom JSON / WhatsApp `.txt` / Sioona CSV — no CRM dumps, no payment rails
- [ ] Confirm the export is **support / sales chat only** for the pilot week (or a clear sample)
- [ ] Label optional `ground_truth` only on a held-out measurement pack — not required for Eval go
- [ ] Store the file as `*.local.csv` (gitignored) if it lands in-repo; do not push

**What we store:** redacted message text + detected signals + human feedback / Acted. Single demo tenant today — do not promise multi-org isolation or Auth0.

**What we do not need:** live mailbox access, API keys to Intercom/WhatsApp, CRM credentials.

---

## LinkedIn outreach cadence

**7-day ask (connection → export):**

| Day | Touch | Copy spine (edit voice; keep honesty) |
| --- | --- | --- |
| 0 | Connection note | Short: India broking/fintech CS + retention in chats — not a chatbot pitch |
| 1 | Value note | One anonymized export → Shadow Mode → keep-set SignalScore + lift before any integration |
| 3 | Soft bump | Offer cold demo link (`sioona-web.onrender.com`) or 15-min screen share |
| 5 | Objection handle | Nothing sends; Approve / Acted are human-only; no webhooks in the pilot |
| 7 | Clear ask | “Can you send one redacted weekly Intercom/WhatsApp export this week?” |

**2-week pilot cadence (after export lands):**

| Window | Internal + partner |
| --- | --- |
| Week 1 | Day-1 upload → ≥5 reviews + Acted → set baseline on Eval |
| Mid | Upsert `replaced=false` (second dump or same week refresh) |
| Week 2 | Finish reviews → Eval go (≥80%) or Hold → paid/committed ask or clean stop |

**Do not** message Auth0 timelines, live connectors, autonomous send, or outcome pricing in outreach. Vertical = retention wedge for India finance chat teams.

---

## Eval go gate (brutal honesty)

| Claim | Use? |
| --- | --- |
| Keep-set SignalScore ≥80% on Eval week window (n ≥ 5) | **Yes — pilot win** |
| Opportunity lift vs partner-set baseline | Yes — document on Eval |
| Showcase / labeled CLI P/R | Measurement only — **not** a customer claim |
| Empty window / Insufficient Data | Not a go |
| Partner Demo wipe alone | Not a go until human reviews land |

---

## Do not sell (on the call or LinkedIn)

- Live Intercom / WhatsApp webhooks, Auth0, CRM APIs
- Autonomous actions / Action Mode outbound / “Sioona will email the customer”
- Chatbot or Gong replacement; outcome-based fees
- Fixture or Adapt-CLI 100% as the pilot promise
- On-prem, vLLM, QLoRA, LangGraph as near-term scope

Phase 1 sells: one redacted export → scored signals → human trust via SignalScore → Eval keep-set go.

---

## One-sentence ask (call open)

Same as the one-liner offer above — anonymized export, keep-set SignalScore + lift, nothing sends.

## Cold demo (no partner data)

1. Open http://localhost:3000 (or https://sioona-web.onrender.com) → **Upload → Run Partner Demo** (FastAPI must be up so Neon dual-write fills needs-review; if Insights shows a sync warning, check `BACKEND_URL` / hosted FastAPI per `web/DEPLOY.md`, then Re-run Detection). Seed is also in the header notifications menu.
2. **Insights** — Neon pending queue (not JSON-only pending). Empty pending after go: cadence helper in the queue empty state (**Mark Acted** on Correct, then next week’s export) — not a dead heading and not the header bell.
3. Open a **retention** or **lead** card: summary, evidence, suggested action (display-only)
4. **SignalScore** — mark ≥5 reviews (`correct` / `incorrect` / `partially_correct`)
5. **Eval** — labeled P/R + Pilot Metrics (≥80% target, go/no-go) + set partner baseline for lift + Next Step copy
6. Ask for a **2-week Shadow Mode pilot**: weekly export → Neon pending → SignalScore → Eval baseline / go-no-go

On hold / below target: use **Adapt From Reviews** on Eval to add phrases or negatives from rejects, then re-detect.

Real export checklist: [`docs/REAL_EXPORT.md`](docs/REAL_EXPORT.md).

Cold open and **Reset Demo** load Groww `web/data/samples/testing.json` (~100 conversations). **Run Partner Demo** wipes this tenant on Neon, then loads only `zerodha_batch_02.json` — it does not merge Groww + Zerodha and does not apply Zerodha Adapt. Cold first run sets baseline **4**; a prior **partner** baseline on Neon (e.g. share-out **12**) is restored after wipe so lift does not regress to cold-demo. `weekly_export_count` still resets.

## Week-1 pilot rhythm (visible in the strip)

| When | What | Where |
|------|------|--------|
| Day 1 | Upload or Partner Demo | Upload → Insights |
| Mid-week | Re-upload weekly export | Upload → Insights (Neon pending) |
| Ongoing | Mark ≥5 SignalScore reviews | Insights |
| Before share-out | Set baseline + read go/no-go | Eval |

Cadence helper on Insights empty queue, Upload, and Eval — not in the header bell. Partner Demo is Upload only. No autonomous actions — suggested next steps stay display-only.

**Hosted week-1 (sioona-demo):** set Eval baseline (dual-writes to Neon `pilot_settings`) + mid-week partner CSV re-upload with `replaced=false` (upsert by `externalId`, no Day-1 prune). Week-1 dry-run logged 2026-08-14: baseline 12, keep-set n=6 / precision 0.83 → go, lift 23. No new Detect engine.

**Week-2 dry-run (2026-08-14):** CLI `--week2` scored held-out `week2.local.csv` (34 labeled; base P 0.75 / R 0.31; adapt P 0.89 / R 0.55 — not week-1 1.00). sioona-demo mid-week upsert `replaced=false` (34 chats / 18 signals / sync failed=0). **Week-window SignalScore logged:** keep-set **n=7 / correct=7 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **6** (18 − 12). Not week-1 n=6 / 0.83. Do not expand `taxonomy.ts`. Never commit `*.local.csv`.

**This week keep-set (2026-08-17):** sioona-demo Day-1 replace of `partner-shaped-labeled.csv` (16 / 10) → mid-week **`replaced=false`** (`weekly_export_count` 2; sync failed=0) → **6** Correct reviews → Eval `?scoreFrom=2026-08-17` keep-set **n=6 / correct=6 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **−2** (10 − 12). Not week-1 0.83 / not week-2 n=7.

**Next-week keep-set (2026-08-18):** sioona-demo Groww Batch-01 JSON upsert **`replaced=false`** (100 chats / 7 signals / sync failed=0; not `*.local.csv`) → `weekly_export_count` **3** → **7** reviews → Eval `?scoreFrom=2026-08-17T19:34:00.000Z` keep-set **n=7 / correct=6 / incorrect=1 / precision 0.86 → go**; baseline **12**; lift **18** (30 − 12). Window Corrects **Acted 6/6**. Not the closed 2026-08-17 n=6 / 1.00.

**Batch-02 rehearsal keep-set (2026-08-18):** sioona-demo Groww Batch-02 JSON upsert **`replaced=false`** (100 chats / 14 signals / sync failed=0; file not copied; not the manifest / not `*.local.csv`) → `weekly_export_count` **4** → **7** Correct reviews → Eval `?scoreFrom=2026-08-18T14:37:31.774Z` keep-set **n=7 / correct=7 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **+23** (35 − 12). Window Corrects **Acted 7/7**. Rehearsal, not a live partner dump. Not the closed Batch-01 n=7 / 0.86.

**Real weekly partner export (2026-08-18 evening):** **skipped** — no unused dump then; count stayed **4**. Superseded by week3 below.

**Real weekly partner week3 (2026-08-21):** unused Groww Batch-02 `real-partner-export.week3.local.csv` mid-week upsert **`replaced=false`** (100 chats / 14 signals / sync failed=0; file not copied) → `weekly_export_count` **5** → **7** Correct reviews → Eval `?scoreFrom=2026-08-21T10:43:47.000Z` keep-set **n=7 / correct=7 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **+3** (15 − 12). Window Corrects **Acted 7/7**. Not Partner Demo wipe / not Adapt / not week-1/week-2 `.local.csv` / not Batch-02 JSON rehearsal.

**Real weekly partner week4 (2026-08-31):** unused Zerodha Week-4 Batch-01 pack (same chats as `real-partner-export.week4.local.csv`) mid-week upsert **`replaced=false`** as `Zerodha_week_4_batch_01.json` (100 chats; file not copied; Batch-02 held-out) → `weekly_export_count` **6** (CSV POST skipped after count already 6) → Eval `?scoreFrom=2026-08-31T09:58:00.000Z` keep-set **n=20 / correct=20 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **+36** (48 − 12). Window Corrects **Acted 20/20**. Not Partner Demo wipe / not Adapt / not week3 re-ingest / not week-1/week-2 `.local.csv`. Supersedes 2026-08-24 skip and the same-day n=7 / `09:51:38` reading. Paste-ready partner note: [`.cursor/docs/WEEK4_SHAREOUT.md`](.cursor/docs/WEEK4_SHAREOUT.md). Historical: live Neon later wiped+re-ingested the same pack (`10:27Z`; count **1** / baseline **0**).

**Real weekly partner next unused (2026-08-31 evening):** **skipped** — no unused dump (Week-4 Batch-02 held-out; no Week-5). Count stayed **1**. Eval `?scoreFrom=2026-08-31T10:41:38.000Z` keep-set **n=0 / correct=0 / incorrect=0 / Insufficient Data** (no go); baseline **0**; lift **+20** (20 − 0); **Acted 0**. Not Batch-02 ingest / not week3 / not Adapt / not Partner Demo wipe.

**Real weekly partner week4 attempt (2026-08-24):** **skipped** — no unused dump then. Count stayed **5**. Eval `?scoreFrom=2026-08-24T12:18:03.000Z` keep-set **n=0 / Insufficient Data** (no go). **Superseded** by week4 log above.

**Local Day-1 replace (2026-08-18):** customer-support `batch_001.csv` on localhost **`replaced=true`** (200 chats / 0 signals / sync failed=0; GT **200 lead**; file not copied) → Eval `?scoreFrom=2026-08-18T12:25:07.682Z` keep-set **n=0 / Insufficient Data**; baseline **12**; lift **−12** (0 − 12). Reviews still human — not labeled go / not Groww upsert / not Adapt.

**Week-2 share-outs:** Eval / Insights SignalScore and go/no-go use the **review window** (`feedback.reviewed_at`, default last 7 days UTC) ∩ conversation keep-set — not the recycled week-1 n=6 alone. Empty window → 0 reviewed / null score / **Insufficient Data** until new reviews land (hosted verified PR #37 on sioona-demo — no labeled-fixture Go shortcut). On Eval Metrics, pick **This Week** or a From date (`?scoreFrom=`); Insights preserves the param; `SIGNAL_SCORE_FROM` remains a server override.

## With a partner file

1. **Upload Partner Export** (or drop CSV / Intercom JSON / WhatsApp `.txt`)
2. Same Insights → SignalScore → Eval path (mid-week step completes on partner file ingest)
3. Set their baseline (“how many opportunities do you find today?”) so lift is credible

## Showcase corpus

| File | Role |
|------|------|
| `web/data/samples/testing.json` | Canonical Groww labeled corpus (eval + cold open / Reset) |
| `web/data/samples/zerodha_batch_02.json` | Committed Zerodha Batch-02 — Partner Demo only |

**Run Partner Demo** wipes Neon, then loads only `zerodha_batch_02.json`, dual-writes predictions to FastAPI/Neon, and sets the cold-demo baseline. No Zerodha Adapt on that click. **Reset Demo** returns Groww `testing.json`.

Eval lanes (not listed on Upload; not merged into Insights):

| File | Format |
|------|--------|
| `web/src/data/fixtures/partner-shaped-labeled.csv` | Sioona CSV + `ground_truth` |
| `web/src/data/fixtures/real-partner-export.template.csv` | Day-1 pilot template |
| `web/data/samples/real-partner-export.local.csv` | Gitignored real export drop-in (week-1; default `npm run eval:partner-export`) |
| `web/data/samples/real-partner-export.week2.local.csv` | Gitignored week-2 held-out drop-in (`--week2` / `PARTNER_EXPORT=week2`; never scores week-1 as week-2) |

## What not to promise on the call

See **Do not sell** above. Short list: no live webhooks, Auth0, CRM APIs, autonomous send, outcome fees, or chatbot replacement.

Phase 1 sells: ingest → scored signals → human trust via SignalScore → Eval keep-set go (≥80%).
