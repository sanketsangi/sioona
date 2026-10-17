# Launch blockers — authoritative reconciliation (2026-10-17)

This file is the single current list of Sioona launch blockers. Dated branch,
draft and local-only notes in the card records remain historical evidence; they
do not override this reconciliation.

## Current source and GitHub evidence

- Implementation base: `main` at `6b06090338e130b64d622ae34bb0854c1fc59bd3`
  (PR #211), following `92d709f4` (PR #213).
- PR #212 (`cf7e1960`) operator UI/UX and PR #210 (`7e0f4406`)
  staging bootstrap are merged on `main`. PR #211 preserved site design
  (`26fc0d54`) with all six required CI checks and CodeQL passing.
- The six required checks also passed on `cf7e1960`; these are code/CI
  receipts, not acceptance of deployed services.
- The operating closeout is merged: `cc88c986` and merge commit `a47927ff`
  are ancestors of current `main`.
- Exact-`main` GitHub checks on 2026-10-17: Web, Backend, E2E, Eval gate,
  Gitleaks, Marketing site and three CodeQL jobs passed green on PR #199.
- GitHub ruleset `Protect main history` (ID 25283776) is active and enforced on
  `main` with all 6 required CI status checks (Web, Marketing site, Backend, E2E,
  Eval gate, Gitleaks) and pull request review requirements with admin bypass.
- Security dependency update (Next.js 16.3.8 / promptfoo 0.124.1) is landed via
  PR #199; Dependabot PRs #194, #195, and #196 are superseded and closed.

## Remaining blockers for the baseline hosted launch

1. **[CLOSED] Enforce reviewed, green changes on `main` (OP-1).** Ruleset
   25283776 is active with strict status checks and pull request policy.
2. **[CLOSED] Land the prepared security dependency update.** Landed in `main`
   at `dab6f171` via PR #199. Superseded PRs #194, #195, and #196 closed.
3. **Accept isolated staging (OP-2).** The merged PR #210 bootstrap receipt
   records the zero-row baseline, migration 034, six synthetic memberships and
   runtime/RLS checks. Do not rerun the empty-database bootstrap on this populated
   target. Complete target/cost/backup readback and matching immutable deployments
   with providers, live ingest and external actions disabled. Complete the
   30-minute actor shadow observation, browser
   session refresh, permission/revocation, tenant A/B and lifecycle reset checks,
   then obtain operator sign-off. Bootstrap is recorded; prepared runners do not
   substitute for the remaining hosted acceptance.
4. **Complete the hosted database/runtime cutover and CB-10 acceptance (OP-3).**
   Record hosted Alembic current/head and a restorable backup rehearsal; run the
   guarded populated upgrade where applicable; keep migration-owner and direct
   restricted-runtime URLs separate; prove forced RLS, missing context,
   connection reuse and tenant A/B isolation. Reconcile canonical entities,
   prove one writer plus restart/outage recovery without runtime JSON, remove
   the legacy writer only after the observation window, and obtain Sanket's
   signed CB-10 acceptance.
5. **Complete hosted operational controls (OP-4).** Run the provider-free
   admission drill and independently verify pause propagation within 60 seconds,
   500/day and 120/run exhaustion, concurrent admission, final paused state,
   ledger/provider reconciliation and zero provider activity. Retain separate
   worker/application-cache propagation, outage/recovery/resumption and alert
   delivery evidence. Local PostgreSQL tests and a pending-verification receipt
   do not close this gate.
6. **Accept lifecycle and recovery on the hosted stack.** Configure a direct,
   session-preserving PostgreSQL connection for exports. Exercise legal holds,
   export/revocation, bounded deletion and interruption recovery, then rehearse
   a real backup restore and tombstone reconciliation. Measure recovery against
   RTO 4 hours and RPO 24 hours and retain counts-only evidence. Targets and
   local dump/restore tests are not achieved hosted measurements. Follow
   [`HOSTED_LIFECYCLE_ACCEPTANCE.md`](HOSTED_LIFECYCLE_ACCEPTANCE.md) and use
   `backend/scripts/operator_reconcile_tombstone.py`. Local verification of all
   four areas passed on disposable PostgreSQL 17 on 2026-10-17 (29 tests passed).
7. **Perform final release acceptance on the exact deployed revisions.** Confirm
   source evidence reconstructs from persisted text, telemetry and alerts are
   visible, and run the post-release upload → evidence → review → persisted
   decision reload smoke with zero sends. Record target/revision/configuration,
   review and CI receipts, rollback decision and human sign-off.

## Deliberately deferred or capability-specific gates

- **OP-5 / model promotion:** the baseline route may launch unchanged. Any
  CB-13 candidate promotion or canary remains blocked on an approved external
  corpus with at least 120 examples and at least 30 in each class, identical
  baseline/candidate evaluation and explicit attempt authorization.
- **Hosted workers:** keep inline execution and workers paused until signed
  CB-10 acceptance plus a separate operator go.
- **Live ingest:** keep `LIVE_INGEST=0` until customer consent, credentials and
  hosted CB-16 acceptance exist.
- **External actions:** keep `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`. Sandbox writes
  require approved credentials/allowlisted targets and explicit approval of the
  exact payload; production enablement has its own sign-off.
- **Customer SLA:** do not promise one before 60 days of production telemetry
  and a separate approval.

