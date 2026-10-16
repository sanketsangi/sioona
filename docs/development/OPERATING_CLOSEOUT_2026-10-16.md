# Operating closeout — 2026-10-16

Approved by Sanket. Base `60457b11` includes the requested seven commits above `620faf36`. Dedicated branch `codex/operating-closeout`; original checkout WIP is preserved and UI/UX redesign excluded. Source policy is the explicit user request; the attached checklist does not authorize provider/account mutations.

Decisions are recorded in decisions.md, STAGING_ACCEPTANCE.md and FOUNDATION_ACCEPTANCE.md. CB-01–19 current headlines are reconciled without deleting historical receipts. New durable telemetry needs migration 034 after the approved 033 staging baseline. No hosted migration, provisioning, account upgrade, live model call, integration enablement or customer write is performed.

## Verification

- Failing-first telemetry tests: 4 failures for absent canonical telemetry/receipt route; focused implementation pass: 39 tests. Broader suite exposed membership removal preceding receipt cleanup; repaired ordering and migration checkpoint mapping, then 87 affected tests passed.
- Complete final backend SQLite/API suite: **695 passed, 70 skipped**, 81.11 s (supersedes the intermediate 692-pass run). PostgreSQL coverage is separate; missing external/private packs are not acceptance. Additional final price/preflight/aggregation checks: **33 passed**. Local Python 3.13.3; CI uses Python 3.12.
- Site: **88 tests passed**; lint/token check and TypeScript passed; production `npm run build -- --webpack` passed using synthetic launch URL/contact/retention/region values. These fixtures are not approved public policy facts.
- Web full lint and TypeScript passed; final affected-file ESLint and TypeScript passed after the UI fix. Web production `npm run build -- --webpack` passed; existing middleware/Sentry build warnings remain. Local Node 23; CI uses Node 22.
- Independent read-only review found the stale UI '4 unavailable' label; new regression failed before the fix. The fix displays four measured metrics with units/reasons, preserving explicit unavailable timing. UI/ledger subset **6 passed**, final UI/ledger/backend-client subset **67 passed**. Re-review of UI, lifecycle/checkpoint and always-verified preflight/reporting changes found no further blocking finding.
- Final PostgreSQL, full web and clean-tree evaluation receipts are recorded below.

## Verification limits and review

All provider responses are mocked/replayed. No live inference, provider resource creation, hosted SQL, external write or billing action is included. Flush telemetry cannot persist its own outage losses; pending attempt reconciliation remains necessary. Database latency is the measured ledger-preflight query subset, not whole-database APM. Connector values are current-state counts within creation/receipt windows. USD budgets remain disabled.

The initial full web run under concurrent builds/database load: **1,861 passed, 4 failed, 5 skipped**. Three were 5 s eval timeouts; one Acted route returned 404. Source/assertions were not weakened. A full rerun with bounded workers and a 20 s command timeout is recorded separately; initial failures are retained here. Initial backend run exposed the deletion ordering bug and was superseded by the repaired full pass above.

## Clean-tree evaluation receipt

On implementation commit `cc88c986a689b047f7fc370dbe4c1902d0b31267`, `EVAL_GATE_ARTIFACT_PATH=/private/tmp/closeout-eval-artifact.json npm run eval:gate` exited **0**, `git_dirty=false`, `failures=[]`: **120/120 completed, 88/88 surfaced evidence valid, zero tenant failures, zero critical injection failures, zero provider attempts**. Artifact and logs stay outside the repository. This is synthetic frozen replay evidence, not external-corpus promotion or live throughput. No prompt/model/router change was made.

## Final PostgreSQL revision checks

On implementation `cc88c986`, PostgreSQL **17.11**, new disposable UTF-8 loopback cluster at `127.0.0.1:55594`, database `sioona_migration_test`: `PG_TEST_DATABASE_URL=postgresql+psycopg://sioona@127.0.0.1:55594/sioona_migration_test MIGRATION_DATABASE_URL='' DATABASE_URL=sqlite+pysqlite:///:memory: /Users/sanket/Documents/Sioona/backend/.venv/bin/python -m pytest tests/test_postgres_migrations.py -q -k 'not 10k_historical'` → **69 passed, 1 deselected in 84.44 s**. This verifies final migration 034 upgrade/downgrade guards, forced runtime RLS/missing context/forged insert, receipt idempotency, shifted in-flight deletion checkpoints, source/action lifecycle, real backup restore and tenant deletion. The deselected 10K test subsequently passed in the complete 70-test suite on port 55593, recorded below. No hosted database was used.

## Final full web receipt

`npm test -- --reporter=dot --maxWorkers=2 --testTimeout=20000` → **203 files passed, 1 skipped; 1,865 tests passed, 5 skipped**, exit 0, 315.96 s. The missing external pack remains explicitly skipped. The command was rerun after both builds completed, avoiding shared runtime fixture interference and bounding resource contention; no test or production assertion was relaxed. All three original eval timeouts and the Acted 404 passed unchanged.

## Receipt integrity

Final local log SHA-256 values (logs are outside the repository and contain synthetic test data only):

- `closeout-backend-exact-final.log`: `0e22a4d4c632da71412473a74bd87e154c702230cfe0619b6a9e06af225a71b5`
- `closeout-postgres-final.log`: `b50cb826b05c0f68107a65ad10d8940ed1d479a041b691d028bbb7190bddd96e`
- `closeout-web-final.log`: `f2c67934c8ac2eefeec9844820a408bb7c22be95ac2b02aec913b055fc18dc5b`
- `closeout-site.log`: `96b5eef92b854868f925c6fe66592b0fdf693d6438ba7bbb2d1db2872d440aee`
- `closeout-web-build.log`: `7af4a0a1b142f669159583f5f3a97fc7a602089a0cbcb3a0df5e1eed410dfd67`
- `closeout-site-build.log`: `a25e39900c879a65d51ae1e5535e43560bc39b0aeae9dbbbf533b1f45651cc40`
- `closeout-eval-artifact.json`: `646111202f6626ad5c6f10912fab9bcdcdad5012e29eade36980d31829875824`

## Complete PostgreSQL suite and historical acceptance

New disposable PostgreSQL **17.11**, UTF-8 loopback cluster `127.0.0.1:55593`, database `sioona_migration_test`: `PG_TEST_DATABASE_URL=postgresql+psycopg://sioona@127.0.0.1:55593/sioona_migration_test MIGRATION_DATABASE_URL='' DATABASE_URL=sqlite+pysqlite:///:memory: /Users/sanket/Documents/Sioona/backend/.venv/bin/python -m pytest tests/test_postgres_migrations.py -q` → **70 passed, no skips**, exit 0, **975.23 s**. The run began before the final checkpoint and preflight test additions; the separate 69-pass final-revision suite above covers those final changes. The unchanged 10K worker test passed with two synthetic process losses, exactly 10,000 active predictions and reconstructible anchors, 10,001 ledger rows including the retained pending attempt, and no duplicate publication. Provider transport is injected synthetic data, not real model inference. Concurrent builds/tests and local disk pressure affected runtime; this is not a hosted throughput or SLA receipt.

Full PostgreSQL log SHA-256: `9194d08f109c745a784433f1e0f287f1f39d20bf4b4af77331fd07b9fe446e91`.

## Publication boundary

All requested local checks completed. The dedicated branch includes exactly the requested upstream base through `60457b11`; original working-tree files were never reset, stashed, staged or overwritten. Separate UI/UX redesign is absent from this PR. OP-1–OP-5 and hosted acceptance are still explicit operator gates. Migration 034 is a deployment prerequisite, not a hosted action performed here.
