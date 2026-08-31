---
name: grok-first
description: Expand a short Architect job sketch with grok-first-pass and implement it in Agent mode.
---

# Grok first-pass (Agent)

The user message (or selection) is a **job sketch**. Follow `.cursor/skills/grok-first-pass/SKILL.md` immediately.

## Preflight

1. Read `.cursor/docs/PROJECT_STATE.md` and `.cursor/docs/architecture.md`.
2. If the sketch is missing, treat the rest of this message as the sketch. If they asked “rewrite only” / “show the prompt”, expand and stop — no code edits.

## Plan

Expand internally (Goal, Users, must-work interactions, visual language, stack, non-goals, Pass 1, Follow-ups). Fill gaps from PROJECT_STATE. Do not invent product scope. Do not reprint the expansion unless they asked to see it.

## Commands

1. Restate the goal in ≤3 sentences.
2. Implement. Do not ask clarifying questions unless two readings touch different systems.
3. Self-verify (tests, typecheck, or the UI path you can run).
4. Update PROJECT_STATE if heading / gates / blockers changed.

## Verification

- Existing files and patterns; no parallel data path or design language.
- Locked signal chrome if UI: `SignalStatus`, `SignalScoreChip`, `SignalTypeChip`, `SignalUser`.
- Non-goals from PROJECT_STATE held unless the user named them.

## Summary

Files changed, what is real vs stubbed, commands run, what to click.

## Next Steps

If this was a slice of `/next`, re-run `/next` only after PROJECT_STATE is updated or the user asks for the following item.
