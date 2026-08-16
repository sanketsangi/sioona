# Sioona.ai — Product Brief

**Tagline:** Signals into Revenue  
**Engine (internal only):** SignalC1 — do not surface in UI

Overlay conversation intelligence for finance / high-volume chat teams. Sits on top of Intercom, Zendesk, WhatsApp, and similar tools. **Not** a chatbot replacement.

**Now:** 2-week Shadow Mode pilot — win = keep-set SignalScore ≥80% on Eval (week window). Phase 1 loop is **largely built / hosted**. Daily SoT: [`.cursor/docs/PROJECT_STATE.md`](./.cursor/docs/PROJECT_STATE.md). North star: [`.cursor/plans/sioona_product_context.md`](./.cursor/plans/sioona_product_context.md).

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
- Hosted: Vercel app + Render FastAPI + Neon (predictions, feedback, Acted, dual-written chats, ground truth, pilot settings + hydrate)

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
