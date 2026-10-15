# Sioona — Architecture (Ask / Architect SoT)

**Audience:** Ask mode + Architect planning. Living pilot status stays in [`PROJECT_STATE.md`](./PROJECT_STATE.md) — do not duplicate week scores / blockers here.  
**Last updated:** 2026-10-02

---

## 1. One-line system

**Sioona** overlays conversation intelligence (`lead` / `retention` / `upsell`) on existing chats. Shadow Mode humans review Detect output; **Signal Score** (FastAPI + Neon) is the pilot go/no-go metric. Not a chatbot. Engine name **SignalC1** — never in UI.

---

## 2. Process topology

**Local lifecycle addition (2026-10-15, CB-18):** `/lifecycle` → same-origin
`/api/lifecycle` BFF → always-enforced verified-admin FastAPI lifecycle routes →
tenant-scoped Postgres audit/hold/export/deletion state. Migration
`029_audit_lifecycle` follows `028_batch_cache`. Exports are private 24-hour
database artifacts; confirmed deletion fences canonical writes and workers
before bounded FK-safe checkpoints through `wipe_tenant_data`. Audit uses forced
RLS and INSERT/SELECT-only runtime grants; legal holds block manual expiry and
deletion. No scheduler, hosted migration or D10 integration is enabled. The
historical pilot topology below is preserved; current authorization and receipts
are in `docs/development/tasks/CB-18.md`.

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
| Auth (browser → web)                             | Signed httpOnly `sioona_session` cookie (HMAC-SHA256 with `AUTH_SECRET`, 12h). Carries email, role (`admin` / `reviewer` / `demo`) and tenant id. Not Auth0. |
| Auth (web → FastAPI)                             | `Authorization: Bearer $SIOONA_SERVICE_TOKEN` + `X-Tenant-Id`, sent only by the Next server. |

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
| `backend/alembic/versions/`             | `001`–`011` (head = `011_signal_urgency_value`)                |
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

**Displayed quotes:** Why This Fired, Eval Adapt, revenue-leak reports, and hydration show only spans reconstructed from `signal_evidence` (`message_id`, code-point `[start, end)`, `messages.content_sha256`). `valid` quotes jump to the returned message id. `stale` shows “Source changed — re-run detection”. `unresolved` shows “Re-run detection”. Overlay chats, JSON evidence, and saved drafts do not refill a quote the server could not reconstruct. Feedback, Acted, and draft decisions stay.  
**Dead / locked product chrome:** Action Mode outbound send (unlocked Action Mode is display-only Act queue only); Export / Create Campaign are unshipped and hidden (not overflow). **Shipped chrome:** Help / Guidance are local sidebar dialogs (Shadow Mode FAQ / pilot cadence — not Auth0, not a new route). `NavUser` shows the signed-in identity with one icon-only Sign out (a Sign in link on the public demo); no Account / Billing / Notifications.

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
3. **Pass 2** — `detect-llm.ts`, off unless `DETECT_LLM=1` + `GROQ_API_KEY`. By default (`DETECT_LLM_PRIMARY` not `0`) Groq classifies every chat with customer text and a grounded label replaces the heuristic hit; a failed or ungrounded call keeps the heuristic signal. `DETECT_LLM_PRIMARY=0` restores the original zero-signal-miss-only pass. A daily token cap switches the rest of that run to `DETECT_LLM_FALLBACK_MODEL`. Always fail-soft. **Detect v2 closed / hosted.**
4. **Persist** — replace signals preserving feedback → `syncPredictionsToBackend` upsert `(tenant, conversation, type)`.

Primary wedge type: **retention**.

---

## 6. Backend surface

`backend/app/main.py` — `/health` (open) + `/v1/*`. Every `/v1` route requires the service token (`Authorization: Bearer`) and a tenant-scoped route requires `X-Tenant-Id` matching the path. An unset token is open outside production; with `SIOONA_ENV=production` an unset token returns 503. `DELETE …/data` also requires `X-Sioona-Role: admin`. `/docs`, `/redoc`, `/openapi.json` are off when `SIOONA_ENV=production`.

| Area             | Endpoints (summary)                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Predictions      | `POST /v1/predictions`, `POST /v1/predictions/bulk`, `POST /v1/signals/{id}/outcome`                  |
| Supervised actions | `POST /v1/supervised-actions`, `GET …/supervised-actions` (decision only; nothing is sent)          |
| Taxonomy overrides | `GET`/`PUT …/taxonomy-overrides`                                                                    |
| Conversations    | bulk/upsert/list/prune/delete; `PATCH` ground_truth; list accepts repeat `conversation_id` (overlay) |
| Feedback / Acted | `POST /v1/signals/{id}/feedback`, `…/acted`                                                           |
| Queue / hydrate  | `GET …/signals/needs-review`, `GET …/signals`                                                         |
| Score            | `GET`/`POST …/signal-score` — `correct/reviewed`; keep-set + `date_from`/`date_to` on `reviewed_at`; POST body for large keep-sets; `signal_type` filters `by_signal_type` only |
| Pilot            | `GET`/`PUT …/pilot`                                                                                   |
| Wipe             | `DELETE …/data`                                                                                       |

Migrations: `001` predictions+feedback → `002` upsert unique → `003` chats/messages → `004` acted → `005` ground_truth → `006` pilot_settings → `007` `last_uploaded_file_name` → `008` index on feedback `(tenant_id, reviewed_at)` → `009` `supervised_action_decisions` → `010` outcome columns + `taxonomy_overrides` + Postgres FK → `011` urgency / `urgency_timeframe` / `mentioned_value_inr`.

**FK (Postgres only):** `010` adds `fk_signal_predictions_conversation` from `signal_predictions (tenant_id, conversation_id)` to `conversations (tenant_id, conversation_id)` with `ON DELETE RESTRICT`, after backfilling stub conversations for orphan predictions. The ORM models and the SQLite test database have no FK. Delete order matters: feedback → predictions → messages → conversations (`delete_conversation`, `prune_conversations_not_in`, `wipe_tenant_data` all do this).

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
- Tenancy is enforced by the web cookie, not by FastAPI. FastAPI trusts `X-Tenant-Id` from any holder of the service token, and is open to anyone who can reach it when the token is unset outside production.
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
