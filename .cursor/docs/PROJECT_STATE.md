# Sioona – Project State

**Last updated:** August 10, 2026  
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

- Project foundation & structure (`web/` + `backend/`); Next.js 16 deploy path
- Domain wedges: broking/wealth + fintech CS taxonomy/demo samples; PII redaction; audit log
- Detection heuristics improved (qualified-lead / badge-expansion as lead; fintech CS tuning)
- Signal Score backend: predictions, feedback, score, needs-review APIs + Alembic + tests
- Next.js client/BFF: `backend-client`, dual-write (`sync-predictions` with multi-retry + short backoff + stats), soft score fetch
- Feedback BFF: lazy-creates missing prediction, then requires FastAPI feedback before JSON mirror
- Feedback labels: `correct` / `incorrect` / `partially_correct`
- Signal Score UI: `SignalScoreSummary` on Insights, Eval, Signal Detail — overall %, Reviewed/Correct + Incorrect/Partially correct, per-type breakdown; Neon SoT via `fetchSignalScoreSafe`; detection confidence labeled separately on detail
- Insights pending queue wired to Neon `needs-review` (join by `backendSignalId` / conversation+type); backend-down shows explicit queue error (no JSON pending SoT fallback)
- Day-1 pilot packaging: fail-loud `predictionSync` UX (upload / re-detect / partner demo → Insights `syncFailed` banner); partner demo returns `predictionSync`; Neon stub detail honest empty evidence + feedback via prediction UUID
- 7-day Shadow Mode pilot cadence UI: one `Week1PilotStrip` on Upload / Insights / Eval (Day 1 → mid-week re-upload → ≥5 reviews → baseline → go/no-go); `pilot.weeklyExportCount` advances on partner file ingest only; cross-links Upload ↔ Insights ↔ Eval; display-only actions
- Detection precision pass on synthetics: tightened upsell/lead phrases + support negatives; keyword-only ≥2 hits; soft-retention refund phrases; hard-negative fixtures; sample pack lead-vs-upsell label alignment

### In Progress

- Dual-write: multi-retry + backoff (3 attempts, 50/150ms) + `backendFetch` AbortSignal timeout (2.5s); feedback lazy-create remains safety net
- Residual detection gap: partner-shaped pack at P/R 1.00/1.00; Day-1 real-export lane ready — drop redacted CSV at `web/data/samples/real-partner-export.local.csv` (from `real-partner-export.template.csv`) and run `npx vitest run src/lib/partner-export.eval.test.ts` (loader `partner-export-eval.ts`); still need real partner exports filled in

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

1. Improve detection on **real partner transcripts** (synthetic + partner-shaped packs gated; Day-1 export lane ready)
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
