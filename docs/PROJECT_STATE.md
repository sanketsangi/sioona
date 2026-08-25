# Sioona – Project State

**Canonical copy (agents + current work):** [`.cursor/docs/PROJECT_STATE.md`](../.cursor/docs/PROJECT_STATE.md)

Do not maintain a second narrative here. New agent windows and current heading live in the Cursor docs file. Update that file when decisions or milestones change.

## Tests status (2026-08-25)

| Suite | Result |
| --- | --- |
| Web Vitest (`cd web && npm test`) | **428** passed / **5** skipped (52 files passed, 1 skipped) |
| Backend pytest (`cd backend && .venv/bin/python -m pytest`) | **58** passed |
| ESLint (`cd web && npm run lint`) | **clean** |
| Local smoke (localhost web + FastAPI SQLite) | health / Insights / Upload / Eval / Taxonomy **200**; legacy Location ok; needs-review `[]` **200**; signal-score `reviewed_count` present; `verify_signal_score_flow.py` **PASS** |
| Smoke (`npm run test:smoke`) | **not present** — no `test:smoke` script in `web/package.json` or repo root |

**Residual failures:** none. Not a hosted deploy.

**Code changes this pass:** `needs-review` + `signal-score` SQLAlchemy errors → `database_unavailable`; eslint `AppHeader` set-state-in-effect + unused `ConversationDrawer` props.

**Skipped (intentional, not a failure):** `web/src/lib/groww-batch02.eval.test.ts` — suite `Groww Batch-02 pack (local Synthetic-Data)` (`describe.skipIf(!PACK_PRESENT)`). The local Synthetic-Data pack at `/Users/sanket/Documents/Synthetic-Data/data/companies/groww/Batch-02` is absent on this machine / CI. No product judgment needed.
