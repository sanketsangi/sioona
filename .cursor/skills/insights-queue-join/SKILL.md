---
name: insights-queue-join
description: Join Neon Insights queues to JSON + overlay chats. Use when editing pending/Follow-up/Done join, hydrate overlay, or Shadow Mode queue empty/drift bugs.
---

# Insights queue join (Shadow Mode)

Pending SoT is FastAPI `GET …/signals/needs-review`. Follow-up / Done SoT is `GET …/signals`. Join in `web/src/lib/join-needs-review.ts`. Do not treat JSON `status===new` as queue SoT.

## Keep-set isolation (one corpus at a time)

Insights shows only the **active JSON keep-set** (Sample, Partner Demo, or replace-upload). Never mix leftover Neon rows from another pack into the queue.

1. Gate overlay with `shouldOverlayKeepSetChats`: overlay **only** when JSON conversations are empty (wipe recovery) and not `replaced=1`.
2. When JSON already has chats, skip overlay even if Neon still has other-pack predictions (deferred wipe/prune race after Sample ↔ Partner Demo / replace-upload).
3. Always `filterPendingWithChat` on **pending and reviewed** (Follow-up / Done) against store ∪ allowed overlay — drop every row whose conversation is not in the keep-set (stubs and JSON).
4. Mid-week weekly upsert (`replaced=false`) is unchanged: JSON keeps prior keep-set chats; no Detect/Adapt/Auth0 changes.

## Pending

1. Join Neon needs-review to JSON (`backendSignalId`, else conversation + type).
2. Keep unmatched Neon rows as `sig_neon_*` stubs.
3. Append JSON unreviewed rows Neon missed. Exclude locals already reviewed in `GET …/signals` (`backendSignalId` or conversation+type) so stale `/tmp` JSON cannot re-open them.
4. **Drop any row whose conversation is missing** from JSON store **and** request-scoped overlay (`filterPendingWithChat`). Overlay only when JSON is empty — include pending ids, not only reviewed. Overlay `GET`s only those ids (`conversation_id` query), not the full tenant list. Insights and Eval both fetch overlay (when gated on) so wipe-recovery SignalScore includes stub chats.
5. When JSON already has chats, `fetchNeedsReview` / `fetchTenantSignals` send those conversation ids. Needs-review stays capped at 100 per request and walks `offset` until a short page, so Pending larger than 100 still reaches the existing pager. Omit the ids only for wipe recovery (empty JSON).
6. Fill stub evidence / action from overlay (`applyChatEvidenceToSignals`).

Stale Partner Demo pack ids (Groww leftovers vs Zerodha JSON) stay hidden: no overlay when JSON has chats → omit. `/tmp` wipe with Neon chats still present → stub + overlay → reviewable.

## Follow-up / Done

Unmatched Neon reviewed rows may join as stubs, but **must** pass `filterPendingWithChat` against the keep-set. Overlay is request-scoped and wipe-only (do not write leftover packs into `store.json`).

## Eval keep-set

Week-window SignalScore keep-set is JSON store conversation ids ∪ overlay ids **only when overlay is allowed** (`keepSetConversationIds`). Stub reviews after `/tmp` wipe count toward go. Still do not persist overlay into `store.json`.

## Do not

- Redesign Insights flows or invent signal chrome
- Expand `taxonomy.ts` / Adapt phrases
- Auth0, full Neon chat SoT, or FastAPI classify
- Show a pending / Follow-up / Done card with no keep-set conversation
- Overlay leftover Sample/Partner Demo chats while JSON already holds another keep-set
