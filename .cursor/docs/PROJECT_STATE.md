# Sioona — Project State (agent SoT)

**Last updated:** 2026-08-14  
**Stage:** MVP — Insights + Shadow Mode + Detect v2 + durable chats (**hosted verified**)  
**Branch:** `production`

This is the file new agent windows should read first. Update it when decisions, milestones, or “what we’re doing now” change. Human-facing pointer: [`docs/PROJECT_STATE.md`](../../docs/PROJECT_STATE.md).

---

## 0. What we are doing now

**Heading: 2-week Shadow Mode pilot** — Live Adapt + SignalScore on the real export is **Done (local)**. Human review precision on this pack: **n=6, correct=5, incorrect=1, precision 0.83** → **go** vs ≥80% (not labeled P/R; do not cite CLI adapt 1.00 as a customer claim). Run weekly Insights reviews for two weeks. **Orphan mix fixed (slice 1):** SignalScore is scoped to the current conversation keep-set (JSON store ids from Eval/Insights, else Neon `conversations` if populated). Leftover Partner Demo `tenant_demo` feedback rows may remain in Neon but are **excluded** from the score — not deleted. Founder rhythm unchanged: weekly export + Insights SignalScore + Eval go/no-go for two weeks. **Next leftover:** Groq Developer **$20** spend cap when offered (non-blocking). Still not Auth0, not vLLM, not Action Mode, not Insights chrome. Taxonomy still JSON.

**Customer-export Detect metrics** (`npm run eval:partner-export`, source=`local` / `real-partner-export.local.csv`, 2026-08-14). **These are customer-export metrics, not template.** 40 chats / **23 labeled** (lead 5 / retention 8 / upsell 6 / none 4; 17 unlabeled excluded from P/R). Adapt = store-style `taxonomyOverrides` in [`partner-export-overrides.ts`](../../web/src/data/fixtures/partner-export-overrides.ts) merged by `getEffectiveTaxonomy`.

| | P | R | TP | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: |
| Heuristic (base) | **0.75** | **0.63** | 12 | 4 | 7 |
| Heuristic (adapt) | **1.00** | **1.00** | 19 | 0 | 0 |

Per-type **base:** lead P 0.56 / R 1.00; retention P 1.00 / R 0.88; upsell P n/a / R 0.00. **Adapt:** lead P 1.00 / R 1.00; retention P 1.00 / R 1.00; upsell P 1.00 / R 1.00. FP did not get worse (4 → 0). Hybrid this pass = **skipped** (llm added=0 on the prior Free run; Adapt is overrides, not Groq). This is Adapt on this 23-labeled pack — not a claim that Detect is solved in general. Never commit `.local.csv`.

| Slice | Status |
| --- | --- |
| Detect v2 (hybrid Groq pass 2) | **Closed 2026-08-14** — hosted Partner Demo verified on sioona-demo: Hybrid +N / `?llmAdded=`, retention first, no `syncFailed`. Concurrency-2 on `main` (PR #21). Groq **Free** ($0). See §3 |
| Neon prediction **upsert** `(tenant_id, conversation_id, signal_type)` | **Live on Neon** — `002_prediction_upsert` |
| Durable chats slice 1 (conversations + messages) | **Closed 2026-08-14** — FastAPI + Alembic `003_conversations_messages` **applied on hosted Neon** (PR #22). Dual-write from ingest / Partner Demo / reset |
| Neon chat hydrate (cold start) | **Closed 2026-08-14** — miss-path GET chats + detect + prediction sync + **feedback/Acted/GT restore**; JSON SoT when file exists; taxonomy stays JSON. **003+004+005 live**; Vercel redeploy cold-start verified GT restore into Eval (PR #24) |
| Shadow Mode `status: acted` | **Closed 2026-08-14** — reviewed signals only; JSON persist + re-detect keep; SignalStatus `CANCELED` / Acted; no outbound send. **`004_prediction_acted` applied on hosted Neon**; dual-write fail-soft; hydrate restores Acted |
| Groq plan / $20 spend cap | **Blocked** — Free; Developer upgrade unavailable. **Next leftover** when offered. Do **not** Create Project model limits |
| Real-partner-export hybrid eval | **Done 2026-08-14** — async loader always scores heuristic; optional hybrid via inject/`DETECT_LLM=1`+`GROQ_API_KEY`; tests never call Groq; `cd web && npm run eval:partner-export` |
| Ingest upsert by `externalId` | **Done 2026-08-14** — mid-week re-upload merges JSON chats; keep existing `conversation.id`; feedback/Acted via `mergeSignalsPreservingFeedback` |
| Upload replaces showcase | **Done 2026-08-14** — Day-1 partner CSV replaces JSON showcase; Neon prune leftover `tenant_demo` conversation_ids (fail-soft 404); confirm before replace |
| GT-on-Neon | **Hosted verified 2026-08-14** (PR #24) — Alembic `005_conversation_ground_truth` on Neon; dual-write + omit/null keep + PATCH clear; cold-start hydrate restores labeled Eval; taxonomy still JSON |
| Real partner transcript | **Scored 2026-08-14** — `real-partner-export.local.csv` (gitignored); heuristic P 0.75 / R 0.63 (TP 12 / FP 4 / FN 7); hybrid same (0 LLM adds). Not template |
| Adapt on real partner export | **Done 2026-08-14** — `taxonomyOverrides` from 4 FP / 7 FN (lead negatives: portfolio review / already doing sip / move my money; upsell phrases: portfolio review / already doing sip / increase investment / where do i even start). Adapt P **1.00** / R **1.00** (TP 19 / FP 0 / FN 0) vs base 0.75 / 0.63. Not `taxonomy.ts`. Labeled 1.00 is this 23-chat pack only |
| Live Adapt + SignalScore on real export | **Done 2026-08-14 (local)** — Day-1 replace ingest of `real-partner-export.local.csv` unioned Adapt into `store.taxonomyOverrides`; Insights matched adapt (lead FPs on portfolio-review / already-doing-SIP gone; upsell hits present; funds-out = retention). Human SignalScore **this pack:** n=6 / correct=5 / incorrect=1 / precision **0.83** (retention 1/1, upsell 3/3, lead 1/2). Gate ≥80% → **go**. Do not cite labeled 1.00 as a customer claim |
| SignalScore keep-set scope (pilot slice 1) | **Done 2026-08-14** — FastAPI `calculate_signal_score` + `GET …/signal-score?conversation_id=` filter predictions to current keep-set. Eval/Insights pass JSON store ids. Orphan Partner Demo reviews stay in Neon, unscored. Empty keep-set → 0 reviewed / null score (not tenant-wide). |

**Detect v2 is done.** Hydrate / 003 / 004 / **005** are on hosted Neon. How Detect v2 works stays in §3. Do not put keys/tokens in this file. Never commit `.local.csv` / PII.

**Do not:** Auth0, pgvector, vLLM/QLoRA/LangGraph, live webhooks, autonomous actions, more Geist polish, FastAPI classify, Groq project rate limits, 429 retries, taxonomy/signals on Neon, taxonomy expansion to fake recall.

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
| Data | JSON `store.ts` for chats/taxonomy (**UI SoT** when a file exists); **Neon** for predictions + feedback + Acted (`004`) + dual-written conversations/messages + conversation `ground_truth` (`005` **hosted**) + **cold-start chat hydrate** (feedback + GT restored after detect+sync) | Full Neon chat SoT + taxonomy + pgvector |
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
- API: https://sioona-api.onrender.com/health → ok (Render **free** — cold after ~15 min). Auto-deploys from **`main`** (PR #24 shipped `005`; build runs `alembic upgrade head`)
- Neon: `002` + `003` + `004` + **`005_conversation_ground_truth` applied** (`alembic_version` = `005_conversation_ground_truth`). `GET /v1/tenants/tenant_demo/conversations` returns `ground_truth` (41 labeled after Partner Demo; sample `conv_rajesh_thakur_26` = `lead`). Signals GET live
- Vercel store is ephemeral (`/tmp`) — **003+004+005 live**. On miss, GET Neon chats then join feedback/Acted + conversation `ground_truth` after detect+sync; else reseed `testing.json`. **Cold-start verified 2026-08-14:** Production redeploy → Eval Labeled Conversations showed restored GT (not blank)
- Vercel: project API token in `web/.env` as `VERCEL_TOKEN` (gitignored). MCP is read-only for env; REST upsert works. CLI `whoami` still fails on this token type

---

## 6. Completed (condensed)

- Insights Shadow Mode: Neon queue, in-queue review (`?preview=`), conversation drawer, Correct/Incorrect/Partial → Neon then JSON mirror
- Ingest: Sioona CSV/JSON, Intercom JSON, WhatsApp `.txt`; PII regex on ingest; **Day-1 replace** (file-only JSON store; Neon prune leftover conversation_ids, fail-soft 404) then **mid-week upsert by `externalId`** (stable ids + merge; messages replaced; chats not in file stay; feedback/Acted kept)
- Eval: labeled P/R, Signal Score, baseline lift, Adapt from incorrect/partial (manual phrases/negatives)
- Partner Demo = `testing.json` only (stable conv ids from `externalId`)
- Dual-write retries; feedback lazy-create; unmatched Neon rows **omitted** (no stub cards)
- Durable chats slice 1: `conversations` + `messages` upsert `(tenant_id, conversation_id)` / `(tenant_id, message_id)`; fail-soft dual-write; **hosted `003` applied** (PR #22)
- Neon chat hydrate (cold start): miss-path GET `tenant_demo` → map `conversation_id`/`message_id` + `ground_truth` → detect + prediction sync → GET tenant signals + join feedback/Acted by `backendSignalId` or conversation+type → copy conversation GT onto matching signals → `writeStore`; empty/down → `testing.json`; existing file unchanged; feedback GET timeout fail-soft. **003+004+005 live; cold-start GT restore verified** (Vercel redeploy)
- **GT-on-Neon hosted verified** (2026-08-14, PR #24) — `conversations.ground_truth` nullable (`lead|retention|upsell|none|null`); dual-write from ingest / Partner Demo / label UI; omit/null on upsert does not wipe; PATCH `null` or `clear_ground_truth` clears; no taxonomy table on Neon. Do not claim customer recall
- Shadow Mode `status: acted`: `setSignalActed` after feedback; JSON persist + fail-soft dual-write to Neon `004` (**hosted applied**); survives `mergeSignalsPreservingFeedback` and hydrate; queue/detail via existing `SignalStatus`; no Intercom/WhatsApp/email send
- Detect v2 hybrid + Neon upsert `002` + concurrency **2** (PR #21 on `main`); Groq Free ($0); classify stays in Next.js
- **Hosted Detect v2 closed** (2026-08-14) — Partner Demo on sioona-demo: Hybrid +N / `?llmAdded=`, retention first, no `syncFailed`
- **Hosted hydrate + 003/004 closed** (2026-08-14, PR #22) — then **`005` hosted verified** (PR #24); Partner Demo dual-wrote 41 chats / 231 messages with GT; Insights queue loads
- **Real-partner-export hybrid eval** (2026-08-14) — async loader scores heuristic always + optional hybrid (inject or env); `npm run eval:partner-export`; tests never call Groq
- **Real partner transcript scored** (2026-08-14) — `source=local` `real-partner-export.local.csv` (23 labeled / 40); heuristic P **0.75** / R **0.63** (TP 12 / FP 4 / FN 7); hybrid same (llm added=0). CSV ingest keeps newlines in quoted fields. **Not template.** Never commit `.local.csv`
- **Adapt on real partner export** (2026-08-14) — `taxonomyOverrides` fixture (not `taxonomy.ts`); adapt P **1.00** / R **1.00** (TP 19 / FP 0 / FN 0) vs base 0.75 / 0.63. Eval CLI prints base confusion + adapt. Labeled 1.00 is this 23-chat pack only
- **Live Adapt into JSON store** (2026-08-14) — Day-1/replace ingest unions fixture into `store.taxonomyOverrides`; Eval Apply Scored Adapt writes the same merge + re-detect. Not `taxonomy.ts`
- **Live Adapt + SignalScore on real export** (2026-08-14, **local**) — replace ingest 40 chats / 36 signals; Adapt live in JSON store; Insights adapted set. Human SignalScore this pack: **5/6 = 0.83 go** (≥80%). Pre-scope Eval overlay mixed Partner Demo leftovers (43/47); **orphan mix fixed** by keep-set scope (slice 1) — score uses current conversation ids only. Not hosted-verified. Not CLI 1.00
- **SignalScore keep-set scope** (2026-08-14, pilot slice 1) — FastAPI + Eval/Insights scope reviews to JSON store (else Neon `conversations`) keep-set; leftover Partner Demo feedback rows may remain, unscored; never delete feedback for score honesty
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
2. ~~Neon chat hydrate on cold start~~ **Closed 2026-08-14** — miss-path + detect + prediction sync + **feedback/Acted/GT restore**; JSON SoT when file exists; taxonomy stays JSON. Hosted `003`+`004`+`005` applied; cold-start GT restore verified (PR #24). Still not Auth0
3. ~~`status: acted`~~ **Closed 2026-08-14** — Shadow Mode JSON persist after review; hosted Neon `004` + hydrate restore; SignalStatus Acted; no live actions
4. ~~**Real-partner-export hybrid eval**~~ **Closed 2026-08-14** — loader + tests + `eval:partner-export`; template is measurement only. Customer proof is §0 local.csv score
5. ~~**Ingest upsert by externalId**~~ **Closed 2026-08-14** — partner re-upload merges JSON by `externalId`; Neon upserts unchanged; feedback/Acted kept
6. ~~**Upload replaces showcase**~~ **Closed 2026-08-14** — Day-1 partner upload replaces JSON showcase; confirm; Neon prune leftover `tenant_demo` conversation_ids (fail-soft 404). Mid-week still merges
7. ~~**GT-on-Neon**~~ **Hosted verified 2026-08-14** (PR #24) — Neon head `005_conversation_ground_truth`; labeled Eval survives Vercel `/tmp` cold-start; taxonomy still JSON
8. ~~**Real partner transcript**~~ **Scored 2026-08-14** — customer-export `real-partner-export.local.csv` (not template); heuristic P 0.75 / R 0.63
9. ~~**Adapt on real partner export**~~ **Done 2026-08-14** — overrides from 4 FP / 7 FN; adapt P 1.00 / R 1.00 (FP 4→0). Labeled 1.00 is this 23-chat pack only
10. ~~**Live Adapt + SignalScore on real export**~~ **Done 2026-08-14 (local)** — Adapt in live JSON store; Insights adapted set; human review precision **0.83** (5/6) → **go**. Next heading: **2-week Shadow Mode pilot**. **Next leftover:** Groq $20 cap when Developer is offered
11. ~~**SignalScore keep-set scope (pilot slice 1)**~~ **Done 2026-08-14** — Eval/Insights score only current conversation ids; leftover Partner Demo reviews excluded, not deleted. Not Insights chrome.

~~Detect v2~~ **Closed** (hosted Partner Demo 2026-08-14). ~~Hydrate / 003 / 004~~ **Closed** (hosted 2026-08-14, PR #22). ~~GT-on-Neon / 005~~ **Hosted verified** (PR #24). ~~Real partner transcript~~ **Scored**. ~~Adapt on real partner export~~ **Done**. ~~Live Adapt + SignalScore~~ **Done (local)**. ~~Keep-set score scope~~ **Done**. Heading is the 2-week Shadow Mode pilot, not a new Detect engine. Do not reopen for classify-on-FastAPI, 429 retries, Groq project limits, Insights chrome, or taxonomy-on-Neon.

---

## 10. How to work

- Ask mode = Architect (prompts only). Agent = build.
- Small verifiable steps. Tests: `cd web && npm test`; `cd backend && pytest`.
- Update **this file** when the heading, stack, or blockers change.
- Signal chrome is locked — reuse existing chips; do not invent status/score/type UI.
