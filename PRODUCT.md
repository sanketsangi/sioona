# Sioona.ai — Product Brief

**Tagline:** Signals into Revenue  
**Engine (internal only):** SignalC1 — do not surface in UI

Overlay conversation intelligence for finance / high-volume chat teams. Sits on top of Intercom, Zendesk, WhatsApp, and similar tools. **Not** a chatbot replacement.

## Phase 1 MVP loop

Ingest export → detect → Shadow Mode Insights → SignalScore feedback → **pragmatic adapt** (taxonomy overrides) → eval / lift vs partner baseline.

Prove domain signal detection beats the customer’s current process with enough precision to earn trust.

**Domain adaptation (Phase 1):** taxonomy phrase/keyword/negative overrides from SignalScore rejects — not QLoRA / vLLM.

## In scope (built)

- Chat ingest: Sioona CSV/JSON, **Intercom JSON** export, **WhatsApp Business .txt** export
- Core signals: `lead`, `retention`, `upsell` (keyword/phrase heuristics + negation)
- Scoring, summaries, suggested actions (**display-only**)
- Insights dashboard + Shadow Mode review queue (filters, pagination, pending highlight)
- SignalScore feedback (`accept` / `reject` / `wrong_reason`) preserved across re-detect
- Pragmatic adapt: store taxonomy overrides from review feedback; re-detect
- Partner baseline + opportunity lift on Eval; conversation groundTruth labeling
- Eval: labeled + review precision, per-type P/R, pilot go/no-go (≥80% review precision target)
- Partner demo path: `/` Demo Home, one-click **Start Partner Demo**, Insights results strip, sample pack + [`PARTNER_DEMO.md`](./PARTNER_DEMO.md)

## Out of scope (unless explicitly asked)

- Autonomous actions, computer-use, agent swarm
- Auth0 / Neon / pgvector / vLLM / LangGraph / QLoRA scaffolds
- Live Intercom/WhatsApp webhooks
- Outcome-based billing, on-prem, chatbot replacement

## App

Code lives in [`web/`](./web/). Locked engineering context: [`.cursor/plans/sioona_product_context_6028d8b1.plan.md`](./.cursor/plans/sioona_product_context_6028d8b1.plan.md).

```bash
cd web && npm install && npm run dev
```

Open http://localhost:3000 → **Start Partner Demo**, or `/insights`.
