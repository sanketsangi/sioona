# Decisions

Agents do not invent these. A row is approved only when it has a date and an approver. Until then the choice is proposed and the current files stay as they are.

## D0 — Authorize the foundations heading

Status: **approved**
Date: 2026-10-07
Approver: Sanket
Choice: approved as drafted

Approving D0 means all of the following, and nothing else:

- Freeze net-new feature work for one foundation sprint. The pilot loop keeps running: upload, Insights / Shadow Mode, Correct / Incorrect / Partially Correct, Mark Acted (display-only), outcome, Eval week-window keep-set.
- Apply the diffs below. Do not apply them before this row is approved.
- Leave the customer claim unchanged: human keep-set SignalScore ≥80% with n ≥ 5 on the Eval week window (`correct / reviewed`; partial and incorrect count in the denominator only).

CB-00 drafted the text. D0 was approved and its five After blocks applied on 2026-10-07 by explicit user instruction.

### `.cursor/docs/PROJECT_STATE.md` §0

Before (lines 14–18, prior to D0 approval):

```markdown
**GTM now:** Offer = single-tenant Insights + Shadow Mode + human-gated suggestions (no autonomy, no Auth0 sell). Approve Draft / Correct / Mark Acted = human gate only — Approve is decision-only (never sends); Acted is display-only (no outbound). Win = human keep-set SignalScore ≥80% on Eval (week window). Primary job = next unused weekly dump after Week-6 (Batch-02 still held-out). Residual gap = Week-7+ real partner export (Batch-02 held-out).

**Heading: 2-week Shadow Mode pilot.** Pilot win = human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 / vLLM / Action Mode outbound. Taxonomy still JSON.
```

After (approved and applied 2026-10-07):

```markdown
**GTM now:** Offer = single-tenant Insights + Shadow Mode + human-gated suggestions (no autonomy, no Auth0 sell). Approve Draft / Correct / Mark Acted = human gate only — Approve is decision-only (never sends); Acted is display-only (no outbound). Win = human keep-set SignalScore ≥80% on Eval (week window). Primary job = next unused weekly dump after Week-6 (Batch-02 still held-out). Residual gap = Week-7+ real partner export (Batch-02 held-out).

**Heading: foundation sprint, then the Shadow Mode pilot.** Pilot win is unchanged: human keep-set SignalScore ≥80% on Eval (week window) — **not** labeled P/R, **not** more Adapt phrase tuning / `taxonomy.ts` expansion. Net-new product features wait. Approved cards may add tenant membership, a model gateway, inference metering, evidence anchors, an eval gate, and canonical Postgres state. Nothing auto-sends.

**Decision (2026-08-15):** Eval go is the win. Zerodha `batch_01` Adapt **shipped** (`zerodha-batch01-overrides.ts`, Eval Apply, ingest `labels[]`→GT, sync chunk/90s timeout, Mark Acted after feedback). Resume weekly Insights reviews. Still not Auth0 as the identity vendor / vLLM / Action Mode outbound. Taxonomy base is still `taxonomy.ts`.
```

### `.cursor/docs/PROJECT_STATE.md` §3 governance sentence

Before (line 284, prior to D0 approval):

```markdown
Template hybrid (historical): heuristic P 0.92 / R 0.41 → hybrid P 0.93 / R 0.48. Do **not** move classify to FastAPI / add 429 retries / Create Groq project limits.
```

After (approved and applied 2026-10-07):

```markdown
Template hybrid (historical): heuristic P 0.92 / R 0.41 → hybrid P 0.93 / R 0.48. Moving classification onto a worker is CB-11. Further Groq retry and budget work is CB-07. Do not start either outside those cards. Do not create Groq project limits from an agent session.
```

The detect-mode paragraph above this sentence was a factual CB-00 edit and is already applied. This governance sentence was applied with D0 approval on 2026-10-07.

### `.cursor/docs/PROJECT_STATE.md` §7

Before (lines 369–379, prior to D0 approval):

```markdown
## 7. Later / do not start

*(Unchanged 2026-09-04 — review-friction pass did not start any of these.)*

- Auth0 / real tenant isolation
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp webhooks
- Action Mode outbound send (unlocked Action Mode = Insights Act queue only; prod locked)
- Export / Create Campaign (unshipped — hidden, not overflow)
- Outcome billing, computer-use, GPU
- Taxonomy expansion / more Adapt phrase chasing / classify-on-FastAPI / 429 retries / Groq project limits / taxonomy-on-Neon
```

After (approved and applied 2026-10-07):

```markdown
## 7. Later / do not start

*(D0, once approved, allows the foundation cards below. Everything else in this list stays blocked.)*

- Auth0 as a vendor (identity work is CB-03: Postgres users and memberships, not a new IdP, until D1 says otherwise)
- Real tenant isolation is in scope for CB-03 and CB-04 only
- vLLM, QLoRA, LangGraph, pgvector
- Live Intercom / WhatsApp: CB-16 only, after D10, still off unless `LIVE_INGEST=1`
- Action Mode outbound send (unlocked Action Mode = Insights Act queue only; prod locked). External send is CB-17 only, after D10
- Export / Create Campaign (unshipped — hidden, not overflow)
- Outcome billing, computer-use, GPU
- Taxonomy expansion / more Adapt phrase chasing / Groq project limits
- Classify-on-a-worker is CB-11. Budgets and 429 policy are CB-07. Taxonomy-on-Neon as source of truth stays blocked (overrides already persist in Neon)
```

### `.cursor/rules/architect.mdc` line 46

Before (prior to D0 approval):

```markdown
- Tenancy today = `X-Tenant-Id` (`tenant_demo`); do **not** start Auth0 / real multi-tenant isolation
```

After (approved and applied 2026-10-07):

```markdown
- Tenancy today = asserted `X-Tenant-Id` plus a shared service token. D0 allows CB-03 and CB-04 (staged Postgres users/memberships, then RLS). Do not start Auth0 unless D1 is revised. Do not treat a tenant header as authority
```

### `.cursor/rules/evaluation-metrics.mdc` line 78

Before (prior to D0 approval):

```markdown
- Do not implement full Precision/Recall pipelines unless explicitly asked
```

After (approved and applied 2026-10-07):

```markdown
- Labeled precision/recall is never the pilot go/no-go. D0 is the explicit ask for the CB-09 offline eval gate only. Do not add a general ML evaluation framework beyond that card
```

Line 77 stays: "Do not treat labeled P/R as the pilot go/no-go".
