# Sioona — Architecture (Ask / Architect SoT)

**Audience:** Ask mode + Architect planning. Living pilot status stays in [`PROJECT_STATE.md`](./PROJECT_STATE.md) — do not duplicate week scores / blockers here.  
**Last updated:** 2026-08-19

---

## 1. One-line system

**Sioona** overlays conversation intelligence (`lead` / `retention` / `upsell`) on existing chats. Shadow Mode humans review Detect output; **Signal Score** (FastAPI + Neon) is the pilot go/no-go metric. Not a chatbot. Engine name **SignalC1** — never in UI.

---

## 2. Process topology

```text
Partner export / Partner Demo
        │
        ▼
  Next.js BFF (web/) ── ingest / detect / store mutations
        │
        ├─► JSON store (chats, taxonomyOverrides, local signals)
        │         ▲ cold-start hydrate when /tmp store missing
        │         │
        └─► FastAPI (backend/) + Neon
              conversations / messages / ground_truth
              signal_predictions + feedback + acted
              pilot_settings
              needs-review queue + Signal Score
```

| Concern                                          | Source of truth                                            |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Chats + taxonomy overrides (UI when file exists) | JSON `store.ts`                                            |
| Pending Insights queue                           | Neon `GET …/signals/needs-review` → `join-needs-review.ts` |
| Signal Score / keep-set reviews                  | FastAPI + Neon (`reviewed_at` week window)                 |
| Taxonomy base phrases                            | `web/src/lib/taxonomy.ts` (never Neon)                     |
| Auth                                             | Soft header `X-Tenant-Id` (`tenant_demo`) — not Auth0      |

Hosted: Vercel `sioona-demo.vercel.app` (`web/`, ephemeral `/tmp`) + Render `sioona-api` + Neon `sioona`. Hydrate + Adapt union + pilot restore survive wipe.

---

## 3. Repo map

| Path                                    | Role                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `web/src/app/`                          | App Router hub `/?view=` + BFF `api/*`                         |
| `web/src/components/`                   | UI (Insights / Upload / Eval / Taxonomy); locked signal chrome |
| `web/src/lib/`                          | Domain logic (prefer edits here)                               |
| `web/data/`                             | Runtime store + samples — **never commit `store.json`**        |
| `backend/app/`                          | FastAPI routes, models, services                               |
| `backend/alembic/versions/`             | `001`–`006` (head = pilot settings)                            |
| `.cursor/docs/PROJECT_STATE.md`         | Heading, gates, do-not-start                                   |
| `.cursor/rules/sioona-architecture.mdc` | Always-on short stack rules                                    |

Alias: `@/*` → `web/src/*`.

---

## 4. Web surfaces

Single dynamic page (`web/src/app/page.tsx`); pretty paths redirect.

| View     | URL               | Purpose                                                          |
| -------- | ----------------- | ---------------------------------------------------------------- |
| Insights | `/?view=insights` | Shadow Mode queue + review + Mark Acted                          |
| Upload   | `/?view=upload`   | Ingest + Partner Demo / Reset                                    |
| Eval     | `/?view=eval`     | Keep-set Signal Score, baseline, Adapt / labeled / export panels |
| Taxonomy | `/?view=taxonomy` | Read-only base taxonomy                                          |

**Locked chrome (do not reinvent):** `SignalStatus`, `SignalScoreChip`, `SignalTypeChip`, `SignalUser`.  
**Dead / locked product chrome:** Action Mode outbound; Export / Create Campaign are unshipped and hidden (not overflow); Help / Guidance disabled; `NavUser` is identity-only (no Auth0 account actions).

### BFF routes (high level)

- `POST /api/ingest` — parse → merge/replace → hybrid detect → dual-write
- `POST /api/detect` — re-detect preserving feedback
- `POST /api/signals/[id]/feedback` — FastAPI then JSON mirror (+ stale-UUID recovery)
- `POST /api/signals/[id]/acted` — Mark Acted (no outbound)
- `GET /api/eval` — pilot metrics + backend score overlay (`scoreFrom`)
- `POST /api/store` — reset / partner_demo / baseline / Adapt applies

---

## 5. Detect pipeline

1. **Ingest** — CSV/JSON / Intercom / WhatsApp → PII redact → Day-1 replace or mid-week `externalId` upsert (`replaced=false`).
2. **Pass 1** — `detect.ts` heuristics on customer messages; effective taxonomy = base ⊕ overrides; threshold ~0.35.
3. **Pass 2** — `detect-llm.ts` Groq only on **zero-signal** misses (`DETECT_LLM=1` + `GROQ_API_KEY`); never overrides hits; fail-soft. **Detect v2 closed / hosted.**
4. **Persist** — replace signals preserving feedback → `syncPredictionsToBackend` upsert `(tenant, conversation, type)`.

Primary wedge type: **retention**.

---

## 6. Backend surface

`backend/app/main.py` — `/health` + `/v1/*` requiring `X-Tenant-Id`.

| Area             | Endpoints (summary)                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Predictions      | `POST /v1/predictions`                                                                                |
| Conversations    | bulk/upsert/list/prune/delete; `PATCH` ground_truth                                                   |
| Feedback / Acted | `POST /v1/signals/{id}/feedback`, `…/acted`                                                           |
| Queue / hydrate  | `GET …/signals/needs-review`, `GET …/signals`                                                         |
| Score            | `GET …/signal-score` — `correct/reviewed`; optional keep-set + `date_from`/`date_to` on `reviewed_at` |
| Pilot            | `GET`/`PUT …/pilot`                                                                                   |
| Wipe             | `DELETE …/data`                                                                                       |

Migrations: `001` predictions+feedback → `002` upsert unique → `003` chats/messages → `004` acted → `005` ground_truth → `006` pilot_settings.

**No FK** from predictions → conversations (string ids); prune/wipe must cascade consciously.

---

## 7. Pilot math (product contract)

- **Win:** human keep-set SignalScore ≥80% on Eval **week window** — not labeled Detect P/R.
- Formula: `correct / reviewed` (incorrect + partially_correct in denominator only).
- Empty window → Reviewed 0 / **Insufficient Data** — never a labeled Go.
- Cadence helpers: `web/src/lib/pilot-cadence.ts` (≥5 reviews, mid-week upload, baseline, go/no-go). Insights empty queue + Upload/Eval — not the header bell (exceptions only). After share-out: **Mark Acted** on Correct (display-only, no outbound; advances to the next Correct panel) then **next week’s mid-week upsert** (`nextweek`) — not a dead end.
- Adapt = taxonomy **overrides** for heuristics — stop phrase chasing unless Eval proves a gap.

---

## 8. Fragile seams (plan around these)

- Dual SoT: JSON can drift ahead of Neon if dual-write fails (`syncFailed` banners).
- Vercel `/tmp` ephemeral — rely on hydrate, not local files.
- Render free cold starts (~15m) → queue/score timeouts.
- Soft tenancy (spoofable header).
- Neon queue rows without local chat are dropped at join (stale demo ids).
- Message upsert does not delete omitted messages until prune/wipe.

---

## 9. Explicit non-goals (unless named)

Auth0, pgvector, vLLM / QLoRA / LangGraph, live webhooks, Action Mode outbound, FastAPI classify, Groq rate-limit scaffolding, taxonomy-on-Neon, taxonomy expansion to fake recall, more Adapt phrase packs.

---

## 10. How Ask / Architect should use this

1. Read **this file** for stack shape and edit loci.
2. Read **`PROJECT_STATE.md`** for current heading, gates, and “do not start.”
3. Prefer the next step from `PROJECT_STATE` when the user says “next.”
4. Hand off short Goal / Touch / Constraints / Done sketches per `architect.mdc` — do not implement in Ask mode.
5. Agent execution expands via `grok-first-pass.mdc`.
