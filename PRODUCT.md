# Sioona.ai — Product Brief

**Tagline:** Signals into Revenue  
**Engine (internal only):** SignalC1 — do not surface in UI

Overlay conversation intelligence for finance / high-volume chat teams. Sits on top of Intercom, Zendesk, WhatsApp, and similar tools. **Not** a chatbot replacement.

**Now:** 2-week Shadow Mode pilot — win = keep-set SignalScore ≥80% on Eval (week window). Phase 1 loop is **largely built / hosted**. Daily SoT: [`.cursor/docs/PROJECT_STATE.md`](./.cursor/docs/PROJECT_STATE.md). North star: [`.cursor/plans/sioona_product_context.md`](./.cursor/plans/sioona_product_context.md). Pilot ask + redaction + outreach: [`PARTNER_DEMO.md`](./PARTNER_DEMO.md).

**Code status (2026-10-15):** `main` tip `7506fb4e` includes merged CB-18
(#178, audit/retention/export/deletion; migration `029_audit_lifecycle`)
and CB-19 (#179, reproducible infrastructure and local recovery/launch drills).
The local inference-control audit reconciliation advances the schema head to
`030_inference_control_audit`; apply it before deploying the audited handlers.
Unified Render hosting is declared in `render.yaml`, with the app at
`https://sioona-web.onrender.com`; Vercel deployment is retired. Merged code does
not establish hosted launch acceptance. Blueprint application, hosted migrations,
live deletion, worker/scheduler activation and D10 integrations require separate
approval; existing CB-03/CB-10 hosted gates and human-only decisions remain.

## Sell today (GTM)

**One-liner offer:** Send one anonymized Intercom / WhatsApp export; we run Shadow Mode and show keep-set SignalScore + opportunity lift vs your baseline — before any integration.

**Vertical wedge:** India mid-market broking / fintech CS on Intercom or WhatsApp. Primary Detect signal = **retention** (churn / close / switch / pause intent in existing chats). Lead and upsell stay in taxonomy; do not lead with “AI agent” or chatbot replacement.

**What the partner gets (2 weeks):**
1. Day 1 — upload redacted export → Insights pending queue
2. Mid-week — weekly upsert (`replaced=false`) → ≥5 human Correct reviews + Mark Acted (display-only)
3. Share-out — Eval week-window keep-set SignalScore; **go = ≥80%** (n ≥ 5). Lift vs the baseline they set (“how many opportunities do you find today?”)

**Honest gate:** Approve Draft / Correct / Mark Acted are human decisions only. **Nothing sends.** Partner runs follow-up outside Sioona (email, CRM, phone). Acted is display-only cadence, not outbound.

**Eval go gate (customer claim):** keep-set SignalScore on the Eval week window ≥80% with enough reviews — **not** labeled fixture P/R, **not** Adapt CLI scores, **not** empty-window “Insufficient Data.”

### Do not sell

- Auth0 / multi-tenant SSO, live Intercom/WhatsApp webhooks, CRM APIs
- Action Mode outbound send, autonomous agents, computer-use / swarm
- Chatbot replacement, Gong replacement, outcome-based fees
- “100% precision” from showcase packs; labeled P/R as the pilot win
- On-prem, vLLM / QLoRA / LangGraph as near-term deliverables

WTP band to **validate** (not pitch as fact): ≈ ₹25k–90k/mo Insights. GTM goal = 2–3 committed pilots — sales goal, not a precision substitute. Full pilot one-pager, redaction checklist, and LinkedIn cadence → [`PARTNER_DEMO.md`](./PARTNER_DEMO.md).

## Phase 1 loop (largely built)

Ingest export → detect → Shadow Mode Insights → SignalScore feedback → **pragmatic adapt** (taxonomy overrides) → Eval keep-set go/no-go vs partner baseline.

Prove domain signal detection beats the customer’s current process with enough precision to earn trust.

**Adapt:** taxonomy phrase/keyword/negative overrides from SignalScore feedback — not QLoRA / vLLM / taxonomy expansion.

## In scope (shipped for pilot)

- Chat ingest: Sioona CSV/JSON, **Intercom JSON** export, **WhatsApp Business .txt** export
- Core signals: `lead`, `retention`, `upsell` (keyword/phrase heuristics + negation; primary Detect wedge: **retention**)
- Scoring, summaries, suggested actions (**display-only**)
- Insights dashboard + Shadow Mode review queue (filters, pagination, pending highlight)
- SignalScore feedback (`correct` / `incorrect` / `partially_correct`) via FastAPI + Neon; JSON mirror when needed
- Pragmatic adapt: store taxonomy overrides from review feedback; re-detect
- Partner baseline + opportunity lift on Eval; conversation groundTruth labeling
- Eval: keep-set SignalScore on week window (go ≥80%); labeled P/R is pack/CLI only — not the customer claim
- Partner demo path: `/` Demo Home, one-click **Start Partner Demo**, sample pack + [`PARTNER_DEMO.md`](./PARTNER_DEMO.md)
- Hosting target: unified Render (`render.yaml`; `sioona-web.onrender.com` app, separate marketing site and FastAPI; worker/recovery activation gated) + Neon (predictions, feedback, Acted, dual-written chats, ground truth, pilot settings + hydrate)

## Out of scope (unless explicitly asked)

- Autonomous actions / Action Mode outbound, computer-use, agent swarm
- Auth0 / pgvector / vLLM / LangGraph / QLoRA scaffolds
- Live Intercom/WhatsApp webhooks
- Outcome-based billing, on-prem, chatbot replacement
- Taxonomy expansion / more Adapt phrase tuning to chase recall

## App

Code: [`web/`](./web/) + [`backend/`](./backend/). Construction brief: [`.cursor/plans/sioona_product_context.md`](./.cursor/plans/sioona_product_context.md).

```bash
# Backend (Signal Score SoT)
cd backend && uvicorn app.main:app --reload --port 8000

# Web
cd web && npm install && npm run dev
```

Open http://localhost:3000 → **Start Partner Demo**, or `/insights`. Full dual-process setup: [`README.md`](./README.md).
