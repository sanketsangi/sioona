# Sioona — Project State (agent SoT)

**Last updated:** 2026-08-14  
**Stage:** MVP — Insights + Shadow Mode + Detect v2 + durable chats (**hosted verified**)  
**Branch:** `production`

This is the file new agent windows should read first. Update it when decisions, milestones, or “what we’re doing now” change. Human-facing pointer: [`docs/PROJECT_STATE.md`](../../docs/PROJECT_STATE.md).

---

## 0. What we are doing now

**Heading: real-partner-export hybrid eval** — next remaining development (not started this pass). Measure hybrid Detect v2 on a redacted partner export (`web/data/samples/real-partner-export.local.csv`) before claiming customer recall. Still not Auth0, not vLLM, not Action Mode, not Insights chrome.

| Slice | Status |
| --- | --- |
| Detect v2 (hybrid Groq pass 2) | **Closed 2026-08-14** — hosted Partner Demo verified on sioona-demo: Hybrid +N / `?llmAdded=`, retention first, no `syncFailed`. Concurrency-2 on `main` (PR #21). Groq **Free** ($0). See §3 |
| Neon prediction **upsert** `(tenant_id, conversation_id, signal_type)` | **Live on Neon** — `002_prediction_upsert` |
| Durable chats slice 1 (conversations + messages) | **Closed 2026-08-14** — FastAPI + Alembic `003_conversations_messages` **applied on hosted Neon** (PR #22). Dual-write from ingest / Partner Demo / reset |
| Neon chat hydrate (cold start) | **Closed 2026-08-14** — miss-path GET chats + detect + prediction sync + **feedback restore** (`GET /v1/tenants/{id}/signals`); JSON SoT when file exists; taxonomy/GT stay JSON. **003+004 live; hydrate path armed** (true `/tmp` cold-start restore not forced this pass) |
| Shadow Mode `status: acted` | **Closed 2026-08-14** — reviewed signals only; JSON persist + re-detect keep; SignalStatus `CANCELED` / Acted; no outbound send. **`004_prediction_acted` applied on hosted Neon**; dual-write fail-soft; hydrate restores Acted |
| Groq plan / $20 spend cap | **Blocked** — Free; Developer upgrade unavailable. Do **not** Create Project model limits |
| Real partner transcript | **Next** — required before claiming recall is real; not required to keep building |

**Detect v2 is done.** Hydrate / 003 / 004 are on hosted Neon. How Detect v2 works stays in §3. Do not put keys/tokens in this file.

**Do not:** Auth0, pgvector, vLLM/QLoRA/LangGraph, live webhooks, autonomous actions, more Geist polish, FastAPI classify, Groq project rate limits, 429 retries, taxonomy/GT/signals on Neon.

**No real pilot chat does not block development.** It only blocks the claim that Groq works on customers. Measure on `testing.json` until one redacted export exists (`web/data/samples/real-partner-export.local.csv`). Reset Demo / Partner Demo still seed `testing.json` and overwrite via existing upsert.

---

## 1. Product (one line)

**Sioona.ai** — overlay conversation intelligence. Finds `lead` / `retention` / `upsell` in existing Intercom / WhatsApp / CSV chats. Shadow Mode review. **Not** a chatbot. Internal engine name **SignalC1** — never in UI.

Primary product signal for Detect v2: **retention** (lead/upsell secondary).

---

## 2. Locked architecture

| Layer | Current | Later (do not start) |
| --- | --- | --- |
| App | Next.js 15/16 App Router, React 19, Tailwind, Geist (`web/`) | — |
| API | FastAPI Signal Score only (`backend/`) | Auth0-gated multi-tenant API |
| Detect | `detect.ts` heuristics + optional `detect-llm.ts` Groq pass 2 | vLLM / LangGraph / QLoRA |
| Data | JSON `store.ts` for chats/taxonomy/GT (**UI SoT** when a file exists); **Neon** for predictions + feedback + Acted (`004`) + dual-written conversations/messages + **cold-start chat hydrate** (feedback restored after detect+sync) | Full Neon chat SoT + taxonomy/GT + pgvector |
| Auth | `X-Tenant-Id` (`tenant_demo`) | Auth0 |
| Hosting | Vercel `sioona-demo.vercel.app` + Render `sioona-api.onrender.com` (free, sleeps) + Neon project `sioona` (free, 0.25 CU) | Render Starter / Neon Launch if sleep hurts |
| Score SoT | FastAPI + Neon | — |
| Queue SoT | `GET /v1/tenants/{id}/signals/needs-review` joined in `join-needs-review.ts` | — |

**Unused:** Render `sioona.onrender.com` (duplicate free API) — ignore or delete later.

**Autonomy:** Shadow Mode only. Suggested actions are display-only. `status: acted` is set from Insights after feedback (JSON + Neon `004`); never executes the action.

---

## 3. Detect v2 (how it works) — **closed / hosted verified** 2026-08-14

```text
runHybridDetection
  → runDetection (heuristics, always)
  → if DETECT_LLM=1 and GROQ_API_KEY:
       Groq Qwen on conversations with zero heuristic signals
       max 8 calls (local default), concurrency 2, 6s timeout
       env DETECT_LLM_MAX_CALLS / DETECT_LLM_CONCURRENCY override
       fail-soft (keep heuristic result; 429 → null, no retry)
  → syncPredictionsToBackend (upsert every signal)
```

- File: [`web/src/lib/detect-llm.ts`](../../web/src/lib/detect-llm.ts)
- Default model: `qwen/qwen3.6-27b` (override `DETECT_LLM_MODEL`)
- LLM **must not** override a heuristic hit (precision gate)
- Quotes must be grounded in customer text or the hit is dropped
- Evidence includes `llm: <model>` so reviewers can see the source
- Wired from: `/api/detect`, `/api/ingest`, `/api/store` redetect, Partner Demo (`load-testing-json-store.ts`)
- Tests: `web/src/lib/detect-llm.test.ts` (injected classifier lifts `testing.json` recall, FP not worse; concurrency default 2 / env override; heuristic hits never overridden)
- **Heuristic-only:** P **0.92** / R **0.41** (TP 11 / FP 1 / FN 16). Fixture + partner-pack still P/R **1.0**
- **Live hybrid vs heuristic** (2026-08-13, `qwen/qwen3.6-27b`, 29 miss candidates, then-concurrency 8):

| | P | R | TP | FP | FN |
| --- | --- | --- | --- | --- | --- |
| Heuristic | 0.92 | 0.41 | 11 | 1 | 16 |
| Hybrid | **0.93** | **0.48** | 13 | **1** | 14 |

Per-type hybrid: lead P 0.67 / R 0.25 (unchanged); retention P 1.00 / R **0.57** (was 0.50); upsell P 1.00 / R **0.60** (was 0.40).  
LLM stats: attempted 29 / added 2 / failed 20 / skipped 0. FP **not** > 1 (same `nisha_agarwal_84` lead-vs-upsell heuristic FP).  
Follow-up probe: 8 parallel Groq calls → **1×200 + 7×429** `rate_limit_exceeded`. Fail-soft kept precision; recall lift was a lower bound. **This slice** dropped default concurrency to **2** and env-gated it (no 429 retry — Hobby 10s). Do **not** move classify to FastAPI.

**Groq console (2026-08-13):** Free plan. `qwen/qwen3.6-27b` org ceiling is already 30 RPM / 1,000 RPD / 8K TPM / 200K TPD. `/settings/project/limits` is **rate**, not dollars — **do not Create Limits** (can only stay the same or go lower → more 429s). Spend cap lives at `/settings/billing/limits` and is **invisible until Developer**. When Developer is offered: monthly **20**, alerts 10 / 15 / 18.

**Env (web, server-only):**

```
DETECT_LLM=1
GROQ_API_KEY=gsk_…
# optional
DETECT_LLM_MODEL=qwen/qwen3.6-27b
DETECT_LLM_MAX_CALLS=8
DETECT_LLM_CONCURRENCY=2
# Production: DETECT_LLM_MAX_CALLS=4 DETECT_LLM_CONCURRENCY=2
```

Template: [`web/.env.example`](../../web/.env.example). Off by default → $0. Hosted steps: [`web/DEPLOY.md`](../../web/DEPLOY.md). **$20/mo spend cap deferred** (Free; Developer waitlist).

**Upsert:** `POST /v1/predictions` updates the same Neon row. Migration [`backend/alembic/versions/002_prediction_upsert.py`](../../backend/alembic/versions/002_prediction_upsert.py) **applied on hosted Neon** (2026-08-13). Render `sioona-api` build still runs `alembic upgrade head` on each deploy (no-op at head).

**Queue rank:** retention → upsell → lead, then newest (`review_queue.py` + `sortSignals`).

---

## 4. Repo map (edit here)

- Types: `web/src/lib/types.ts`
- Taxonomy: `web/src/lib/taxonomy.ts`
- Detect: `web/src/lib/detect.ts` + `detect-llm.ts`
- Ingest / store / eval / sync: matching files in `web/src/lib/` (`sync-predictions.ts`, `sync-conversations.ts`, `hydrate-conversations.ts`)
- Signal Score client: `web/src/lib/backend-client.ts`
- Backend: `backend/app/`
- Signal chrome (locked): `SignalStatus` / `SignalScoreChip` / `SignalTypeChip` / `SignalUser`
- Rules: `.cursor/rules/sioona-architecture.mdc`, `sioona-domain.mdc`, `sioona-product.mdc`, `architect.mdc`

Path alias `@/*` → `web/src/*`.

---

## 5. Hosted demo (as of 2026-08-14)

- App: https://sioona-demo.vercel.app — Production `BACKEND_URL` + Detect v2 env set. **Partner Demo verified 2026-08-14 (PR #22):** 41 chats dual-written, `predictionSync.failed=0`, `conversationSync.failed=0`, Hybrid +1 / no `syncFailed`, Insights queue loads (needs-review 20, retention first). Preview/Dev Groq unset
- API: https://sioona-api.onrender.com/health → ok (Render **free** — cold after ~15 min). Auto-deploys from **`main`** (PR #22 shipped 003+004)
- Neon: `002_prediction_upsert` + **`003_conversations_messages` + `004_prediction_acted` applied** (`alembic_version` = `004_prediction_acted`). `GET /v1/tenants/tenant_demo/conversations` and `GET /v1/tenants/tenant_demo/signals` are live (not 404)
- Vercel store is ephemeral (`/tmp`) — **003+004 live; hydrate path armed**. On miss, GET Neon chats then join feedback/Acted after detect+sync; else reseed `testing.json`. True `/tmp` cold-start restore only proves on a new serverless instance (not forced this pass)
- Vercel: project API token in `web/.env` as `VERCEL_TOKEN` (gitignored). MCP is read-only for env; REST upsert works. CLI `whoami` still fails on this token type

---

## 6. Completed (condensed)

- Insights Shadow Mode: Neon queue, in-queue review (`?preview=`), conversation drawer, Correct/Incorrect/Partial → Neon then JSON mirror
- Ingest: Sioona CSV/JSON, Intercom JSON, WhatsApp `.txt`; PII regex on ingest
- Eval: labeled P/R, Signal Score, baseline lift, Adapt from incorrect/partial (manual phrases/negatives)
- Partner Demo = `testing.json` only (stable conv ids from `externalId`)
- Dual-write retries; feedback lazy-create; unmatched Neon rows **omitted** (no stub cards)
- Durable chats slice 1: `conversations` + `messages` upsert `(tenant_id, conversation_id)` / `(tenant_id, message_id)`; fail-soft dual-write; **hosted `003` applied** (PR #22)
- Neon chat hydrate (cold start): miss-path GET `tenant_demo` → map `conversation_id`/`message_id` → detect + prediction sync → GET tenant signals + join feedback/Acted by `backendSignalId` or conversation+type → `writeStore`; empty/down → `testing.json`; existing file unchanged; feedback GET timeout fail-soft. **003+004 live; hydrate path armed**
- Shadow Mode `status: acted`: `setSignalActed` after feedback; JSON persist + fail-soft dual-write to Neon `004` (**hosted applied**); survives `mergeSignalsPreservingFeedback` and hydrate; queue/detail via existing `SignalStatus`; no Intercom/WhatsApp/email send
- Detect v2 hybrid + Neon upsert `002` + concurrency **2** (PR #21 on `main`); Groq Free ($0); classify stays in Next.js
- **Hosted Detect v2 closed** (2026-08-14) — Partner Demo on sioona-demo: Hybrid +N / `?llmAdded=`, retention first, no `syncFailed`
- **Hosted hydrate + 003/004 closed** (2026-08-14, PR #22) — Alembic head `004_prediction_acted`; Partner Demo dual-wrote 41 chats / 231 messages; Insights queue loads
- Confirmed Groq Project Limits ≠ spend cap; left model limits at org max

---

## 7. Later / do not start

- Auth0 / real tenant isolation
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp webhooks
- Action Mode / Export / Create Campaign (dead chrome — leave locked)
- Outcome billing, computer-use, GPU

---

## 8. Ask the founder (open)

1. ~~Groq key locally~~ **Done** — `web/.env` (gitignored).
2. ~~Vercel Production Groq env + Partner Demo~~ **Done 2026-08-14** — hosted Detect v2 verified.
3. ~~$20 Groq spend cap~~ **Blocked** — Free plan; Developer upgrade unavailable. Revisit [Billing → Limits](https://console.groq.com/settings/billing/limits) only after Developer is offered. Until then $0.
4. Optional: delete unused Render service `sioona` (`sioona.onrender.com`).

Do **not** Create Limits on `/settings/project/limits`. Durable Neon chats + hydrate + Acted are on hosted Neon (PR #22).

---

## 9. Next slices (ordered)

1. ~~Durable chats on Neon — conversations / messages~~ **Closed 2026-08-14** — dual-write live; hosted `003` applied (PR #22)
2. ~~Neon chat hydrate on cold start~~ **Closed 2026-08-14** — miss-path + detect + prediction sync + **feedback/Acted restore**; JSON SoT when file exists; taxonomy/GT stay JSON. Hosted `003`+`004` applied. **003+004 live; hydrate path armed** (cold-start restore not forced). Still not Auth0
3. ~~`status: acted`~~ **Closed 2026-08-14** — Shadow Mode JSON persist after review; hosted Neon `004` + hydrate restore; SignalStatus Acted; no live actions
4. **Real-partner-export hybrid eval** — redacted export at `web/data/samples/real-partner-export.local.csv`; measure hybrid vs heuristic before claiming customer recall
5. When Groq Developer is available: monthly spend **20** + alerts (does not block building)

~~Detect v2~~ **Closed** (hosted Partner Demo 2026-08-14). ~~Hydrate / 003 / 004~~ **Closed** (hosted 2026-08-14, PR #22). Do not reopen for classify-on-FastAPI, 429 retries, Groq project limits, or Insights chrome.

---

## 10. How to work

- Ask mode = Architect (prompts only). Agent = build.
- Small verifiable steps. Tests: `cd web && npm test`; `cd backend && pytest`.
- Update **this file** when the heading, stack, or blockers change.
- Signal chrome is locked — reuse existing chips; do not invent status/score/type UI.
