# Sioona – Project State

**Last updated:** August 11, 2026  
**Current Stage:** MVP – Insights + Shadow Mode

---

## 1. Product Summary

**Sioona** is an AI system that detects high-value business signals (leads, retention risk, upsell, churn risk, fraud) inside existing customer conversations.

It works as an **overlay** on existing chat tools (does not replace them).

**Current focus:** Insights Tier + Shadow Mode  
**Public brand:** Sioona  
**Internal engine/pipeline name (optional):** SignalC1

---

## 2. Core Architecture Decisions (Locked)

| Area                         | Decision                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Frontend                     | Next.js 16 (App Router) + TypeScript + Tailwind + Geist                                   |
| Backend                      | FastAPI                                                                                   |
| Database                     | Neon for Signal Score (predictions/feedback); full Postgres + pgvector migration later    |
| Auth                         | Target Auth0; current gate is required `X-Tenant-Id` header                               |
| Signal Score Source of Truth | FastAPI + Neon (`reviewPrecision` in JSON is legacy fallback only)                        |
| Shadow Mode queue SoT        | FastAPI `GET /v1/tenants/{id}/signals/needs-review` (Neon); join to JSON for evidence     |
| Data split                   | Chats, messages, taxonomy overrides stay in JSON store (`web/data/`)                      |
| Dual-write                   | Detect/ingest sync predictions to FastAPI (3 attempts, 50/150ms backoff); feedback BFF requires Neon first |
| AI Approach                  | Open models preferred, start with strong prompting + managed inference, fine-tuning later |
| Hosting (Phase 1)            | Render + managed inference                                                                |
| Multi-tenancy                | Required from day one (tenant_id everywhere)                                              |
| Autonomy                     | Shadow Mode first. No autonomous actions until Signal Score is strong                     |

---

## 3. Current Status

### Completed

- App shell: shadcn sidebar-07 primitives (`SidebarProvider` / collapsible `icon` sidebar); custom mobile drawer replaced by Sheet; product nav unchanged (Insights / Upload / Eval / Taxonomy); geist `Avatar` preserved for `SignalUser` / messages
- Shared Insights signal chrome: `SignalStatus` / `SignalScoreChip` / `SignalTypeChip` / `SignalUser`; Insights queue + in-row accordion review consume them (taxonomy keeps colored `SignalBadge`)
- Project foundation & structure (`web/` + `backend/`); Next.js 16 deploy path
- Domain wedges: broking/wealth + fintech CS taxonomy/demo samples; PII redaction; audit log
- Detection heuristics improved (qualified-lead / badge-expansion as lead; fintech CS tuning)
- Signal Score backend: predictions, feedback, score, needs-review APIs + Alembic + tests
- Next.js client/BFF: `backend-client`, dual-write (`sync-predictions` with multi-retry + short backoff + stats), soft score fetch
- Feedback BFF: lazy-creates missing prediction, then requires FastAPI feedback before JSON mirror
- Feedback labels: `correct` / `incorrect` / `partially_correct`
- Signal Score UI: `SignalScoreSummary` on Eval (Insights queue chrome shows score chips per row) — overall %, Reviewed/Correct + Incorrect/Partially correct, per-type breakdown; Neon SoT via `fetchSignalScoreSafe`
- Insights pending queue wired to Neon `needs-review` (join by `backendSignalId` / conversation+type); backend-down shows explicit queue error (no JSON pending SoT fallback)
- Day-1 pilot packaging: fail-loud `predictionSync` UX (upload / re-detect / partner demo → Insights `syncFailed` banner); partner demo returns `predictionSync`; Neon stub accordion honest empty evidence + feedback via prediction UUID
- Insights operator review: in-queue accordion (`?preview=`) replaces full-page Signal Detail and split `SignalPreviewPanel`; `/insights/[id]` and legacy `?signal=` redirect to `preview=`
- 7-day Shadow Mode pilot cadence UI: one `Week1PilotStrip` on Upload / Insights / Eval (Day 1 → mid-week re-upload → ≥5 reviews → baseline → go/no-go); `pilot.weeklyExportCount` advances on partner file ingest only; cross-links Upload ↔ Insights ↔ Eval; display-only actions
- Detection precision pass on synthetics: tightened upsell/lead phrases + support negatives; keyword-only ≥2 hits; soft-retention refund phrases; hard-negative fixtures; sample pack lead-vs-upsell label alignment
- Synthetic eval on root `testing.json` (41 convs / 231 msgs; measurement baseline, not P/R=1.0 gate): loader `web/src/lib/testing-json-eval.ts` maps `labels[]` → `groundTruth` (lead/upsell as-is; churn_risk|retention_risk→retention; complaint|fraud→none; multi-label priority retention>upsell>lead) → ingest → detect → `computeEvalMetrics`. Run: `npx vitest run src/lib/testing-json.eval.test.ts` from `web/`
  - **Partner demo / cold open showcase** = `testing.json` only (`loadTestingJsonIntoStore`; deployable copy at `web/data/samples/testing.json`). Old Intercom / WhatsApp / CSV showcase sample pack removed. Detect/eval P/R=1.0 gate uses test-only `detect-eval-fixtures.ts`. Synthetic eval path unchanged.
  - **Customer names in Insights queue:** corpus encodes names in `externalId` (`rahul_mehta_29`); loader derives `customerName` → detect summaries + dual-write to FastAPI/Neon; UI User column shows the name (no Neon schema change). Queue Signal uses `queueSignalSummary` so the name/`(channel)` prefix is not repeated under the name line (stored summaries unchanged).
  - **Before narrow recall pass:** P **0.83** / R **0.19** (TP 5 / FP 1 / FN 22)
  - **After narrow recall pass:** P **0.92** / R **0.41** (TP 11 / FP 1 / FN 16) — mix after map: lead 8 · retention 14 · upsell 5 · none 14
  - **Per-type (after):** lead P0.67/R0.25 · retention P1.00/R0.50 · upsell P1.00/R0.40
  - **FP delta:** still **1** FP (same wrong-type `nisha_agarwal_84` upsell→lead on forex/international); **no new FPs**
  - **Narrow taxonomy adds only:** upsell `want to invest more` / `invest more` / top-up loan phrases; lead keyword `first time` + `don't have any credit card`; retention soft-churn (`thinking of shifting`, `moving my portfolio`, `deleting my account`, `account closure process`, `cancel this card`). Soft/ops FNs intentionally left ignored. Fixtures in `detect.test.ts`; fixture + partner-pack gates still P/R 1.0

### In Progress

- Insights demo chrome polish (enterprise Geist) — detect remains frozen; queue StatusDot: Pending (blue) | Correct (green) | Incorrect (red) | Partially Correct (orange); URL `status=new` unchanged; queue Signal strips leading customer name via `queueSignalSummary`; Type/Score chips hairline-only; Evidence quote-only from `lg+`; Review toggles in-row accordion expand (`?preview=`); conversation transcript opens in Drawer via **Open Conversation** (Message + Bubble, not inline); drawer has visible **Conversation** header + customer subtitle and in-header Close (narrow right sheet desktop / bottom sheet mobile)
- Dual-write: multi-retry + backoff (3 attempts, 50/150ms) + `backendFetch` AbortSignal timeout (2.5s); feedback lazy-create remains safety net
- **Hosted demo verified 2026-08-11:** Partner Demo dual-write green on sioona-demo (`predictionSync` created=27 / failed=0; all signals have `backendSignalId`). FastAPI `https://sioona-api.onrender.com/health` ok; Vercel Production `BACKEND_URL` set; Neon needs-review SoT live. Detect frozen; next product priority remains real partner export + outreach.
- **Residual detection gap = real partner transcripts:** partner-shaped pack + fixture gates at P/R 1.00; `testing.json` measured after narrow recall pass (P0.92/R0.41). Day-1 real-export lane ready — drop redacted CSV at `web/data/samples/real-partner-export.local.csv` (from `real-partner-export.template.csv`) and run `npx vitest run src/lib/partner-export.eval.test.ts` (loader `partner-export-eval.ts`); still need real partner exports filled in

### Not Started / Later

- Auth0 and real multi-tenant isolation beyond header tenant id
- Full Neon migration of conversations / messages; pgvector
- LLM / vLLM / LangGraph detection (still keyword heuristics)
- Full open-model fine-tuning pipeline (signalc1-pipeline)
- Advanced autonomous actions
- Computer-use agents
- Complex outcome-based billing
- Self-hosted GPU infrastructure

---

## 4. Signal Score

**Definition:**  
SignalScore = (Signals marked correct) / (Total signals reviewed)

**Rules:**

- FastAPI + Neon is the source of truth
- Feedback values: `correct` | `incorrect` | `partially_correct`
- Must support overall score + per-signal-type breakdown
- Multi-tenant aware
- Pending / needs-review queue is Neon-backed (predictions without feedback)

This is a **critical** trust metric for pilots.

---

## 5. MVP Goals (Near Term)

1. Accept real or uploaded chat data
2. Detect a small set of high-value signals
3. Show them clearly in Shadow Mode
4. Allow human feedback
5. Display Signal Score
6. Run 7-day free Shadow Mode pilots
7. Convert to paid Insights Tier

---

## 6. Current Highest-Leverage Priorities

1. Improve detection on **real partner transcripts** (synthetic `testing.json` measured; partner-shaped + fixtures gated; Day-1 export lane ready — residual gap is real exports)
2. Run the 7-day cadence with a real partner export (strip is in-product; prove precision + lift on their chats)
3. Only then expand Auth0 / full Neon chats / fine-tuning

---

## 7. Important Constraints

- Bootstrap / solo-founder constraints
- Prefer simple, focused steps
- Do not over-build autonomy early
- Protect multi-tenancy and data isolation
- Finance customers care heavily about trust and accuracy

---

## 8. How to Work in This Repo

- **Ask mode** = Architect (planning + writing prompts)
- **Agent / Composer** = Builder (executing prompts)
- Always prefer small, verifiable steps
- Update this file when major decisions or milestones change
