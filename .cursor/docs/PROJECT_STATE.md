# Sioona — Project State (agent SoT)

**Last updated:** 2026-08-20  
**Stage:** MVP — Insights + Shadow Mode + Detect v2 + durable chats (**hosted verified**)  
**Branch:** `main`

Read this first in new agent windows. Update on heading / stack / blocker changes.

---

## 0. What we are doing now

**Heading: 2-week Shadow Mode pilot.** Pilot win = human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 / vLLM / Action Mode outbound. Taxonomy still JSON.

**This week (ops, 2026-08-18):** Groww Batch-02 **rehearsal** keep-set **closed** on sioona-demo (upsert, not a live partner dump). Hosted JSON was still Groww (125 chats / 21 signals), not localhost CS `batch_001`. Batch-02 JSON upsert **`replaced=false`** (100 chats / 14 signals / sync failed=0; not copied; not `*.local.csv` / not the manifest) → `weekly_export_count` **4** → **7** Insights Correct reviews → Eval `?scoreFrom=2026-08-18T14:37:31.774Z` keep-set **n=7 / correct=7 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **+23** (35−12). Window Corrects **Acted 7/7** (display-only). Cold-demo baseline 4 on Neon was restored to **12** before share-out. Not the closed Batch-01 n=7 / 0.86; labeled P/R is measurement only (local heuristic P 1.00 / R 0.25, 14 TP). Local CS `batch_001` replace stays a negative example (200/0). **Real weekly partner upsert skipped 2026-08-18 evening** — no unused dump on disk (Groww / CS / `partner-shaped` rehearsal and already-logged week-1 / week-2 `.local.csv` excluded; file not copied). Neon `weekly_export_count` still **4**; baseline still **12**. Remaining leftover = wait for a **real** weekly partner export, then mid-week `replaced=false`. No Auth0 / vLLM / Adapt phrases. Partner-facing leftover chrome pass (dead CTAs / shadcn→Geist / Insights demote) is **not** the keep-set win.

**Local-complete (working tree, 2026-08-20) — not on origin/hosted yet:** Partner Demo wipe→`zerodha_batch_02.json` only (no Groww merge) + Insights Follow-up/Done from Neon `GET …/signals`. That closes the Groww∩demo keep-set id mismatch **locally** when FastAPI wipe succeeds. **Origin/hosted** still: cold-open Groww JSON ∩ leftover Neon Groww reviews → Eval keep-set **n=0 Insufficient Data** (data, not `/signal-score` error) until this tree deploys. Not a keep-set win / not Auth0.

| Gate | Result |
| --- | --- |
| Week-1 keep-set (sioona-demo) | n=6 / correct=5 / incorrect=1 / **0.83 → go**; baseline **12**; lift **23** |
| Week-2 keep-set (sioona-demo) | n=7 / correct=7 / incorrect=0 / **1.00 → go**; baseline **12**; lift **6** (18−12). Not week-1 0.83 |
| This week keep-set (sioona-demo) | **logged 2026-08-17** — n=6 / correct=6 / incorrect=0 / **1.00 → go**; baseline **12**; lift **−2** (10−12). Pack: partner-shaped 16 chats / 10 signals; mid-week `replaced=false`; `?scoreFrom=2026-08-17`. **Acted 7/7** window Corrects (display-only) |
| Next-week keep-set (sioona-demo) | **logged 2026-08-18** — n=7 / correct=6 / incorrect=1 / **0.86 → go**; baseline **12**; lift **18** (30−12). Pack: Groww Batch-01 upsert `replaced=false` (100/7; sync failed=0); `weekly_export_count` **3**; `?scoreFrom=2026-08-17T19:34:00.000Z`. **Acted 6/6** window Corrects (display-only). Not the closed 2026-08-17 n=6 / 1.00 |
| Batch-02 rehearsal keep-set (sioona-demo) | **logged 2026-08-18** — n=7 / correct=7 / incorrect=0 / **1.00 → go**; baseline **12**; lift **+23** (35−12). Pack: Groww Batch-02 JSON upsert `replaced=false` (100/14; sync failed=0); `weekly_export_count` **4**; `?scoreFrom=2026-08-18T14:37:31.774Z`. **Acted 7/7** window Corrects (display-only). Rehearsal, not a live partner dump. Not the closed Batch-01 n=7 / 0.86 |
| Real weekly partner export (sioona-demo) | **skipped 2026-08-18 evening** — no unused real dump on disk. Did not ingest Groww / CS / `partner-shaped` / week-1 / week-2 `.local.csv`. Hosted `weekly_export_count` **4**; baseline **12**; last keep-set remains Batch-02 n=7 / 1.00. Not a Day-1 replace |
| Local Day-1 replace (batch_001) | **logged 2026-08-18** — customer-support `batch_001.csv` replace `replaced=true` (200 chats / 0 signals / sync failed=0; GT 200 lead; file not copied). Eval `?scoreFrom=2026-08-18T12:25:07.682Z` → n=0 / **Insufficient Data**; baseline **12**; lift **−12**. Reviews still human — not labeled go. Not Groww upsert |
| Week-1 labeled Adapt CLI | P **1.00** / R **1.00** (23 labeled) — pack only; **not** a customer claim |
| Week-2 held-out Adapt CLI | P **0.89** / R **0.55** (34 labeled) — not week-1 1.00 |
| Deploy gate (2026-08-19) | web **331** / backend **56** pass; hosted 7-step smoke **all green** (Insights/Upload/Eval **200**); tenant-wide SignalScore **n=13**; keep-set Eval **n=0 → Insufficient Data** = Partner Demo JSON ids ∩ Neon Groww ids (**data**, not `/signal-score` error); **007** applied; `/pilot` **200** + `last_uploaded_file_name` |

**Cadence / infra locks:** mid-week upsert `replaced=false`; keep-set SignalScore (orphan Partner Demo rows excluded, not deleted); week-scoped `reviewed_at` + Eval `?scoreFrom=` (empty → Reviewed 0 / **Insufficient Data**, never labeled Go); Adapt + pilot settings survive `/tmp` wipe (hydrate union + Neon `007`). Groq **$20 skipped** (Free; do not Create Project limits). Never commit `*.local.csv` / PII / `store.json`.

**Do not:** Auth0, pgvector, vLLM/QLoRA/LangGraph, live webhooks, autonomous actions, further design-language work after the leftover chrome pass, FastAPI classify, Groq project rate limits, 429 retries, taxonomy/signals on Neon, taxonomy expansion to fake recall, more Adapt phrase tuning.

---

## 1. Product (one line)

**Sioona.ai** — overlay conversation intelligence (`lead` / `retention` / `upsell`) on existing chats. Shadow Mode review. **Not** a chatbot. Engine name **SignalC1** — never in UI. Primary Detect signal: **retention**.

---

## 2. Locked architecture

| Layer | Current | Later (do not start) |
| --- | --- | --- |
| App | Next.js 15/16 App Router, React 19, Tailwind, Geist (`web/`) | — |
| API | FastAPI Signal Score only (`backend/`) | Auth0-gated multi-tenant API |
| Detect | `detect.ts` heuristics + optional `detect-llm.ts` Groq pass 2 | vLLM / LangGraph / QLoRA |
| Data | JSON `store.ts` for chats/taxonomy (**UI SoT** when file exists); **Neon** for predictions + feedback + Acted (`004`) + conversations/messages + `ground_truth` (`005`) + pilot settings (`006`/`007`) + cold-start hydrate | Full Neon chat SoT + taxonomy + pgvector |
| Auth | `X-Tenant-Id` (`tenant_demo`) | Auth0 |
| Hosting | Vercel `sioona-demo.vercel.app` + Render `sioona-api.onrender.com` (free, sleeps) + Neon `sioona` | Render Starter / Neon Launch if sleep hurts |
| Score SoT | FastAPI + Neon | — |
| Queue SoT | Pending: `GET …/signals/needs-review`. Follow-up / Done: `GET …/signals` (`correct` ¬acted / `acted`) | — |

**Unused:** Render `sioona` / `sioona.onrender.com` — **deleted** (404). Keep **`sioona-api`** `/health` ok.

**Autonomy:** Shadow Mode default. Unlocked Action Mode = Insights Follow-up Act queue (Suggested Next Action + Mark Acted; display-only). `status: acted` never executes outbound. Prod locks Action Mode.

---

## 3. Detect v2 — **closed / hosted verified** 2026-08-14

Heuristics always → optional Groq Qwen on zero-signal misses (`DETECT_LLM=1` + `GROQ_API_KEY`; concurrency **2**; fail-soft; LLM must not override heuristic hits) → prediction upsert. File: `web/src/lib/detect-llm.ts`. Off by default → $0. See `web/.env.example`, `web/DEPLOY.md`.

Template hybrid (historical): heuristic P 0.92 / R 0.41 → hybrid P 0.93 / R 0.48. Do **not** move classify to FastAPI / add 429 retries / Create Groq project limits.

---

## 4. Repo map

**Architecture (Ask SoT):** [`.cursor/docs/architecture.md`](./architecture.md) — topology, dual SoT, Detect, backend surface, seams.  
Types / taxonomy / detect / ingest / store / eval / sync / hydrate: `web/src/lib/`. Backend: `backend/app/`. Signal chrome locked: `SignalStatus` / `SignalScoreChip` / `SignalTypeChip` / `SignalUser`. Rules: `sioona-architecture.mdc`, `sioona-domain.mdc`, `sioona-product.mdc`, `architect.mdc`. Alias `@/*` → `web/src/*`.

---

## 5. Hosted pointers

- App: https://sioona-demo.vercel.app — Production `BACKEND_URL` + Detect v2 env; Partner Demo / Adapt / keep-set / week window / pilot restore verified (PRs #22–#37; Production `625b9a0` for empty-window Eval). **Batch-02 rehearsal keep-set logged 2026-08-18:** Groww Batch-02 upsert (`replaced=false`, 100/14); Eval `?scoreFrom=2026-08-18T14:37:31.774Z` → n=7 / 1.00 / **Go**; window Corrects **Acted 7/7**; Neon `weekly_export_count` **4**, baseline **12**. Rehearsal, not a live partner dump. **Real weekly partner upsert skipped 2026-08-18 evening** (no unused dump; count still **4**). **Prior next-week (Batch-01) logged 2026-08-18:** 100/7; `?scoreFrom=2026-08-17T19:34:00.000Z` → n=7 / 0.86. **Local Day-1 replace** of CS `batch_001` (200/0) remains localhost-only.
- API: https://sioona-api.onrender.com/health → ok (free; cold ~15m). Auto-deploy `main`; `alembic upgrade head`
- Neon head: `007_pilot_upload_name` (`002`–`007` applied; `last_uploaded_file_name` on `pilot_settings`). Vercel `/tmp` ephemeral — hydrate restores chats + Adapt union + pilot + feedback/Acted/GT
- Vercel token: `web/.env` `VERCEL_TOKEN` (gitignored)

---

## 6. Closed / log (condensed)

- Insights Shadow Mode queue + review → Neon then JSON mirror
- Ingest: Day-1 replace + mid-week `externalId` upsert; PII regex; multi-format
- Detect v2 hybrid + upsert `002` + concurrency 2 — **hosted closed** (PR #21)
- Durable chats `003` + hydrate + Acted `004` + GT `005` + pilot `006` — **hosted verified** (PRs #22–#31)
- Real-partner Adapt + live SignalScore **0.83 go** keep-set — **hosted** (PR #27); Adapt hydrate union (PR #29)
- Week-scoped SignalScore + empty-window Insufficient Data — **hosted** (PR #34 + #37)
- Week-1 / Week-2 dry-runs logged (go above); week-2 held-out CLI scored; Zerodha Adapt shipped 2026-08-15 (stop phrase tuning)
- **This week keep-set logged 2026-08-17** — mid-week `replaced=false`; n=6 / 1.00 → go; baseline 12; lift −2 (partner-shaped pack); **Mark Acted** on window Corrects (7/7); next-week upsert skipped (no file)
- **Next-week keep-set logged 2026-08-18** — Groww Batch-01 upsert `replaced=false` (100/7; sync failed=0); n=7 / 0.86 → go; baseline 12; lift 18; **Mark Acted** on window Corrects (6/6); not `*.local.csv` / not the closed 2026-08-17 window
- **Batch-02 rehearsal keep-set logged 2026-08-18** — Groww Batch-02 JSON upsert `replaced=false` (100/14; sync failed=0); n=7 / 1.00 → go; baseline 12; lift +23; **Mark Acted** on window Corrects (7/7); `weekly_export_count` **4**; `?scoreFrom=2026-08-18T14:37:31.774Z`; not a live partner dump / not CS `batch_001` / not the closed Batch-01 window
- **Real weekly partner upsert skipped 2026-08-18 evening** — no unused real dump on disk (Groww / CS / `partner-shaped` / week-1 / week-2 `.local.csv` excluded); Neon `weekly_export_count` still **4**; last keep-set remains Batch-02 n=7 / 1.00
- **Local Day-1 replace logged 2026-08-18** — customer-support `batch_001.csv` `replaced=true` (200/0; sync failed=0; GT 200 lead; file not copied); Eval `?scoreFrom=2026-08-18T12:25:07.682Z` n=0 / Insufficient Data; baseline 12; lift −12; no human reviews; not Adapt / not Groww upsert
- Insights chrome 2026-08-15 (dashboard header, Performance metrics, Mark Acted, Eval export panel)
- Partner leftover chrome 2026-08-19 — Help/Guidance disabled; `NavUser` identity-only (no Account / Billing / Notifications / Log Out); Demo workspace; Export/Create Campaign hidden at all breakpoints; Insights first fold = ops queue + Performance metric-strip; bell exceptions-only (no queue-clear); Partner Demo on Upload; shadcn bound to `sio-*` (not keep-set)
- Partner Demo / sample pack split 2026-08-20 — **local-complete** (working tree; not origin/hosted): cold open + Reset stay Groww `testing.json`; **Run Partner Demo** wipes Neon then loads only committed `zerodha_batch_02.json` (no Adapt, no Groww merge); `partner-shaped-labeled.csv` + `real-partner-export.template.csv` moved to fixtures (eval/CLI only, unlist from Upload pack). Hosted keep-set n=0 footgun remains until deploy.
- Feedback stale-UUID recovery 2026-08-16 — resolve by Neon id / conversation+type; upsert+retry on 404 (hosted Correct without “not found for tenant”)
- Acted stale-id recovery 2026-08-19 — Mark as Acted reuses feedback resolve (Neon UUID / conversation+type / `sig_neon_` stub); JSON fail-soft; neon-only `setPredictionActed` when the row is missing or unreviewed (hosted Correct → Acted without “Signal not found”)
- Insights follow-up lists 2026-08-20 — **local-complete** (working tree; not origin/hosted): Needs Follow-Up (`correct` ¬acted) and Done (`acted`) from Neon `GET …/signals`; request-scoped chat overlay when JSON misses the conversation; Mark Acted still display-only. Not a keep-set win / not Auth0
- Unlocked Action Mode 2026-08-20 — **local-complete**: `?mode=action` deep-links Insights Follow-up Act queue (Suggested Next Action + Mark Acted; FastAPI+Neon Acted SoT; nothing sent). Prod stays locked (ModeToggle bounce + strip `mode=action`). Unlock via local `next dev` or `NEXT_PUBLIC_ACTION_MODE_UNLOCKED`. Export/Create Campaign stay hidden. Not outbound / not Auth0
- Insights pending landing 2026-08-20 — **local-complete**: omitted status with Follow-up empty + Pending > 0 lands `status=new` (lists Neon needs-review under the attention heading); explicit empty Follow-up stays compact + Review Pending (not a flex-1 dead panel). Not a keep-set win / not outbound
- Mark Acted Pending return 2026-08-20 — **local-complete**: Mark Acted from Pending / All returns to next pending `?preview=` or `status=new` list (not empty Follow-up); Follow-up Act-queue Correct walk unchanged. Not outbound
- Deploy gate **logged 2026-08-19** — web 331 / backend 56 pass; hosted smoke all green; Eval keep-set 0 = JSON vs Neon id mismatch (not API error); Alembic **007** on Neon; no SSR/API 500s
- Groq $20 spend cap **skipped**; unused Render `sioona` **deleted**

---

## 7. Later / do not start

- Auth0 / real tenant isolation
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp webhooks
- Action Mode outbound send (unlocked Action Mode = Insights Act queue only; prod locked)
- Export / Create Campaign (unshipped — hidden, not overflow)
- Outcome billing, computer-use, GPU
- Taxonomy expansion / more Adapt phrase chasing / classify-on-FastAPI / 429 retries / Groq project limits / taxonomy-on-Neon

---

## 8. How to work

- Ask = Architect (prompts). Agent = build. Small verifiable steps.
- Ask stack map: `.cursor/docs/architecture.md`. This file = heading / gates / do-not-start.
- Tests: `cd web && npm test`; `cd backend && .venv/bin/python -m pytest`.
- Update **this file** when heading, gates, or blockers change; update `architecture.md` when topology / SoT / seams change.
- Signal chrome locked — reuse chips; do not invent status/score/type UI.

### Deploy gate (every deploy)

Full copy-paste block: [`web/DEPLOY.md`](../../web/DEPLOY.md#deploy-gate-every-deploy). Render free-tier may cold-start (~15m idle); if `/health` fails, retry once after ~30s.

**Before each deploy**

```bash
cd web && npm test
cd backend && .venv/bin/python -m pytest
```

Both must pass before pushing/deploying.

**After each deploy** — 7-step curl smoke (`BACKEND_URL` / `VERCEL_URL` / `TENANT`):

```bash
export BACKEND_URL="https://sioona-api.onrender.com"   # Render FastAPI
export VERCEL_URL="https://sioona-demo.vercel.app"     # Vercel web
export TENANT="tenant_demo"

# 1. Backend boot
curl -sS "$BACKEND_URL/health"
# expect: {"status":"ok"}

# 2. Critical UI routes (SSR must not 500)
curl -sS -o /dev/null -w "insights=%{http_code}\n" "$VERCEL_URL/?view=insights"
curl -sS -o /dev/null -w "upload=%{http_code}\n" "$VERCEL_URL/?view=upload"
curl -sS -o /dev/null -w "eval=%{http_code}\n" "$VERCEL_URL/?view=eval"

# 3. Legacy signal deep-link redirect
curl -sS -D- -o /dev/null "$VERCEL_URL/insights/sig_test" | rg -i "^location:"
# expect: Location: /?view=insights&preview=sig_test

# 4. Shadow Mode queue API
curl -sS "$BACKEND_URL/v1/tenants/$TENANT/signals/needs-review" \
  -H "X-Tenant-Id: $TENANT"
# expect: JSON array (may be empty)

# 5. Signal Score API
curl -sS "$BACKEND_URL/v1/tenants/$TENANT/signal-score" \
  -H "X-Tenant-Id: $TENANT"
# expect: reviewed_count, signal_score fields
```
