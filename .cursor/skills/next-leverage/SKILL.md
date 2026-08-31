---
name: next-leverage
description: Rank the next highest-leverage Sioona tasks from PROJECT_STATE and architecture. Use when the user asks what to do next, highest leverage, follow PROJECT_STATE, /next, or next steps for the Shadow Mode pilot.
---

# Next highest-leverage work

Living heading is `.cursor/docs/PROJECT_STATE.md` §0 — always re-read it. Stack map: `.cursor/docs/architecture.md`. Do not rank from memory or from this skill’s example snapshot.

Agent implement path: `.cursor/commands/next.md` (`/next`). Ask / planning: `.cursor/rules/architect.mdc` (sketches only). Execution expands via `grok-first-pass`.

## Rank

Score work by whether it moves **human keep-set SignalScore ≥80% on the current Eval week window**. That is the pilot win — not labeled P/R, not Adapt phrase packs, not more chrome.

Order, first match wins:

1. **Pilot ops (highest).** Unused weekly dump exists → mid-week upsert `replaced=false` → ≥5 Corrects + **Mark Acted** → Eval keep-set ≥0.80. If PROJECT_STATE already logged skip / no unused dump, do **not** invent an ingest. Never ingest held-out Batch-02 unless the user explicitly asked for Upload Confirm Ingest.
2. **Reviews on the live queue.** Pending Neon `needs-review` in the current `?scoreFrom=` window. Human Insights reviews fill Insufficient Data without a new dump. Ops, not a code PR.
3. **Unblock code.** Only if PROJECT_STATE, a failing test, or a hosted bug shows ingest / queue join / empty-window Insufficient Data / dual-write / hydrate / Confirm Replace / Confirm Ingest is broken. Touch the smallest seam. Signal chrome stays locked.
4. **Stop.** If 1–3 are ops-blocked or already shipped, **do not** start leftover chrome, taxonomy expansion, Adapt phrase tuning, Auth0, vLLM, pgvector, Action Mode outbound, FastAPI classify, or Groq rate-limit scaffolding.

## Sources (read, don’t copy)

| File | Use |
| --- | --- |
| `.cursor/docs/PROJECT_STATE.md` | Heading, this-week ops, last code pass, do-not-start, hosted gates |
| `.cursor/docs/architecture.md` | Topology, SoT table, fragile seams, non-goals |
| `.cursor/rules/architect.mdc` | Sketch format |
| `.cursor/skills/grok-first-pass/SKILL.md` | Agent expansion + execute |
| `.cursor/skills/insights-queue-join/SKILL.md` | Queue join if the task touches Insights pending / Follow-up / Done |

## Output

**Ask / “what’s next” (no `/next`):**

1. Short analysis (≤5 lines): heading, whether a dump/queue exists, whether code is actually blocked.
2. Ranked list. Label each row **ops** or **code**. One line of why.
3. If a **code** item exists: one Architect paste block (≤6 lines) for that item only.

**`/next` in Agent:** follow `.cursor/commands/next.md`. Rank first. Implement only the top **code** item. If none, stop after the ranked list — do not invent a chrome pass.

## Architect paste block

One line each, including the closing line:

```
Goal: …
Touch: … (areas or 2–3 paths)
Constraints: … (one short line; never restack PROJECT_STATE non-goals)
Done: …
Attach grok-first-pass. Expand internally; do not dump the full prompt. Implement. Do not ask clarifying questions unless two readings touch different systems.
```

Do not include Users, Visual language, Pass 1 essay, Follow-ups, long file lists.

## Example ranking (re-derive — snapshot 2026-08-31)

Heading: 2-week Shadow Mode pilot. Next unused dump **skipped** (no Week-5; Batch-02 held-out). Eval `?scoreFrom=2026-08-31T10:41:38.000Z` → n=0 / Insufficient Data. Ingest weekly-pack **shipped** (`9187c5b` / #79). Insights polish + Eval first-fold shipped.

1. **Ops** — When a Week-5-or-later unused dump exists: mid-week `replaced=false` (week5-style names already upsert). Not Batch-02, not week3 re-ingest.
2. **Ops** — Human Insights reviews on the current Neon pending queue (≥5 Correct + Acted) to fill the empty week window. Do not wait for Week-5 if pending rows exist.
3. **Code** — None required. Do not ingest Batch-02, do not Partner Demo wipe, do not Adapt, do not further design-language work.
