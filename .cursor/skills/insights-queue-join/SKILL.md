---
name: insights-queue-join
description: Join Neon Insights queues to JSON + overlay chats. Use when editing pending/Follow-up/Done join, hydrate overlay, or Shadow Mode queue empty/drift bugs.
---

# Insights queue join (Shadow Mode)

Pending SoT is FastAPI `GET …/signals/needs-review`. Follow-up / Done SoT is `GET …/signals`. Join in `web/src/lib/join-needs-review.ts`. Do not treat JSON `status===new` as queue SoT.

## Pending

1. Join Neon needs-review to JSON (`backendSignalId`, else conversation + type).
2. Keep unmatched Neon rows as `sig_neon_*` stubs.
3. Append JSON unreviewed rows Neon missed.
4. **Drop stubs whose conversation is missing** from JSON store **and** request-scoped overlay (`filterPendingWithChat`). Overlay chats via `fetchOverlayConversations` + `missingConversationIds` — include pending ids, not only reviewed.
5. Fill stub evidence / action from overlay (`applyChatEvidenceToSignals`).

Stale Partner Demo pack ids (Groww leftovers vs Zerodha JSON) stay hidden: no overlay chat → omit. `/tmp` wipe with Neon chats still present → stub + overlay → reviewable.

## Follow-up / Done

Unmatched Neon reviewed rows stay as stubs even without JSON. Overlay is request-scoped (do not write leftover packs into `store.json`).

## Do not

- Redesign Insights flows or invent signal chrome
- Expand `taxonomy.ts` / Adapt phrases
- Auth0, full Neon chat SoT, or FastAPI classify
- Show a pending card with no conversation
