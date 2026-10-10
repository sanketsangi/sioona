# Foundation acceptance — authoritative current closeout

Updated 2026-10-10. This table supersedes stale present-tense task closeouts; dated historical evidence and the cookbook baseline remain intact. Worktree: `/Users/sanket/.codex/worktrees/94a3/Sioona`, detached base `db5254d2b851167c70e2be38536607f8052beaa9`. Publication is authorized on 2026-10-10 to `codex/foundation-cb09-remediation` for exact-head CI. This record does not claim green remediation CI.

| Card | Implementation | CI | Hosted rollout | Acceptance |
| --- | --- | --- | --- | --- |
| CB-01/02 | Merged foundation | Exact historical PR heads inspected below; remediation unverified | No new rollout | Prior closeouts retained; remediation CI pending |
| CB-03 | Merged actor authorization; scoped inference principal additions local | PR #141 head green; new enforcement tests local | Isolated staging not provisioned | Blocked: exact target/cost approval, schema/memberships, deployment and observed 30-minute window |
| CB-04 | Separate RLS card | Not demonstrated here | Not demonstrated here | Required before broader multi-tenant production rollout |
| CB-05/06 | Merged gateway/ledger; universal preflight and pending admission ledger local | #146 head passes affected historical checks; new revision unverified | No new rollout | Local fix validation and independent review complete; CI pending |
| CB-07 | Attempt mode implemented locally; D4 recorded | Local tests; exact revision unverified | 023 not applied hosted | Pending human schema-first rollout and acceptance |
| CB-08 | Merged evidence anchors; Unicode conformance remediation local | Local shared Python/TS fixtures; new revision unverified | Historical hosted closeout preserved | Remediation independent review complete; CI pending |
| CB-09 | Synthetic replay, external runner, split promotion and identity checks implemented | #146 historical synthetic gate passes; new revision unverified | No external evaluation performed | Synthetic D5 metrics pass in clean-state test; external promotion blocked |
| CB-10 | Not started | — | — | Waits for foundation acceptance |
| CB-13 | Not promoted | — | — | Requires identical verified external baseline/candidate holdout comparisons passing unchanged D5 |

## Read-only GitHub evidence

PR [#146](https://github.com/sanketsangi/sioona/pull/146), exact head `163a08e54c8340b86c098b7ce6e14fcd845498f1`, inspected 2026-10-10: Web, Backend, E2E, Eval gate, Gitleaks and Marketing site all completed/success in [run 38040540932](https://github.com/sanketsangi/sioona/actions/runs/38040540932). Security Reviewer and Approval Agent reported success. Cursor Bugbot completed neutral with an error: usage/spend limit reached, so no successful Bugbot review is claimed. Vercel reported deployment success for that head; it is not isolated staging acceptance.

| Historical card / PR | Exact inspected head | Observed Actions status |
| --- | --- | --- |
| CB-01 / #123 | `004427e46c6807e5e1ddc18153622a53b99c27b3` | Web/Backend success; Marketing failure. [Run 37561059169](https://github.com/sanketsangi/sioona/actions/runs/37561059169). Later green runs do not rewrite this result. |
| CB-02 / #125 | `a38d37d3cd12174fdb7cc28b87197be457cdbb65` | Web/Backend/E2E/Gitleaks/Marketing success. [Run 37602519274](https://github.com/sanketsangi/sioona/actions/runs/37602519274). |
| CB-03 / #141 | `18ae62649773efebf3b028b8906cfdfee5e554f7` | Web/Backend/E2E/Gitleaks/Marketing success. [Run 37687253538](https://github.com/sanketsangi/sioona/actions/runs/37687253538). |
| CB-05 / #139 | `2e2637b4b9637ce02072a56be30d70bedde2c4f8` | Web/Backend/E2E/Gitleaks/Marketing success. [Run 37678519487](https://github.com/sanketsangi/sioona/actions/runs/37678519487). |
| CB-06 / #143 | `637dd01e6d700040fd376412ded2d90686c73446` | Web/Backend/E2E/Gitleaks/Marketing success. [Run 37701189184](https://github.com/sanketsangi/sioona/actions/runs/37701189184). |
| CB-08 / #144 | `1fbe01d9edef703a0c8caca658e31bdfe26a6f54` | Web/Backend/E2E/Gitleaks/Marketing success. [Run 37791520378](https://github.com/sanketsangi/sioona/actions/runs/37791520378). |

The commit workflow connector returned no PR-triggered first-page runs for merged base `db5254d`; this limited result does not establish missing CI or success. Required branch-protection/ruleset configuration was not verified. The remediation is being published for CI; its exact-head check results remain unverified until observed. Exact-remediation CI and required-check evidence are **unverified**, regardless of the historical green head.

## Replay and external promotion

The historical v2 six critical injection failures were cleared by the historical v3 capture. Current frozen v3 replay: zero critical injection failures, 88/88 surfaced evidence valid, unchanged D5 precision/recall bands. Coverage is now honestly 118 complete / 120 eligible, with two grounding-rejected outputs; historical 120/120 represented recorded fixtures, not accepted classification coverage. Synthetic gate thresholds remain unchanged. A dirty working tree blocks the CLI; clean-state tests validate its metrics. External evaluation requires complete coverage and fails on either rejected output.

Legacy fixtures remain byte-for-byte unchanged. `legacy-provenance.json` records exact archived digests and the historical request generation construction/config identity at #146 head, supported by the v3 capture task record and archived source. A byte or request-generation identity mismatch rejects the legacy capture; old captures are not relabeled. Historical retry/pacing environment is unknown and explicitly recorded as such, never filled with current settings. Legacy acceptance is synthetic request replay only; new captures and external comparison bind full effective dispatch configuration (attempts, timeout, pacing and retry cap). New captures include construction/config hashes and source SHA, explicit item identity at the provider boundary, durable accounting flushed in `finally`, and publish only as a complete atomic set. Synthetic aggregate artifacts now also contain candidate identity. Hashes omit credentials and conversation content.

`eval:holdout` accepts an explicitly authorized, clean checkout, external absolute corpus/output paths, attempt cap, durable ledger and server budgets. It verifies exact bytes and raw export count before normalization through the shared parser. It writes aggregate metrics only, outside the repository, with private file permissions; no Adapt overrides or product-state writes. `eval:promotion` separately requires synthetic success and complete baseline/candidate aggregates for the same manifest checksum/count, current candidate identities, and unchanged D5 thresholds. Manifest metadata alone cannot promote. No Batch-02 file was opened or evaluated in this work.

The existing manifest's n=100 cannot meet four buckets of at least 30 items each (minimum 120). D5 is not exempted: even a complete comparison would remain sample-insufficient. Obtain an approved sufficient corpus in a separately authorized evaluation; do not invent replacement checksum/counts.

## Local verification

- Full web suite: `node node_modules/vitest/vitest.mjs run` → 1,570 passed, 5 external-pack tests skipped. Subsequent holdout-contract suite (6 tests) passes, including an explicit assertion that aggregate artifacts contain no transcript, quote, individual item ID or output fields.
- Backend: `python -m pytest -q --ignore=tests/test_postgres_migrations.py` → 250 passed (one existing pytest fixture-rewrite warning).
- Disposable local Postgres: migration suite plus budget subset → 15 passed, comprising 9 migration/Postgres checks and 6 unit/API budget checks. Existing Alembic deprecation warnings remain. Upgrade from populated 022, new constraints, two independent racing connections, retained ambiguous allowance, retry/fallback run caps, midnight IST and global pause passed.
- `tsc --noEmit`, package `npm run lint`, and affected gate ESLint → pass; one pre-existing `NavUser.tsx` navigation warning. A broader `eslint .` exposes existing errors in E2E CommonJS guard files and `weekly-keep-set-ops.ts`; those files were not changed and are outside the package lint command.
- Independent read-only review found three defects (principal tenant rebinding, incomplete execution config identity, JS/Python whitespace difference); failing regressions preceded fixes. Reviewer rechecked all three and passed 49 targeted tests. Final explicit tenant-control identity/constraint change independently reviewed and six budget tests passed. No remaining material defect confirmed in reviewed changes.
- Staging proposal parses and validates against Render's downloaded public draft-2020-12 Blueprint JSON schema. No resources applied.
- `git diff --check` → pass. No prompts/models/taxonomy/thresholds/recorded fixture bytes changed, and no live provider call or partner corpus evaluation occurred.

Local verification does not replace exact-revision CI, Linux outbound-fence proof or hosted acceptance. Final guarded E2E: `DATABASE_URL=<disposable loopback test DB> npm run e2e` → 1 passed, including a successful isolated Next production build, persisted Correct and approved draft after reload, and no sends/outbound attempts. Providers were disabled. This was local macOS/Node 23 verification; Node 22/Linux CI remains unverified for the remediation.


## Reviewable change groups

1. External evaluation/gate split, universal ledger preflight, narrow principal operations, Unicode/shared fixtures.
2. Migration 023, verified budget routes/models/service, asynchronous provider admission and accessible paused feedback; D4 and CB-07 record.
3. Proposal-only isolated staging Blueprint and operator acceptance/cost procedure; no provision or hosted data changes.
4. Replay identity/provider boundary/atomic publication and exact-head CI/cookbook dependency/status reconciliation.

Sanket authorized commit and push of these locally verified groups on 2026-10-10 to trigger exact-head CI. A draft PR is necessary because the Tests workflow runs on PRs to main, not feature-branch pushes. This authorization does not permit merge, starting CB-10, CB-13 promotion, provider calls or hosted Migration 023. Review paths and acceptance evidence by group; publication alone does not establish acceptance.
