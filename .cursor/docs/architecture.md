# Sioona — Architecture (Ask / Architect SoT)

**Audience:** Ask mode + Architect planning. Living pilot status stays in [`PROJECT_STATE.md`](./PROJECT_STATE.md) — do not duplicate week scores / blockers here.  
**Last updated:** 2026-10-01

---

## 1. One-line system

**Sioona** overlays conversation intelligence (`lead` / `retention` / `upsell`) on existing chats. Shadow Mode humans review Detect output; **Signal Score** (FastAPI + Neon) is the pilot go/no-go metric. Not a chatbot. Engine name **SignalC1** — never in UI.

---

## 2. Process topology

```text
Cold open / Reset (Groww testing.json)
Partner Demo (wipe Neon → Zerodha Batch-02 JSON)
Partner export (Upload)
        │
        ▼
  Next.js BFF (web/) ── ingest / detect / store mutations
        │
        ├─► JSON store (per-tenant file; demo path still store.json)
        │         ▲ cold-start hydrate when the file is missing
        │         │
        └─► FastAPI (backend/) + Neon  (Bearer service token from the web server)
              conversations / messages / ground_truth
              signal_predictions + feedback + acted + outcome
              taxonomy_overrides
              pilot_settings
              needs-review queue + Signal Score + revenue totals
```

| Concern                                          | Source of truth                                            |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Chats (UI when the tenant file exists)           | JSON `store.ts`; Neon hydrate when the file is missing     |
| Pending Insights queue                           | Neon `GET …/signals/needs-review` → `join-needs-review.ts` |
| Follow-up / Done                                 | Neon `GET …/signals` (`correct` ¬acted / `acted`) + join   |
| Signal Score / keep-set reviews                  | FastAPI + Neon (`reviewed_at` week window)                 |
| Taxonomy overrides                               | Neon `taxonomy_overrides` (JSON mirror for the open file)  |
| Taxonomy base phrases                            | `web/src/lib/taxonomy.ts` (never Neon)                     |
| Auth                                             | Signed session cookie + `SIOONA_SERVICE_TOKEN`. Not Auth0. |

Hosted: Vercel `sioona-demo.vercel.app` (`web/`, ephemeral `/tmp`) + Render `sioona-api` + Neon `sioona`. Hydrate + Adapt union + pilot restore survive wipe. Platform SSR also overlays `store.pilot` from Neon (heal stale `/tmp` after Partner Demo / cross-instance `set_baseline`). Partner Demo restores a prior partner baseline after wipe (cold-demo 4 only when none exists).

---

## 3. Repo map

| Path                                    | Role                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `web/src/app/`                          | App Router hub `/?view=` + BFF `api/*`                         |
| `web/src/components/`                   | UI (Insights / Upload / Eval / Taxonomy); locked signal chrome |
| `web/src/lib/`                          | Domain logic (prefer edits here)                               |
| `web/data/`                             | Runtime store + samples — **never commit `store.json`**        |
| `backend/app/`                          | FastAPI routes, models, services                               |
| `backend/alembic/versions/`             | `001`–`010` (head = outcomes, taxonomy overrides, prediction FK) |
| `.cursor/docs/PROJECT_STATE.md`         | Heading, gates, do-not-start                                   |
| `.cursor/rules/sioona-architecture.mdc` | Always-on short stack rules                                    |

Alias: `@/*` → `web/src/*`.

---

## 4. Web surfaces

Single dynamic page (`web/src/app/page.tsx`); pretty paths redirect.

| View     | URL               | Purpose                                                          |
| -------- | ----------------- | ---------------------------------------------------------------- |
| Insights | `/?view=insights` | Shadow Mode pending + Needs Follow-Up (`correct` ¬acted) + Done (`acted`). Omitted status lands on Pending (`status=new`) when Follow-up is empty and Pending > 0. Review body pairs Conversation (full transcript chat well + See Conversation drawer) with stacked Suggested Next Action / Why This Fired; Why quotes jump to the matching bubble. Last Pending Correct opens Follow-up preview with rail **Mark as Acted** primary (A / Enter walk; header undo only after Acted). Unlocked Action Mode: `/?mode=action` (Follow-up Act queue when Follow-up has rows; same pending landing when Follow-up empty; Suggested Next Action + Mark Acted; no outbound). Locked prod strips `mode=action`. |
| Upload   | `/?view=upload`   | Ingest + Partner Demo (Zerodha wipe-replace) / Reset (Groww) |
| Eval     | `/?view=eval`     | Keep-set Signal Score, baseline, Adapt / labeled / export panels |
| Taxonomy | `/?view=taxonomy` | Read-only base taxonomy                                          |

**Locked chrome (do not reinvent):** `SignalStatus`, `SignalScoreChip`, `SignalTypeChip`, `SignalUser`.  
**Dead / locked product chrome:** Action Mode outbound send (unlocked Action Mode is display-only Act queue only); Export / Create Campaign are unshipped and hidden (not overflow). **Shipped chrome:** Help / Guidance are local sidebar dialogs (Shadow Mode FAQ / pilot cadence — not Auth0, not a new route). `NavUser` is identity-only (no Account / Billing / Notifications / Log Out).

### BFF routes (high level)

- `POST /api/ingest` — parse → merge/replace → hybrid detect → dual-write
- `POST /api/detect` — re-detect preserving feedback
- `POST /api/signals/[id]/feedback` — FastAPI then JSON mirror (+ stale-UUID recovery)
- `POST /api/signals/[id]/acted` — Mark Acted (no outbound; same stale-id recovery as feedback)
- `GET /api/eval` — pilot metrics + backend score overlay (`scoreFrom`)
- `POST /api/store` — reset / **partner_demo (NDJSON pipeline events)** / baseline / Adapt applies

---

## 5. Detect pipeline

1. **Ingest** — CSV/JSON / Intercom / WhatsApp → PII redact → Day-1 replace or mid-week `externalId` upsert (`replaced=false`).
2. **Pass 1** — `detect.ts` heuristics on customer messages; effective taxonomy = base ⊕ overrides; threshold ~0.35; structural intent patterns + fraud/complaint suppress on lead/upsell (`detect-patterns.ts`). Precision-first: ticket/chat/login/document ops and bare competitor-name mentions do not fire; ≥2 keyword-only rule.
3. **Pass 2** — `detect-llm.ts` Groq only on **zero-signal** misses (`DETECT_LLM=1` + `GROQ_API_KEY`); never overrides hits; fail-soft. **Detect v2 closed / hosted.**
4. **Persist** — replace signals preserving feedback → `syncPredictionsToBackend` upsert `(tenant, conversation, type)`.

Primary wedge type: **retention**.

---

## 6. Backend surface

`backend/app/main.py` — `/health` + `/v1/*` requiring `X-Tenant-Id`.

| Area             | Endpoints (summary)                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Predictions      | `POST /v1/predictions`                                                                                |
| Conversations    | bulk/upsert/list/prune/delete; `PATCH` ground_truth; list accepts repeat `conversation_id` (overlay) |
| Feedback / Acted | `POST /v1/signals/{id}/feedback`, `…/acted`                                                           |
| Queue / hydrate  | `GET …/signals/needs-review`, `GET …/signals`                                                         |
| Score            | `GET`/`POST …/signal-score` — `correct/reviewed`; keep-set + `date_from`/`date_to` on `reviewed_at`; POST body for large keep-sets; `signal_type` filters `by_signal_type` only |
| Pilot            | `GET`/`PUT …/pilot`                                                                                   |
| Wipe             | `DELETE …/data`                                                                                       |

Migrations: `001` predictions+feedback → `002` upsert unique → `003` chats/messages → `004` acted → `005` ground_truth → `006` pilot_settings.

**No FK** from predictions → conversations (string ids); prune/wipe must cascade consciously.

---

## 7. Pilot math (product contract)

- **Win:** human keep-set SignalScore ≥80% on Eval **week window** — not labeled Detect P/R.
- Formula: `correct / reviewed` (incorrect + partially_correct in denominator only). Only `lead` / `retention` / `upsell` tally. Eval Go/Hold uses those counts (integer ≥4/5), not a stale `signal_score` float.
- Empty window → Reviewed 0 / **Insufficient Data** — never a labeled Go.
- Cadence helpers: `web/src/lib/pilot-cadence.ts` (≥5 reviews, mid-week upload, baseline, go/no-go). Insights empty queue + Upload/Eval — not the header bell (exceptions only). After share-out: **Mark Acted** on Correct in Needs Follow-Up (`status=followup`; display-only, no outbound; advances to the next Correct panel) then **next week’s mid-week upsert** (`nextweek`) — not a dead end.
- Adapt = taxonomy **overrides** for heuristics — stop phrase chasing unless Eval proves a gap.

---

## 8. Fragile seams (plan around these)

- Dual SoT: JSON can drift ahead of Neon if dual-write fails (`syncFailed` banners).
- Vercel `/tmp` ephemeral — rely on hydrate, not local files.
- Render free cold starts (~15m) → queue/score timeouts. Insights/Eval auto-wake `/api/backend-health` once, then refresh (cooldown; partner-safe copy).
- Soft tenancy (spoofable header).
- Neon **pending / Follow-up / Done** stubs without a JSON signal may join, but queue cards require a keep-set chat (`filterPendingWithChat`). Request-scoped overlay (`GET …/conversations?conversation_id=`) is **wipe-recovery only** (`shouldOverlayKeepSetChats`: empty JSON, not `replaced=1`) — never pull leftover Sample/Partner Demo chats into an active keep-set. Stubs with **no** store or allowed overlay chat are dropped.
- Eval keep-set SignalScore: when JSON has chats, omit `conversation_id` so Neon `conversations` fill hydrate-lag holes (hosted n matches in-window Corrects). `?replaced=1` and empty JSON still pass an explicit keep-set (JSON-only / overlay stubs / `[]` → 0). Large keep-sets POST in the body. Orphan leftover predictions stay out (not in keep-set chats). Overlay stays request-scoped (not written to JSON).
- Message upsert deletes omitted messages: a non-empty payload keeps its message ids and removes leftovers on that conversation. An empty `messages` list is metadata-only and does not delete.

---

## 9. Explicit non-goals (unless named)

Auth0, pgvector, vLLM / QLoRA / LangGraph, live webhooks, Action Mode outbound send, FastAPI classify, Groq rate-limit scaffolding, taxonomy-on-Neon, taxonomy expansion to fake recall, more Adapt phrase packs.

---

## 10. How Ask / Architect should use this

1. Read **this file** for stack shape and edit loci.
2. Read **`PROJECT_STATE.md`** for current heading, gates, and “do not start.”
3. Prefer the next step from `PROJECT_STATE` when the user says “next.”
4. Hand off short Goal / Touch / Constraints / Done sketches per `architect.mdc` — do not implement in Ask mode.
5. Agent execution expands via `grok-first-pass.mdc`.
