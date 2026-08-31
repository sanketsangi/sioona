---
name: next
description: Rank next highest-leverage Sioona work from PROJECT_STATE and implement the first code-sized step in Agent mode via grok-first-pass.
---

# Next (Agent)

You are in **Agent mode**. Rank, then implement at most one code-sized step. Do not stay in planning-only mode when a real code item exists.

Follow `.cursor/skills/next-leverage/SKILL.md` for ranking. Expand the chosen sketch via `.cursor/skills/grok-first-pass/SKILL.md`. Do not dump the full expansion unless the user asked to see it.

## Preflight

1. Read `.cursor/docs/PROJECT_STATE.md` §0 (heading, this-week ops, last code pass, do-not-start).
2. Read `.cursor/docs/architecture.md` seams + non-goals if the candidate touches stack / SoT.
3. If the task would touch Insights pending / Follow-up / Done join, read `.cursor/skills/insights-queue-join/SKILL.md`.
4. Do not start anything in PROJECT_STATE “Do not” / architecture §9 unless the user named it in this message.

## Plan

Rank with `next-leverage` (ops vs code). State the top item in ≤3 sentences.

- Top item is **ops** (dump ingest, human reviews, skip log) → print the playbook. Do **not** ingest Batch-02, fake a dump, or Partner Demo wipe. Then check for a real **code** unblocker (failing test, hosted bug, broken ingest/queue/eval gate). If none, **stop**.
- Top item is **code** that unblocks keep-set / ingest / queue / empty-window honesty → implement that one item only.

Never use leftover chrome, taxonomy expansion, or Adapt phrase tuning as filler work.

## Commands

1. Internally write the Architect sketch (Goal / Touch / Constraints / Done + grok-first closing line).
2. Expand with grok-first-pass. Lead with a short restatement of the goal. Implement.
3. Tests: `cd web && npm test` and/or `cd backend && .venv/bin/python -m pytest` for touched layers. Report what was not run.
4. Update `.cursor/docs/PROJECT_STATE.md` only if heading, gates, or blockers changed.

## Verification

- Rank used current PROJECT_STATE, not the skill’s dated example snapshot.
- At most one code-sized change set.
- Locked signal chrome reused if UI changed.
- No `*.local.csv` / PII / `store.json` committed.

## Summary

```
## Result
- **Rank**: ops vs code, top item
- **Did**: implemented | ops-only (stopped)
- **Files / commands**: …
- **Real vs stubbed**: …
```

## Next Steps

- If ops-blocked on a dump: wait for Week-N unused pack; then `/next` again (ingest path already gated).
- If ops-blocked on reviews: Insights pending → Correct → Mark Acted → Eval `?scoreFrom=`.
- If code shipped: deploy gate in `web/DEPLOY.md` before calling it hosted.
