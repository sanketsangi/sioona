# Pilot operator handoff

Prepared 18 October 2026. Commands below are human-run hosted operations, not executed acceptance. Keep private credentials in the operator environment; disable shell tracing. Do not commit raw output, credentials, customer exports or tenant identifiers.

## Target and rollout gates

The retained bootstrap receipt records zero initial public tables, migration `034_operational_telemetry`, six synthetic memberships and runtime isolation checks. Do not replay empty bootstrap on that populated target. Read back the exact target, backup policy, cost and deployed revisions before any operation. Existing production auto-deployment is a separate release risk; staging approval does not authorize production deployment.

Required safety configuration: `DETECT_LLM=0`, `LIVE_INGEST=0`, `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`, `SIOONA_DETECTION_EXECUTION=inline`, `SIOONA_WORKER_PAUSE=1`. Keep migration owner credentials separate from the restricted direct runtime connection. Backend AGENTS.md reserves hosted SQL and migrations for the human operator.

## OP-2: actor observation and permission checks

Supply approved `STAGING_API_URL`, `STAGING_WEB_URL`, `SIOONA_SERVICE_TOKEN` and `SIOONA_ACTOR_KEY` privately. These runners send synthetic writes; `--dry-run` is a short live run, not a no-op.

```bash
backend/.venv/bin/python backend/scripts/run_shadow_observation.py \
  --base-url "$STAGING_API_URL" --duration 30 --receipt /tmp/staging-shadow.json
backend/.venv/bin/python backend/scripts/operator_staging_auth_checks.py \
  --base-url "$STAGING_API_URL" --web-url "$STAGING_WEB_URL" \
  --receipt /tmp/staging-auth.json
```

Human acceptance still needs session refresh past TTL, clean actor logs, revocation/permission checks, tenant A/B and demo lifecycle reset, persisted review reload and no sends. For live membership revocation, set the approved direct owner URL privately; its database mutation is operator-only.

## OP-3 / CB-10: populated upgrade and runtime cutover

Before running, set private `HOSTED_MIGRATION_DATABASE_URL` and `SIOONA_RUNTIME_PASSWORD`. Set `OP3_APPROVED_DATABASE` to the exact approved target database and explicitly acknowledge `OP3_BACKUP_RESTORE_VERIFIED=1`, `OP3_WRITERS_STOPPED=1`, `ALLOW_SHARED_RUNTIME_ROLE=1`. Choose a new receipt destination; never overwrite earlier proof.

```bash
RECEIPT_PATH=/tmp/populated-upgrade.json \
  backend/.venv/bin/python backend/scripts/operator_production_upgrade.py
```

The script does not switch deployed runtime URLs. Follow `tasks/CB-10-OPERATOR-RUNBOOK.md` for entity reconciliation, forced-RLS tenant isolation, missing context, connection reuse, one writer, observation and restart/outage proof without runtime JSON. Remove legacy writers only after the observation gate. A post-commit receipt/runtime failure requires investigation, not automatic downgrade. Sanket signs CB-10 acceptance separately.

## OP-4: provider-free admission drill

Use an exclusive approved synthetic staging window. The runner changes inference controls and finishes paused; check final pauses even on failure.

```bash
DETECT_LLM=0 backend/.venv/bin/python backend/scripts/operator_staging_op4_drill.py \
  --base-url "$STAGING_API_URL" --receipt /tmp/staging-admission.json \
  --approved-staging-drill --confirmed-provider-disabled
```

Complete `OP4_HOSTED_ACCEPTANCE_CHECKLIST.md`: pause propagation within 60 seconds, 500/day and 120/run exhaustion, concurrent admission, outage/resumption, application-cache/worker propagation, alert delivery and provider/ledger reconciliation. A pending-verification receipt is not acceptance.

## CB-18: lifecycle and restore

Follow `HOSTED_LIFECYCLE_ACCEPTANCE.md` on explicitly designated synthetic tenants. Verify a direct session-preserving export connection; test legal holds, export/revocation, bounded deletion and interruption recovery. Restore a real backup to the approved isolated target with traffic stopped before replaying trusted completed deletion receipts:

```bash
backend/.venv/bin/python backend/scripts/operator_reconcile_tombstone.py \
  --tenant "$RESTORED_TENANT_ID" --receipt "$TRUSTED_DELETION_RECEIPT" \
  --actor-id "$OPERATOR_ACTOR_ID" --approved-restore-reconciliation \
  --output-receipt /tmp/tombstone-reconciliation.json
```

Measure recovery against the 4-hour RTO and 24-hour RPO targets; local tests do not establish those measurements. Retain trusted deletion receipts outside the restored database.

## Read-only evidence summary

Explicitly provide each local receipt; the command does not discover credentials, access databases, call providers, or write files:

```bash
backend/.venv/bin/python backend/scripts/summarize_operator_receipts.py \
  --receipt docs/development/evidence/staging-bootstrap-receipt.json \
  --receipt /tmp/staging-shadow.json --receipt /tmp/staging-auth.json
```

Only fixed allowlisted booleans, aggregate counts, bounded statuses and recognized revisions are printed. Missing fields mean unrecorded evidence and may not apply to every receipt type. `source_sha`, when recorded, must be a full Git SHA; absent source revision stays unrecorded. A receipt's sign-off boolean is reported as recorded but unverified, never as accepted. Exit zero means parsing succeeded, not launch approval. Review original sanitized receipts alongside immutable deployment evidence and obtain human sign-off.
