# Main verification — 15 October 2026

## Subsequent local audit at `fd13848a`

The following is a fresh, uncommitted audit of main
`fd13848a84f2a2b01c482700f548937326010f2b`, superseding earlier receipts only
for the commands repeated here. Initial tracked status was clean.

- Web full `npm test`: **1,853 passed, 5 skipped** (86.34s) after repairing the
  holdout subprocess invocation. Node `--import tsx` avoids the CLI IPC socket;
  the preflight assertions and fail-closed result are unchanged. Focused
  holdout/NavUser tests: **16 passed**.
- Web lint: zero errors/warnings. Logout retains a deliberate full document
  navigation to discard authenticated client caches, with a narrow documented
  lint exception. Initial TypeScript errors referenced stale generated lifecycle
  routes; the successful production build regenerated types and the subsequent
  `npx tsc --noEmit` passed without adding lifecycle code.
- Site lint, typecheck and tests: passed, **88 tests**.
- Both default Turbopack builds failed on sandbox port binding (`EPERM`). Both
  alternative Webpack production builds passed. Site used the synthetic build
  settings described below. Default build success remains unproved.
- Backend `DATABASE_URL=sqlite+pysqlite:///:memory: .venv/bin/python -m pytest -q`:
  **595 passed, 41 Postgres tests skipped**, no warnings (17.00s).
  Added Alembic `path_separator=os` and early assertion-rewrite registration for
  the shared test helper. `pip check` passed; Alembic has one head,
  `028_batch_cache`; the migration-chain regression passed.
- Offline replay via `node --import tsx eval/gate/run-gate.ts` reconstructed
  88/88 valid surfaced anchors across 120/120 completed items, with zero critical
  injection or tenant failures. Command exited 1 solely for `git_dirty`; this
  is not a clean promotion receipt. No model/provider call occurred.
- Disposable Postgres migration/RLS/concurrency/restart suite: **41 passed**,
  no skips (201.13s), using a newly initialized local PostgreSQL 17 cluster on
  loopback port 55459 and database `sioona_migration_test`. The initial restricted
  initialization failed on shared-memory permissions; approved escalation allowed
  the disposable test run. No hosted target was accessed.
- `git diff --check`: passed. No commits, pushes, deployments or policy changes.

Next-card assessment is recorded in [CB-18](tasks/CB-18.md). Existing incomplete
operator/evaluation gates remain open; new lifecycle implementation requires
approved D11 values, prerequisite receipts or a local-only exception, and plan
approval under cookbook §5.2. The prepared implementation plan remains the
concrete proposal; this audit does not approve it.

## Verdict and scope

Verified fetched main `f281d6cf5b956cd1118a1cd998d0d9cca518ba3e` plus the four-file
site route repair described below. Local main was fast-forwarded from `d177aff2`;
no commits, pushes, hosted database changes, deployments or provider calls were
made. The initial web test diff was a stray closing `});`; its parser failure
was reproduced and the file restored exactly to tracked main content.

**Not all requested gates are green:** default `npm run build` in both Next.js
packages fails with Turbopack `EPERM` while binding an internal compiler port,
including escalated retries. Both alternative `npm run build -- --webpack`
production builds pass. This is additional production-build evidence, not a
pass for the requested default command. Repeat default builds in an environment
that permits the compiler port before declaring main fully green.

Offline correctness also does not accept hosted/operator gates, external
holdout promotion, Linux CI or Phase 3. The CB-18 approval packet is prepared
provisionally; no Phase 3 implementation begins from this verification.

## Fresh gate receipts

Logs are under `/tmp/sioona-verification-1015/`. Commands run in their package.
Local tools: Python 3.13.3, Node 23.11.0, PostgreSQL 17.11. CI specifies Python
3.12 and Node 22; no fresh dependency install or exact-head hosted CI is claimed.

- Backend `python -m pytest` using `backend/.venv/bin/python`: 595 passed,
  41 PostgreSQL tests skipped when the test URL was unset (23.32s).
- Full backend rerun with `DATABASE_URL=sqlite+pysqlite:///:memory:` and
  `PG_TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:55447/sioona_migration_test`:
  **636 passed, no skips, 257.91s**. All 41 tests in
  `tests/test_postgres_migrations.py` ran as part of this invocation, including
  upgrades/downgrades, constraints, forced RLS, runtime roles, missing context,
  cross-tenant access, concurrent admission/leases/cache, economics SQL and the
  10K restart/ledger/evidence proof. No redundant second 10K run was needed.
  The database was created in a new disposable loopback cluster, not reused from
  an application environment. Alembic has one head: `028_batch_cache`.
- Backend `python -m pip check`: no broken requirements.
- Web `npm test -- --maxWorkers=1 --testTimeout=20000`: **1,853 passed,
  5 skipped**, 200 files passed and one external-pack file skipped (100.84s).
  Missing external holdout tests are not silently counted as acceptance.
- Web `npm run lint`: passed, zero errors; existing `NavUser.tsx` internal
  navigation warning remains. `npx tsc --noEmit`: passed.
- Web `npm run build`: blocked by compiler-port `EPERM`.
  `npm run build -- --webpack`: passed, including generated route types and
  page generation. Existing middleware deprecation/tracing/cache warnings remain.
- Site after repair: `npm test`: **88 passed**, 25 files (6.10s);
  `npm run lint` including token check: passed; `npm run typecheck`: passed.
- Site `npm run build`: blocked by compiler-port `EPERM`.
  `npm run build -- --webpack`: passed after the route repairs.
  Builds used the workflow's synthetic settings:
  `NEXT_PUBLIC_SITE_URL=https://launch.example.test`, empty
  `NEXT_PUBLIC_APP_URL`, `PILOT_CONTACT_SUPPORT_EMAIL=launch@example.test`,
  `PILOT_CONTACT_RETENTION='Synthetic verification policy only'`,
  `PILOT_CONTACT_HOSTING_REGION=synthetic-test-region`.
  These are test fixtures, not approved public policy facts.
- Web `npm run eval:gate`: passed on clean fetched main before the site-only
  repair/documentation edits; artifact source is `f281d6cf`, `git_dirty=false`,
  120/120 complete, 88/88 surfaced evidence valid, zero critical injection and
  tenant failures, no provider calls. No model/prompt/router files changed after
  this receipt. It does not establish external corpus promotion or a clean
  receipt for the later uncommitted patch.
- `git diff --check`: passed.

The initial restricted runs encountered blocked tsx IPC and PostgreSQL shared
memory. Escalated retries resolved those checks. Turbopack's compiler-port error
persisted. No test assertion or build script was weakened to hide it.
Guarded browser E2E and Gitleaks are separate CI gates; they were inspected in the
workflow but were not rerun in this requested offline gate set.

## Repairs made

The first Webpack site build failed on generated Next route types, despite the
pre-build typecheck passing. `api/contact/route.ts` exported `retryAfter`, which
is not an allowed route export; it is now private. Its tests assert invalid and
HTTP-date Retry-After behavior through POST. `mcp/route.ts` declared
`GET(request?: Request)`; it now takes the required Request and its test supplies
one. Production behavior and the origin checks are preserved. Full site tests,
lint, typecheck and the alternative production build pass after these changes.
The four site files and this documentation remain reviewable local edits.

## CB-00 through CB-15 reconciliation

Cookbook task checkboxes describe acceptance criteria; they are not a live
completion ledger. Dated statements in task records remain historical. This
snapshot supersedes their stale present-tense merge/draft claims only where
verified by local main ancestry and source/tests.

### Phase 0

- **CB-00 — implemented.** Baseline, governance and approved D0 exist in
  `baseline.md`, `decisions.md` and engineering instructions. The cookbook's
  baseline facts are explicitly historical, not current hosted behavior.
- **CB-01 — implemented.** Hashed `requirements.in`/`requirements.txt`, package
  instructions and CI install/check contracts exist; current pip check and
  backend tests pass. Fresh Python 3.12/Linux hash install was not repeated.
- **CB-02 — implemented with acceptance open.** Workflow has Web, Marketing,
  Backend/Postgres, guarded E2E, Eval gate and Gitleaks; Dependabot and scanner
  regressions exist. Required branch protection/ruleset enforcement is still
  unaccepted in the authoritative foundation record; this session did not query
  or change account/ruleset settings. Offline unit gates do not waive that exit.

### Phase 1

- **CB-03 — merged code, operator acceptance open.** Actor/membership authority
  in `backend/app/api/actor.py` and web assertions; isolation/revocation tests
  run. Isolated staging, enforce-mode observation and signed acceptance remain
  open in foundation/CB-03 records. No hosted auth mode was changed.
- **CB-04 — merged and proved locally.** Migration chain and actual runtime-role
  RLS checks pass in disposable Postgres, including later tenant tables. Hosted
  role/URL switch and production isolation acceptance remain separate.
- **CB-05 — implemented.** Gateway contracts in web AI modules and Python
  `backend/app/ai/`, provider/parity tests and replay pass; no model change.
- **CB-06 — implemented.** Ledger API/service and attempt identity, unknown
  usage/cost behavior, pending-before-call admission and crash tests pass.
  Historical buffered-only D2 wording is superseded by CB-07/11 implementation.
- **CB-07 — implemented, operator acceptance open.** Daily/run reservations,
  admin controls, fail-closed budgets and pause checks pass, including concurrent
  Postgres admission. Hosted timing/kill-switch observation is not supplied by
  local tests; USD mode/rates are not newly approved.
- **CB-08 — implemented.** Persisted-source hashes/code-point anchors and shared
  reconstruction fixtures pass; 10K Postgres anchors reconstruct individually.
  Historical hosted sample receipts are not a new hosted verification.
- **CB-09 — implemented synthetic gate; external promotion open.** Frozen v3
  replay passes unchanged D5. Required external baseline/candidate corpus and
  identity approval remain separate; the recorded n=100 manifest cannot meet
  four classes of at least 30 items.

### Phase 2

- **CB-10 — merged, in-progress acceptance.** Main contains PR #162 (`6ea0e96b`)
  and canonical state, resume/concurrency/reconciliation/restart-related unit
  coverage. Operator runbook still requires hosted slice reconciliation,
  observation, restart/outage proof, writer-removal and Sanket's signature.
  Do not close CB-10 based on this offline run.
- **CB-11 — merged implementation, enablement gated.** Main contains PR #166
  (`d259f833`), worker, outbox, leases/fencing, cancellation, Python gateway
  parity, pending metering and runtime RLS. Fresh Postgres tests pass. The
  task's draft/merge-gated headline is stale; signed CB-10 acceptance and a
  separate provisioning/provider-spend go still gate hosted operation.
- **CB-12 — merged implementation.** PR #164 (`fe343752`) is in main; XLSX,
  MIME/email normalization, bounds/redaction and malformed-input tests run in
  the full web suite. Historical branch/PR metadata does not mean it is unmerged.
- **CB-13 — merged scaffolding, promotion incomplete.** PR #167 (`52ed8f05`) is
  in main, so the task's draft statement is stale. Routing/benchmark/holdout
  guards pass; the approved checksum-bound n≥120 corpus, ≥30/class, baseline
  digest, actual model/fallback comparisons and authorized canary are still
  needed. No route was promoted or live model availability/pricing re-verified.
- **CB-14 — merged offline scope.** PR #172 (`2b6fdd6b`) is in main. Historical
  jobs, restart/cache/ledger and 10K evidence acceptance pass locally. As its
  card states, no approved provider-batch adapter is configured: missing remote
  batch results and external provider submission/polling/cancel behavior are
  not claimed as delivered. Cache savings distinguish application hits from
  reported provider cached-input tokens. CB-13 promotion is not waived.
- **CB-15 — merged dashboard scope, cookbook extras open.** PR #171 (`8c758c12`)
  is in main. Admin-only, text-free tenant/window metrics and cookbook SQL
  reconcile under runtime RLS. Indexed full-text/trigram queue search is not
  implemented in this scope. Flush-failure, reservation-drift, DB-latency and
  connector telemetry remain explicitly unavailable; owner/runbook labels are
  present, but this is not operational alert-delivery acceptance. Real volumes,
  hosted alert operations and complete margin/revenue accounting are unproved.

Thus Phase 0/1/2 implementation is substantial, but **all cards accepted** is
false. The remaining non-code approvals/observations and explicitly deferred
scope cannot be fixed by marking task boxes or running synthetic tests.

## Phase 3 next action

See [CB18_IMPLEMENTATION_PLAN.md](CB18_IMPLEMENTATION_PLAN.md) for the dependency
edges, exact D11 inputs, D10 boundary, existing wipe inventory, proposed slices,
acceptance tests and rollout boundaries. D10/D11 remain **not approved** in
`decisions.md`. No Phase 3 code was edited. Resolve the default build environment
and review the prerequisite acceptance gates before calling this a green-main
handoff or approving implementation.
