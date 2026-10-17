# Lifecycle local verification — 2026-10-17

**Evidence for blocker 6 (hosted lifecycle and recovery gate)**

Scope: local SQLite verification of session-preserving export URL enforcement,
legal holds, export isolation/revocation, interrupted deletion recovery, and
backup-restore tombstone reconciliation. Counts-only receipts only. No hosted
database, no customer data, no provider calls.

Source revision: `faf341ee558e7e5cbac08c02596ef78857f3d8ac` (main, 2026-10-17).
Python 3.13.3. pytest-9.1.1.

---

## 1  Verification scope

The four areas of blocker 6 that can be locally demonstrated without a hosted
database or real backup snapshot:

| Area | Local proxy |
|---|---|
| Session-preserving export connection | `validate_database_url` rejects PgBouncer port 6543 and `pooler` hostnames; accepts direct postgresql/psycopg and sqlite |
| Legal holds | Hold blocks `confirm_deletion` and `sweep`; export is still allowed; hold is tenant-scoped; cross-tenant resource hold is rejected |
| Interrupted deletion | Mid-batch crash rolls back counts and checkpoint atomically; state transitions to `failed`; resume from same checkpoint completes without double-counting |
| Backup-restore reconciliation | Tombstone receipt re-fences restored tenant before any traffic; deletion state machine replays to completion; zero displayable rows verified across all `DELETE_ORDER` tables |

---

## 2  Test results — lifecycle suite (20 tests)

```
tests/test_audit_lifecycle.py::test_inventory_is_exhaustive                                PASSED
tests/test_audit_lifecycle.py::test_export_isolated_checksummed_expiring_and_revoked       PASSED
tests/test_audit_lifecycle.py::test_hold_blocks_delete_and_sweep_but_allows_export         PASSED
tests/test_audit_lifecycle.py::test_crash_resume_shared_users_and_counts_only_receipt      PASSED
tests/test_audit_lifecycle.py::test_expired_download_and_late_write_fail_closed            PASSED
tests/test_audit_lifecycle.py::test_failed_batch_rolls_back_counts_and_resumes             PASSED
tests/test_audit_lifecycle.py::test_restore_tombstone_refences_and_replays_before_traffic  PASSED
tests/test_audit_lifecycle.py::test_retention_clocks_anonymization_holds_and_batch_progress PASSED
tests/test_audit_lifecycle.py::test_export_columns_require_explicit_policy_for_schema_changes PASSED
tests/test_audit_lifecycle.py::test_another_current_admin_can_resume_without_removing_their_authority PASSED
tests/test_audit_lifecycle.py::test_resource_hold_cannot_target_another_tenants_resource   PASSED
tests/test_audit_lifecycle.py::test_manual_retention_expires_old_audit_and_financial_summaries PASSED
tests/test_audit_lifecycle.py::test_restore_receipt_is_bound_to_its_original_tenant        PASSED
tests/test_audit_lifecycle.py::test_retention_preserves_upload_referenced_by_remaining_job[True-0] PASSED
tests/test_audit_lifecycle.py::test_retention_preserves_upload_referenced_by_remaining_job[False-251] PASSED
tests/test_audit_lifecycle.py::test_export_insert_and_update_are_fenced                    PASSED
tests/test_audit_lifecycle.py::test_deleted_tenant_summary_expiry_is_completed_aged_scoped_and_held PASSED
tests/test_operator_reconcile_tombstone.py::test_validate_database_url                     PASSED
tests/test_operator_reconcile_tombstone.py::test_validate_trusted_receipt                  PASSED
tests/test_operator_reconcile_tombstone.py::test_reconciliation_e2e                        PASSED

20 passed, 0 failed, 0.93 s
```

---

## 3  Full backend suite (no regressions)

```
826 passed, 82 skipped, 1 warning in 24.19 s
```

Skipped tests are exclusively PostgreSQL-specific paths that require a live
`PG_TEST_DATABASE_URL` (migration, RLS and force-isolation tests). All 826
non-PostgreSQL tests pass without modification.

---

## 4  What each area proves

### 4.1  Session-preserving export connection

`validate_database_url` (in `operator_reconcile_tombstone.py`) enforces:
- Scheme must be `postgresql`, `postgresql+psycopg`, or `sqlite`.
- Port 6543 is rejected (`pooler_detected`).
- Hostname containing `pooler` is rejected (`pooler_detected`).

This guards the tombstone reconciliation CLI against being run over a
connection-pooler that cannot maintain advisory session locks needed for
the `pg_advisory_lock` / `pg_advisory_unlock` pair in `create_export`.

The hosted connection URL must be the direct, session-preserving Neon URL
(port 5432 or psycopg direct), not the PgBouncer pooler URL (port 6543).
Record this URL separately at hosted acceptance time.

### 4.2  Legal holds

`test_hold_blocks_delete_and_sweep_but_allows_export`:
- Places a `litigation` hold on tenant `a`.
- Confirms `create_export` succeeds (export is explicitly allowed during a hold).
- Confirms `confirm_deletion` raises `legal_hold`.
- Confirms `sweep` raises `legal_hold`.

`test_resource_hold_cannot_target_another_tenants_resource`:
- A hold for `conversation` resource `b-only` (owned by tenant `b`) raises
  `resource_not_found` when placed against tenant `a`.
- A hold for conversation `c` (owned by tenant `a`) succeeds.

`test_deleted_tenant_summary_expiry_is_completed_aged_scoped_and_held`:
- `expire_deleted_tenant_summaries` is blocked by an active `litigation` hold
  even after deletion completes and the aging threshold passes.
- Releasing the hold allows expiry to proceed.

### 4.3  Interrupted deletion recovery

`test_failed_batch_rolls_back_counts_and_resumes`:
- Advances deletion to a checkpoint with seeded evidence rows.
- Injects a crash (`RuntimeError`) after the `DELETE` statement but before
  `db.commit()` via `monkeypatch.setattr(lifecycle, 'delete_batch', crash)`.
- `wipe_tenant_data` catches the exception, calls `mark_deletion_failed`, and
  rolls back the batch. The state machine transitions to `failed`.
- Asserts checkpoint and counts are unchanged (the deleted rows were rolled back).
- Asserts the seeded `SignalEvidence` row still exists (count = 1).
- Re-enables the real `delete_batch` and resumes; deletion completes.
- Final `signal_evidence` count in the receipt is 1 (exactly one row deleted).

`test_crash_resume_shared_users_and_counts_only_receipt`:
- Verifies that a mid-run `db.close()` (simulating a process crash after commit)
  does not lose durable checkpoint state.
- Resumes from the same `advance_deletion` loop and completes.
- The shared admin user survives because they belong to tenant `b`.
- The solo user is deleted after their only membership is removed.

### 4.4  Backup-restore tombstone reconciliation

`test_restore_tombstone_refences_and_replays_before_traffic`:
1. Deletes tenant `a` to completion and saves the receipt.
2. Simulates a backup restore by deleting the `TenantDeletion` tombstone and
   re-inserting a workspace, membership, and conversation.
3. Calls `lifecycle.reconcile_tombstone(db, 'a', receipt, actor)`.
4. Asserts `restored.fenced == True` and `restored.checkpoint == 0` — tenant
   is fenced before any traffic.
5. Re-runs `advance_deletion` to completion.
6. Asserts tenant `a`'s workspace is gone and tenant `b`'s workspace survives.

`test_restore_receipt_is_bound_to_its_original_tenant`:
- Attempting `reconcile_tombstone(db, 'b', receipt_from_a, actor)` raises
  `invalid_tombstone` and does not touch tenant `b`'s data.

`test_reconciliation_e2e` (operator CLI):
- Runs `run_reconciliation` end-to-end through the CLI helper.
- Verifies `verified_empty_tables > 0` and zero remaining rows in all
  `DELETE_ORDER` tables for the tenant.

---

## 5  Limits of local verification

The following items cannot be closed by this evidence and remain explicit
hosted gates:

| Item | Why local is insufficient |
|---|---|
| Session advisory lock serialization during concurrent exports | Requires real PostgreSQL; SQLite has no advisory locks |
| `pg_advisory_lock` / `pg_advisory_unlock` on the same connection | Requires a non-pooled direct connection to live PostgreSQL |
| `cb18_remove_membership` restricted definer function | PostgreSQL-only; SQLite uses a fallback code path |
| `cb18_expire_summaries` restricted definer function | Same as above |
| Forced RLS rejects forged tenant cross-reads | Covered in `test_postgres_migrations.py` (requires `PG_TEST_DATABASE_URL`) |
| Real backup snapshot RPO/RTO measurement | Requires hosted database with real PITR |
| 4-hour RTO / 24-hour RPO targets | Not measurable in a synthetic in-memory test |
| Provider backup retention window expiry | Provider-side; no API available locally |
| Exact deployed revision match | Hosted test must record the deployed revision |

---

## 6  Policy version and disposition coverage

Policy version: `cb18.v1`

Tables with explicit dispositions: **35** (see `lifecycle.DISPOSITIONS`).
Export column allowlist covers all 35 non-excluded tables; excluded set:
`{users, pilot_requests, tenant_exports, classification_cache}`.

`test_inventory_is_exhaustive` asserts `set(lifecycle.DISPOSITIONS)
== set(Base.metadata.tables)` — no new table can be added without a policy
decision.

`test_export_columns_require_explicit_policy_for_schema_changes` asserts
that the union of `EXPORT_COLUMNS[name]` and `EXPORT_OMITTED_COLUMNS.get(name)`
equals the full column set of every exported table, and that `email`,
`provider_request_id`, and `updated_by` are not exported.

---

## 7  Operator checklist before human approval

- [ ] Operator recorded this evidence file path and source revision
  `faf341ee` in the hosted acceptance record.
- [ ] Direct (non-pooler) PostgreSQL URL confirmed; `pg_advisory_lock` tested
  on the same connection without error.
- [ ] Hosted export created, downloaded, and verified revoked on deletion
  (`confirm_deletion` deletes `TenantExport` rows atomically).
- [ ] Hosted legal hold placed, deletion blocked (`legal_hold`), hold released,
  deletion completed; counts-only receipt retained.
- [ ] Deletion interrupted at a known checkpoint (process kill or simulated
  error); resumed; receipt checkpoint advanced correctly from restart.
- [ ] Backup restore drill performed; `reconcile_tombstone` applied from the
  retained receipt before enabling traffic; zero rows verified across all
  DELETE_ORDER tables.
- [ ] RTO ≤ 4 h and RPO ≤ 24 h measured and recorded with timestamps.
- [ ] Sanket reviews and signs the exact deployed revisions.
