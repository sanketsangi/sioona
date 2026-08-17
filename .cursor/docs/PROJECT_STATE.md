# Sioona — Project State (agent SoT)

**Last updated:** 2026-08-17  
**Stage:** MVP — Insights + Shadow Mode + Detect v2 + durable chats (**hosted verified**)  
**Branch:** `main`

Read this first in new agent windows. Update on heading / stack / blocker changes.

---

## 0. What we are doing now

**Heading: 2-week Shadow Mode pilot.** Pilot win = human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 / vLLM / Action Mode outbound. Taxonomy still JSON.

**This week (ops, 2026-08-17):** Keep-set **closed** on sioona-demo. Day-1 replace of `partner-shaped-labeled.csv` (16 chats / 10 signals; showcase had no `weeklyExportCount`) → mid-week re-upload **`replaced=false`** (16 upserts; `predictionSync.failed=0`; `conversationSync.failed=0`; `weekly_export_count` **2**) → **6** Insights Correct reviews in window (`?scoreFrom=2026-08-17`) → Eval keep-set SignalScore **n=6 / correct=6 / incorrect=0 / precision 1.00 → go**; baseline **12**; lift **−2** (10 − 12). Not week-1 0.83 / not week-2 n=7. No Auth0 / vLLM / Adapt phrases / UI polish.

| Gate | Result |
| --- | --- |
| Week-1 keep-set (sioona-demo) | n=6 / correct=5 / incorrect=1 / **0.83 → go**; baseline **12**; lift **23** |
| Week-2 keep-set (sioona-demo) | n=7 / correct=7 / incorrect=0 / **1.00 → go**; baseline **12**; lift **6** (18−12). Not week-1 0.83 |
| This week keep-set (sioona-demo) | **logged 2026-08-17** — n=6 / correct=6 / incorrect=0 / **1.00 → go**; baseline **12**; lift **−2** (10−12). Pack: partner-shaped 16 chats / 10 signals; mid-week `replaced=false`; `?scoreFrom=2026-08-17` |
| Week-1 labeled Adapt CLI | P **1.00** / R **1.00** (23 labeled) — pack only; **not** a customer claim |
| Week-2 held-out Adapt CLI | P **0.89** / R **0.55** (34 labeled) — not week-1 1.00 |

**Cadence / infra locks:** mid-week upsert `replaced=false`; keep-set SignalScore (orphan Partner Demo rows excluded, not deleted); week-scoped `reviewed_at` + Eval `?scoreFrom=` (empty → Reviewed 0 / **Insufficient Data**, never labeled Go); Adapt + pilot settings survive `/tmp` wipe (hydrate union + Neon `006`). Groq **$20 skipped** (Free; do not Create Project limits). Never commit `*.local.csv` / PII / `store.json`.

**Do not:** Auth0, pgvector, vLLM/QLoRA/LangGraph, live webhooks, autonomous actions, more Geist polish, FastAPI classify, Groq project rate limits, 429 retries, taxonomy/signals on Neon, taxonomy expansion to fake recall, more Adapt phrase tuning.

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
| Data | JSON `store.ts` for chats/taxonomy (**UI SoT** when file exists); **Neon** for predictions + feedback + Acted (`004`) + conversations/messages + `ground_truth` (`005`) + pilot settings (`006`) + cold-start hydrate | Full Neon chat SoT + taxonomy + pgvector |
| Auth | `X-Tenant-Id` (`tenant_demo`) | Auth0 |
| Hosting | Vercel `sioona-demo.vercel.app` + Render `sioona-api.onrender.com` (free, sleeps) + Neon `sioona` | Render Starter / Neon Launch if sleep hurts |
| Score SoT | FastAPI + Neon | — |
| Queue SoT | `GET …/signals/needs-review` → `join-needs-review.ts` | — |

**Unused:** Render `sioona` / `sioona.onrender.com` — **deleted** (404). Keep **`sioona-api`** `/health` ok.

**Autonomy:** Shadow Mode only. Suggested actions display-only. `status: acted` never executes outbound.

---

## 3. Detect v2 — **closed / hosted verified** 2026-08-14

Heuristics always → optional Groq Qwen on zero-signal misses (`DETECT_LLM=1` + `GROQ_API_KEY`; concurrency **2**; fail-soft; LLM must not override heuristic hits) → prediction upsert. File: `web/src/lib/detect-llm.ts`. Off by default → $0. See `web/.env.example`, `web/DEPLOY.md`.

Template hybrid (historical): heuristic P 0.92 / R 0.41 → hybrid P 0.93 / R 0.48. Do **not** move classify to FastAPI / add 429 retries / Create Groq project limits.

---

## 4. Repo map

Types / taxonomy / detect / ingest / store / eval / sync / hydrate: `web/src/lib/`. Backend: `backend/app/`. Signal chrome locked: `SignalStatus` / `SignalScoreChip` / `SignalTypeChip` / `SignalUser`. Rules: `sioona-architecture.mdc`, `sioona-domain.mdc`, `sioona-product.mdc`, `architect.mdc`. Alias `@/*` → `web/src/*`.

---

## 5. Hosted pointers

- App: https://sioona-demo.vercel.app — Production `BACKEND_URL` + Detect v2 env; Partner Demo / Adapt / keep-set / week window / pilot restore verified (PRs #22–#37; Production `625b9a0` for empty-window Eval). **This week keep-set logged 2026-08-17:** partner-shaped pack live (16 chats / 10 signals); Eval `?scoreFrom=2026-08-17` → n=6 / 1.00 / **Go**; Neon `GET …/pilot` baseline **12**, `weekly_export_count` **2**
- API: https://sioona-api.onrender.com/health → ok (free; cold ~15m). Auto-deploy `main`; `alembic upgrade head`
- Neon head: `006_pilot_settings` (`002`–`006` applied). Vercel `/tmp` ephemeral — hydrate restores chats + Adapt union + pilot + feedback/Acted/GT
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
- **This week keep-set logged 2026-08-17** — mid-week `replaced=false`; n=6 / 1.00 → go; baseline 12; lift −2 (partner-shaped pack)
- Insights chrome 2026-08-15 (dashboard header, Performance metrics, Mark Acted, Eval export panel)
- Feedback stale-UUID recovery 2026-08-16 — resolve by Neon id / conversation+type; upsert+retry on 404 (hosted Correct without “not found for tenant”)
- Groq $20 spend cap **skipped**; unused Render `sioona` **deleted**

---

## 7. Later / do not start

- Auth0 / real tenant isolation
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp webhooks
- Action Mode / Export / Create Campaign (dead chrome — leave locked)
- Outcome billing, computer-use, GPU
- Taxonomy expansion / more Adapt phrase chasing / classify-on-FastAPI / 429 retries / Groq project limits / taxonomy-on-Neon

---

## 8. How to work

- Ask = Architect (prompts). Agent = build. Small verifiable steps.
- Tests: `cd web && npm test`; `cd backend && pytest`.
- Update **this file** when heading, stack, or blockers change.
- Signal chrome locked — reuse chips; do not invent status/score/type UI.
