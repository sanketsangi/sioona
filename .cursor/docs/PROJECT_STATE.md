# Sioona — Project State (agent SoT)

**Last updated:** 2026-08-13  
**Stage:** MVP — Insights + Shadow Mode + Detect v2 (code + upsert live; Groq still **off**)  
**Branch:** `production` (Detect v2 + upsert committed this run)

This is the file new agent windows should read first. Update it when decisions, milestones, or “what we’re doing now” change. Human-facing pointer: [`docs/PROJECT_STATE.md`](../../docs/PROJECT_STATE.md).

---

## 0. What we are doing now

**Heading: Detect v2** — hybrid keyword + managed Groq Qwen second pass. Not Auth0, not vLLM, not Action Mode, not another Insights chrome pass.

| Slice | Status |
| --- | --- |
| Neon prediction **upsert** `(tenant_id, conversation_id, signal_type)` | **Live on Neon** — Alembic `002_prediction_upsert` applied 2026-08-13 (`alembic_version` = `002_prediction_upsert`; unique `uq_signal_predictions_tenant_conv_type`) |
| Groq Qwen pass 2 on heuristic **misses only** | Code shipped — **off** (no `GROQ_API_KEY` this run; `DETECT_LLM` unset locally and on Vercel) |
| Retention ranks first in queue + `sortSignals` | Done |
| Quiet Insights `?llmAdded=` / queue “Hybrid +N” after detect/demo | Done |
| Live Groq eval on `testing.json` | **Blocked** — need founder Groq key (see §8). Heuristic-only still P **0.92** / R **0.41** |
| Real partner transcript | **Not required to keep building**; required before claiming recall is real |

**Detect v2 is not live.** Upsert + hybrid code are in git and 002 is on Neon. Pass 2 never runs until `DETECT_LLM=1` + `GROQ_API_KEY` are set locally and on Vercel Production.

**Do not:** Auth0, full Neon chats, pgvector, vLLM/QLoRA/LangGraph, live webhooks, autonomous actions, more Geist polish.

**No real pilot chat does not block development.** It only blocks the claim that Groq works on customers. Keep building; measure on `testing.json` until one redacted export exists (`web/data/samples/real-partner-export.local.csv`).

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
| Data | JSON `web/data/store.ts` for chats/taxonomy/GT; **Neon** for predictions + feedback | Full Neon chats + pgvector |
| Auth | `X-Tenant-Id` (`tenant_demo`) | Auth0 |
| Hosting | Vercel `sioona-demo.vercel.app` + Render `sioona-api.onrender.com` (free, sleeps) + Neon project `sioona` (free, 0.25 CU) | Render Starter / Neon Launch if sleep hurts |
| Score SoT | FastAPI + Neon | — |
| Queue SoT | `GET /v1/tenants/{id}/signals/needs-review` joined in `join-needs-review.ts` | — |

**Unused:** Render `sioona.onrender.com` (duplicate free API) — ignore or delete later.

**Autonomy:** Shadow Mode only. Suggested actions are display-only. `status: acted` exists in types, never set.

---

## 3. Detect v2 (how it works)

```text
runHybridDetection
  → runDetection (heuristics, always)
  → if DETECT_LLM=1 and GROQ_API_KEY:
       Groq Qwen on conversations with zero heuristic signals
       max 8 calls, concurrency 8, 6s timeout
       fail-soft (keep heuristic result)
  → syncPredictionsToBackend (upsert every signal)
```

- File: [`web/src/lib/detect-llm.ts`](../../web/src/lib/detect-llm.ts)
- Default model: `qwen/qwen3.6-27b` (override `DETECT_LLM_MODEL`)
- LLM **must not** override a heuristic hit (precision gate)
- Quotes must be grounded in customer text or the hit is dropped
- Evidence includes `llm: <model>` so reviewers can see the source
- Wired from: `/api/detect`, `/api/ingest`, `/api/store` redetect, Partner Demo (`load-testing-json-store.ts`)
- Tests: `web/src/lib/detect-llm.test.ts` (injected classifier lifts `testing.json` recall, FP not worse)
- **Heuristic-only** (current live path): P **0.92** / R **0.41** on `testing.json` (TP 11 / FP 1 / FN 16). Fixture + partner-pack still P/R **1.0**
- **Live hybrid vs heuristic:** not measured — Groq key not provided this run

**Env (web, server-only):**

```
DETECT_LLM=1
GROQ_API_KEY=gsk_…
# optional
DETECT_LLM_MODEL=qwen/qwen3.6-27b
DETECT_LLM_MAX_CALLS=8
```

Template: [`web/.env.example`](../../web/.env.example). Off by default → $0. Hosted steps: [`web/DEPLOY.md`](../../web/DEPLOY.md). Cap Groq at **$20/mo**.

**Upsert:** `POST /v1/predictions` updates the same Neon row. Migration [`backend/alembic/versions/002_prediction_upsert.py`](../../backend/alembic/versions/002_prediction_upsert.py) **applied on hosted Neon** (2026-08-13). Render `sioona-api` build still runs `alembic upgrade head` on each deploy (no-op at head).

**Queue rank:** retention → upsell → lead, then newest (`review_queue.py` + `sortSignals`).

---

## 4. Repo map (edit here)

- Types: `web/src/lib/types.ts`
- Taxonomy: `web/src/lib/taxonomy.ts`
- Detect: `web/src/lib/detect.ts` + `detect-llm.ts`
- Ingest / store / eval / sync: matching files in `web/src/lib/`
- Signal Score client: `web/src/lib/backend-client.ts`
- Backend: `backend/app/`
- Signal chrome (locked): `SignalStatus` / `SignalScoreChip` / `SignalTypeChip` / `SignalUser`
- Rules: `.cursor/rules/sioona-architecture.mdc`, `sioona-domain.mdc`, `sioona-product.mdc`, `architect.mdc`

Path alias `@/*` → `web/src/*`.

---

## 5. Hosted demo (as of 2026-08-13)

- App: https://sioona-demo.vercel.app — Production `BACKEND_URL` set; **Detect v2 env not set**
- API: https://sioona-api.onrender.com/health → ok (Render **free** — cold after ~15 min). Auto-deploys from **`main`** (not `production`)
- Neon: `002_prediction_upsert` on; needs-review live
- Vercel store is ephemeral (`/tmp`) — reseeds from `testing.json`
- Vercel CLI not logged in this machine — set Groq env in dashboard when key exists (see `web/DEPLOY.md`)

---

## 6. Completed (condensed)

- Insights Shadow Mode: Neon queue, in-queue review (`?preview=`), conversation drawer, Correct/Incorrect/Partial → Neon then JSON mirror
- Ingest: Sioona CSV/JSON, Intercom JSON, WhatsApp `.txt`; PII regex on ingest
- Eval: labeled P/R, Signal Score, baseline lift, Adapt from incorrect/partial (manual phrases/negatives)
- Partner Demo = `testing.json` only (stable conv ids from `externalId`)
- Dual-write retries; feedback lazy-create; unmatched Neon rows **omitted** (no stub cards)
- Detect v2 hybrid code + Neon upsert `002` (2026-08-13) — Groq still off

---

## 7. Later / do not start

- Auth0 / real tenant isolation
- Neon conversations / messages / taxonomy / GT
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp webhooks
- Action Mode / Export / Create Campaign (dead chrome — leave locked)
- Outcome billing, computer-use, GPU

---

## 8. Ask the founder (open)

1. **Groq API key** — paste in chat (or set yourself). Local: `web/.env` with `DETECT_LLM=1` + `GROQ_API_KEY` (gitignored). Vercel Production: same two vars, then redeploy. Until then pass 2 never runs. Cap **$20/mo** in Groq console.
2. ~~Commit + deploy backend / apply `002`~~ **Done** 2026-08-13 (Neon head = `002_prediction_upsert`).
3. Optional: delete unused Render service `sioona` (`sioona.onrender.com`).

Do **not** wait for a pilot export to continue Detect v2.

---

## 9. Next Detect v2 slices (ordered)

1. Founder pastes Groq key → turn on locally + Vercel Production → live `testing.json` hybrid vs heuristic (watch FP > 1)
2. Partner Demo on sioona-demo after upsert deploy (no orphan cards)
3. If Vercel 10s Hobby timeout bites: lower `DETECT_LLM_MAX_CALLS` only (do not move classify to FastAPI in that pass)
4. Then stop. Next heading after v2 is durable chats on Neon + `status: acted` — still not Auth0

---

## 10. How to work

- Ask mode = Architect (prompts only). Agent = build.
- Small verifiable steps. Tests: `cd web && npm test`; `cd backend && pytest`.
- Update **this file** when the heading, stack, or blockers change.
- Signal chrome is locked — reuse existing chips; do not invent status/score/type UI.
