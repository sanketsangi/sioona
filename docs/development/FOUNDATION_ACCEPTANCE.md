# Foundation acceptance — authoritative current closeout

**2026-10-13:** Phase 2 go is recorded in [PHASE_2_GO.md](PHASE_2_GO.md) against `main` `7ab84e5`. D6 implementation is approved; hosted acceptance remains open. Operator items OP-1 through OP-5 stay open.

Updated 2026-10-12. This table supersedes stale present-tense task closeouts; dated historical evidence and the cookbook baseline remain intact. **`main` `b15f5d0`** combined status is success for Web, Backend, E2E, Eval gate, Gitleaks, and Marketing site in GitHub Actions [run 38197731076](https://github.com/sanketsangi/sioona/actions/runs/38197731076). PR [#154](https://github.com/sanketsangi/sioona/pull/154), [#155](https://github.com/sanketsangi/sioona/pull/155) (managed-owner 024 repair), [#156](https://github.com/sanketsangi/sioona/pull/156) (actor assertion contract), and [#157](https://github.com/sanketsangi/sioona/pull/157) (replaced-signal ingest publication) are all merged into `main`. The 2026-10-10 note remains historical: **`5e93be5`** merged foundation remediation plus admission pipeline fixes (`12458d1`). Branch `codex/foundation-cb09-remediation` is merged and deleted; Antigravity verified the four structural fixes (ordinals, global lock removal, admission metering, injection handling). Hosted CB-07 rollout remains an operator follow-up. Rulesets and classic branch protection still return HTTP 403 (GitHub Pro is required for this private repository), so CB-02's protection step is not accepted. D6 was approved by Sanket on 2026-10-12, unlocking CB-10.

| Card | Implementation | CI | Hosted rollout | Acceptance |
| --- | --- | --- | --- | --- |
| CB-01/02 | Merged foundation | `main` `b15f5d0` six checks success; ruleset API still HTTP 403 | No new rollout | Historical CI retained. Protection is not accepted until a ruleset can be applied and read back |
| CB-03 | Merged actor authorization; scoped inference principal additions local | PR #141 head green; new enforcement tests local; Vercel preview ready | Isolated staging not provisioned | Blocked: exact target/cost approval, schema/memberships, deployment and observed 30-minute window |
| CB-04 | `024_tenant_rls` merged and repaired in #154/#155; API binds `app.tenant_id` | `main` `b15f5d0` six jobs success, including Backend PostgreSQL migration checks | Runtime role is `NOLOGIN`. Hosted `DATABASE_URL` not switched | Postgres acceptance proved locally. Not accepted for multi-tenant production until the operator URL switch |
| CB-05/06 | Merged gateway/ledger; universal preflight and pending admission ledger local | #146 head passes affected historical checks; new revision unverified | No new rollout | Local fix validation and independent review complete; CI pending |
| CB-07 | Attempt mode on `main`; admission remediation complete (`12458d1`) | Local + Antigravity green; exact head `5e93be5` CI observation optional | 023 verified hosted on Neon main (read-only, 2026-10-12) | Operational pause/timing acceptance still pending |
| CB-08 | Merged evidence anchors; Unicode conformance remediation local | Local shared Python/TS fixtures; new revision unverified | Historical hosted closeout preserved | Remediation independent review complete; CI pending |
| CB-09 | Synthetic replay, external runner, split promotion and identity checks implemented | #146 historical synthetic gate passes; new revision unverified | No external evaluation performed | Synthetic D5 metrics pass in clean-state test; external promotion blocked |
| CB-10 | Slice 1 committed locally on `main` at `3258c23`; P1/P2 repairs committed locally at `6ed8350` | Repairs: 159 focused tests passed locally; repair CI unverified | Production Postgres mode off; hosted zero-loss window not run | D6 approved; subsequent review findings remain open; later slices and hosted acceptance remain open |
| CB-13 | Not promoted | — | — | Requires identical verified external baseline/candidate holdout comparisons passing unchanged D5 |

## Read-only GitHub evidence

PR [#154](https://github.com/sanketsangi/sioona/pull/154), inspected 2026-10-12: merged; source head `f2875747e3601c54edb4956f3cd749e5feac94c2`, merge commit `2dd47e782874e00a17c3933153a3e14a41b66a67`. [Run 38182984205](https://github.com/sanketsangi/sioona/actions/runs/38182984205) completed successfully for Web, Backend, E2E, Eval gate, Gitleaks and Marketing site. Backend step “PostgreSQL migration and constraint checks” succeeded; the existing workflow runs the complete migration test file containing the runtime-role proof. This accepts merged implementation and source-head CI, not hosted RLS or CB-03 staging.

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

The historical v2 six critical injection failures were cleared by the historical v3 capture. Current frozen v3 replay: zero critical injection failures, 88/88 surfaced evidence valid, unchanged D5 precision/recall bands. Coverage is 120/0, matching `artifact.json`, `baseline.json`, and the frozen v3 gate assertions. Synthetic gate thresholds remain unchanged. A dirty working tree blocks the CLI; clean-state tests validate its metrics. External evaluation requires complete coverage and fails on either rejected output.

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

## PR #147 CI follow-up — 2026-10-10

On exact head `e0124e51a633b3fb02456f8774cc1be65ba08ef1`, [run 38046918070](https://github.com/sanketsangi/sioona/actions/runs/38046918070) passed Web, Backend, Eval gate, Marketing and guarded E2E, including Linux/Postgres checks. Gitleaks 8.28.0 failed reproducibly on the explicitly synthetic actor-signing key in `web/src/lib/backend-client.test.ts:933`; the rerun had the same failure. Bugbot remains neutral/error due to its usage limit.

Remediation adds an AND allowlist for only that exact dummy value and exact test path, including its existing history. It does not ignore the file, commit or rule. A failing-then-passing scanner regression proves an additional secret in the same file, a changed key and the original value relocated to another file still fail. All five scanner tests and full reachable-history scan with the CI-pinned 8.28.0 binary pass locally. New-head hosted CI is pending publication/observation; prior-head results do not prove it. CB-10/CB-13 remain blocked, n=100 is not exempted from the minimum 120, and Migration 023 stays unapplied on hosts.

## CB-04 and remaining gates — 2026-10-12

`main` `96f34f145e7eb5baaec54112f57e9b2f27620fbc` later retired the "exact-head CI pending" statement for the merged remediation: Web, Backend, E2E, Eval gate, Gitleaks, and Marketing site are success. Ruleset and classic branch-protection reads still return HTTP 403, so Phase 0 is not accepted.

CB-04 is implemented, not deferred. Disposable local Postgres proved the runtime role: unscoped reads return one tenant, missing context returns no rows, a cross-tenant insert fails, and a second transaction on the same connection does not keep the previous tenant. Backend unit tests: 251 passed, Postgres migration file 10 passed. That database was a throwaway cluster, not staging or production. PR #154 has since merged; its exact source-head CI, including PostgreSQL migration checks, is green as recorded above.

Not done, and not waived:

- Isolated staging was not provisioned. Render workspace listing returned unauthorized, and the staging quote is still unapproved.
- CB-03's membership seed and 30-minute shadow window were not observed.
- Historical 023/024 statement superseded by live inspection below: hosted 023 is present, 024 is absent. Agents do not run Alembic against non-test databases.
- `sioona_runtime` stays `NOLOGIN`. Owner connections bypass RLS until an operator sets a password out of band and points `DATABASE_URL` at that role, with `MIGRATION_DATABASE_URL` left on the owner.
- Tables outside the eight high-value policies are unchanged. Application filters and CB-03 remain the control there.
- CB-10 D6 implementation is approved; production cutover and hosted acceptance remain open. CB-13 is unchanged.

## Free local verification refresh — 2026-10-12

Checkout `/Users/sanket/Documents/Sioona`, branch `cb/CB-04-tenant-rls`, source head `f2875747e3601c54edb4956f3cd749e5feac94c2` (PR #154). The unrelated dirty `web/src/components/SignalReviewSuggestedAction.test.ts` was preserved.

- Backend: `.venv/bin/python -m pytest tests/test_tenant_isolation.py tests/test_actor_auth.py tests/test_actor_token.py tests/test_service_auth.py tests/test_seed_memberships.py -q` → **36 passed**, one existing fixture-rewrite warning.
- Existing disposable Postgres 17.11 cluster `/tmp/sioona-cb04-pg`, verified database `sioona_migration_test`, fixture owner `sioona`, loopback port 5432: `PG_TEST_DATABASE_URL=postgresql+psycopg://sioona@127.0.0.1:5432/sioona_migration_test MIGRATION_DATABASE_URL='' .venv/bin/python -m pytest tests/test_postgres_migrations.py -q -k 'actor_read_mutate_and_revoke or runtime_role_rls'` → **2 passed, 8 deselected**, existing Alembic warnings. Initial connection attempts used the old port/incorrect owner and failed before test SQL; the corrected run above is the acceptance evidence.
- Web: targeted middleware, auth-guard, auth-token, actor-assertion, backend-client, gate runner and comparison suites → **123 passed** across seven files; no live provider comparison.
- Browser: isolated app copy outside the repo with synthetic credentials, providers disabled, backend pointed at an unused loopback port and external browser requests blocked. With `SIOONA_PUBLIC_DEMO=1`, a correctly signed expired cookie redirects `/` to `/login`; an API read returns 401 with `loginPath: "/login"`. The visible sign-in form accepts Enter from the password field, login returns 200, replaces the cookie with a fresh httpOnly session, and navigates home. This does not prove hosted sign-in or a backend data flow.

No paid service, hosted migration, ruleset or external model comparison was touched. No commit or push was made. Hosted CB-03 acceptance remains open.

## Live platform refresh and deployment repair — 2026-10-12

- GitHub CLI and connector ruleset reads return 403, explicitly requiring GitHub Pro or a public repository. Classic branch-protection CLI read returns the same plan restriction; connector alone instead returns integration-permission denial. No upgrade, visibility change or ruleset write was performed.
- Confirmed Render workspace `tea-d9t31uugekts73clssa0` has only `sioona-api` (`srv-d9t38fn40ujc73cr7ho0`), free plan, main auto-deploy. Its build command runs `alembic upgrade head`. PR #154 merge `2dd47e7` deploy `dep-db61mnavcj2c73f615vg` failed; previous `96f34f1` deploy `dep-db5vucbrjlhs73b7okjg` is live.
- Neon organization `org-bitter-thunder-59170028` is free. Project `summer-haze-99931300`, primary branch `br-winter-cell-avh5pcw3`, database `neondb` reports `023_inference_budgets`. No runtime role or tenant-isolation policies exist. Only global inference control exists: enabled, daily/run limits 1/1, attempts mode. No tenant is enabled by that row alone. CB-07 schema is present; operational acceptance is still unverified.
- Owner `neondb_owner` is NOSUPERUSER, BYPASSRLS, CREATEROLE. Migration 024 failed on `ALTER ROLE ... NOSUPERUSER`: only a true superuser may alter the SUPERUSER attribute. Reproduced locally with a restricted migration owner before the fix. The fix creates a restricted role or rejects unsafe existing role attributes instead of attempting a superuser-only alteration; existing LOGIN is preserved for operator-managed rollback/re-upgrade.
- Local Postgres migration suite after repair: **13 passed** (fresh restricted owner, existing safe/unsafe runtime role and existing migration/RLS proofs). No hosted migration or redeploy was performed. This repair needs its own source-head CI and review before another hosted attempt.
- No isolated staging service/empty staging branch exists. Existing rehearsal/backup branches inherit production data and are not empty staging targets. An on-demand free Render service plus a separate empty Neon project is a candidate, subject to quota verification and operator schema setup; the existing paid Blueprint was not applied.
- External manifest remains n=100, below D5 four buckets of at least 30 each. No partner bytes were opened or sent to a provider. A sufficient labeled corpus, chosen baseline/candidate identities and an explicit attempt ceiling are still needed; thresholds are unchanged.

CB-10 D6 implementation is approved. Staging acceptance, hosted RLS and external promotion remain unfulfilled; production Postgres mode stays off. See `tasks/FOUNDATION_NEXT_ACTIONS.md` for the concrete execution sequence.
