# Sioona – Project State

**Canonical copy (agents + current work):** [`.cursor/docs/PROJECT_STATE.md`](../.cursor/docs/PROJECT_STATE.md)

Do not maintain a second narrative here. New agent windows and current heading live in the Cursor docs file. Update that file when decisions or milestones change.

## Tests status (2026-08-20)

| Suite | Result |
| --- | --- |
| Web Vitest (`cd web && npm test`) | **408** passed / **5** skipped (49 files passed, 1 skipped) |
| Backend pytest (`cd backend && .venv/bin/python -m pytest`) | **56** passed |

**Residual failures:** none.

**Skipped (intentional, not a failure):** `web/src/lib/groww-batch02.eval.test.ts` — suite `Groww Batch-02 pack (local Synthetic-Data)` (`describe.skipIf(!PACK_PRESENT)`). The local Synthetic-Data pack at `/Users/sanket/Documents/Synthetic-Data/data/companies/groww/Batch-02` is absent on this machine / CI. No product judgment needed.
