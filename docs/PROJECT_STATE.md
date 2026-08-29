# Sioona – Project State

**Canonical copy (agents + current work):** [`.cursor/docs/PROJECT_STATE.md`](../.cursor/docs/PROJECT_STATE.md)

Do not maintain a second narrative here. New agent windows and current heading live in the Cursor docs file. Update that file when decisions or milestones change.

## Tests status (2026-08-29)

| Suite | Result |
| --- | --- |
| Web Vitest (`cd web && npm test`) | **444** passed / **5** skipped (52 files passed, 1 skipped) |
| Backend pytest (`cd backend && .venv/bin/python -m pytest`) | **58** passed |
| Smoke (`npm run test:smoke`) | **not present** — no `test:smoke` script in `web/package.json` or repo root |

**Residual failures:** none. Not a hosted deploy.

**Code changes this pass:** Eval keep-set SignalScore unions request-scoped overlay conversation ids so stub reviews after `/tmp` wipe count toward the week window.

**Skipped (intentional, not a failure):** `web/src/lib/groww-batch02.eval.test.ts` — suite `Groww Batch-02 pack (local Synthetic-Data)` (`describe.skipIf(!PACK_PRESENT)`). The local Synthetic-Data pack is absent on this machine / CI. No product judgment needed.
