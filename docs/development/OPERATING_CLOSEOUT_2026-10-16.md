# Operating closeout — 2026-10-16

Approved by Sanket. Base `60457b11` includes the requested seven commits above `620faf36`. Dedicated branch `codex/operating-closeout`; original checkout WIP is preserved and UI/UX redesign excluded. Source policy is the explicit user request; the attached checklist does not authorize provider/account mutations.

Decisions are recorded in decisions.md, STAGING_ACCEPTANCE.md and FOUNDATION_ACCEPTANCE.md. CB-01–19 current headlines are reconciled without deleting historical receipts. New durable telemetry needs migration 034 after the approved 033 staging baseline. No hosted migration, provisioning, account upgrade, live model call, integration enablement or customer write is performed.

## Verification

- Failing-first telemetry tests: 4 failures for absent canonical telemetry/receipt route; focused implementation pass: 39 tests. Broader suite exposed membership removal preceding receipt cleanup; repaired ordering and migration checkpoint mapping, then 87 affected tests passed.
- Complete backend SQLite/API suite: **692 passed, 70 skipped**, 124.25 s. PostgreSQL coverage is separate; missing external/private packs are not acceptance. Additional final price/preflight/aggregation checks: **33 passed**. Local Python 3.13.3; CI uses Python 3.12.
- Site: **88 tests passed**; lint/token check and TypeScript passed; production `npm run build -- --webpack` passed using synthetic launch URL/contact/retention/region values. These fixtures are not approved public policy facts.
- Web full lint and TypeScript passed; final affected-file ESLint and TypeScript passed after the UI fix. Web production `npm run build -- --webpack` passed; existing middleware/Sentry build warnings remain. Local Node 23; CI uses Node 22.
- Independent read-only review found the stale UI '4 unavailable' label; new regression failed before the fix. The fix displays four measured metrics with units/reasons, preserving explicit unavailable timing. UI/ledger subset **6 passed**, final UI/ledger/backend-client subset **67 passed**. Re-review of UI, lifecycle/checkpoint and always-verified preflight/reporting changes found no further blocking finding.
- Full PostgreSQL 17 suite, final full web rerun and clean-tree evaluation receipts follow below when complete.

## Verification limits and review

All provider responses are mocked/replayed. No live inference, provider resource creation, hosted SQL, external write or billing action is included. Flush telemetry cannot persist its own outage losses; pending attempt reconciliation remains necessary. Database latency is the measured ledger-preflight query subset, not whole-database APM. Connector values are current-state counts within creation/receipt windows. USD budgets remain disabled.

The initial full web run under concurrent builds/database load: **1,861 passed, 4 failed, 5 skipped**. Three were 5 s eval timeouts; one Acted route returned 404. Source/assertions were not weakened. A full rerun with bounded workers and a 20 s command timeout is recorded separately; initial failures are retained here. Initial backend run exposed the deletion ordering bug and was superseded by the repaired full pass above.

