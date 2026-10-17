# Hosted Lifecycle Operations Acceptance Checklist (OP-6 / CB-18)

Status: **Local verification complete on disposable PostgreSQL 17; hosted execution pending human operator.**
Policy version: `cb18.v1`
Engineering Invariant: **Agents never execute hosted lifecycle deletions or database restores. Hosted execution is strictly human operator run.**

---

## 1. Scope & Invariants

This checklist governs human-run acceptance of lifecycle operations, legal holds, session-preserving private exports, bounded deletion, and backup-restore reconciliation on the hosted stack.

- **Human Approval**: Consequential deletion of customer or tenant data requires explicit human operator action.
- **Tenant Isolation**: Server-side resolved tenant identity; no header or client role claims are trusted.
- **Redacted Receipts**: Evidence retained in repository contains counts and bounded statuses only. Never log or retain transcript text, customer exports, credentials, database connection strings, or PII.
- **Direct Session Connection**: `pg_advisory_lock` requires a direct session-preserving connection (transaction-mode PgBouncer poolers fail closed).

---

## 2. Preflight Requirements

Before initiating hosted lifecycle drills:

- [ ] **Exact Deployed Revisions**: Verified matching Git SHAs deployed on FastAPI (`sioona-api-staging`) and Web (`sioona-web-staging`).
- [ ] **Database Migration Head**: Schema confirmed at `034_operational_telemetry` using `scripts.check_schema`.
- [ ] **Runtime Role Isolation**: `sioona_runtime` connection active with least privileges (`NOSUPERUSER NOBYPASSRLS`), forced RLS on all tenant tables, and append-only `audit_events`.
- [ ] **Session-Preserving Connection**: Direct PostgreSQL connection URL configured for export operations (e.g. Neon direct endpoint `ep-*.neon.tech:5432`, NOT pooler port `6543`).
- [ ] **Synthetic Target Tenants**:
  - `tenant_lifecycle_drill`: Designated disposable staging tenant containing synthetic seed conversations, messages, predictions, feedback, and supervised actions.
  - `tenant_staging_b`: Second synthetic tenant to verify cross-tenant data preservation.
- [ ] **Traffic / Ingestion Quiesced**: Real ingestion mutations stopped; providers disabled (`DETECT_LLM=0`, `LIVE_INGEST=0`, `SIOONA_EXTERNAL_ACTIONS_ENABLED=0`).

---

## 3. Human Operator Drill Sequence

Execute from repository root on operator workstation with backend `.venv` active and direct database credentials available.

### Drill 1 — Direct Session-Preserving Connection Verification

Verify that the database connection used for export acquisition can hold session-level advisory locks without escaping or pooler disconnection:

```bash
set -euo pipefail
set +x
read -r -s -p 'Hosted Migration Database URL (direct): ' HOSTED_MIGRATION_DATABASE_URL; printf '\n'
export HOSTED_MIGRATION_DATABASE_URL

python3 -c "
import os, hashlib
from sqlalchemy import create_engine, text
from urllib.parse import urlsplit

url = os.environ['HOSTED_MIGRATION_DATABASE_URL']
parsed = urlsplit(url)
if parsed.port == 6543 or 'pooler' in (parsed.hostname or ''):
    raise SystemExit('ERROR: Transaction pooler detected! Direct session connection required.')

engine = create_engine(url)
key = int.from_bytes(hashlib.sha256(b'test_tenant').digest()[:8], 'big', signed=True)
with engine.connect() as conn:
    conn.execute(text('SELECT pg_advisory_lock(:key)'), {'key': key})
    print('[OK] pg_advisory_lock acquired on direct connection.')
    conn.execute(text('SELECT pg_advisory_unlock(:key)'), {'key': key})
    print('[OK] pg_advisory_unlock released cleanly.')
"
```

- [ ] Advisory lock successfully acquired and released on direct connection.
- [ ] Port is not 6543 and host is not a transaction pooler.

---

### Drill 2 — Legal Holds Verification (API)

Verify that placing an active legal hold on a tenant blocks deletion confirmation and retention sweeps, while allowing private export downloads:

```bash
export FASTAPI_BASE_URL="https://sioona-api-staging.onrender.com"
read -r -s -p 'Staging service token: ' SIOONA_SERVICE_TOKEN; printf '\n'
read -r -s -p 'Staging actor key: ' SIOONA_ACTOR_KEY; printf '\n'
export SIOONA_SERVICE_TOKEN SIOONA_ACTOR_KEY
TARGET_TENANT="tenant_lifecycle_drill"

# 1. Place legal hold
HOLD_ID=$(curl --silent --fail-with-body -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  -H "Content-Type: application/json" \
  -d '{"reason_code":"litigation","resource_type":"tenant"}' \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/holds" | jq -r '.id')
printf 'Placed legal hold: %s\n' "$HOLD_ID"

# 2. Request deletion and attempt confirmation (MUST fail with 409 legal_hold)
DEL_ID=$(curl --silent --fail-with-body -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/deletions" | jq -r '.id')

CONFIRM_HTTP=$(curl --silent -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  -H "Content-Type: application/json" \
  -d "{\"confirmation\":\"DELETE $TARGET_TENANT\"}" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/deletions/$DEL_ID/confirm")
test "$CONFIRM_HTTP" = "409"
printf '[OK] Deletion confirmation blocked by legal hold: HTTP %s\n' "$CONFIRM_HTTP"

# 3. Attempt retention sweep (MUST fail with 409 legal_hold)
SWEEP_HTTP=$(curl --silent -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/retention/sweep")
test "$SWEEP_HTTP" = "409"
printf '[OK] Retention sweep blocked by legal hold: HTTP %s\n' "$SWEEP_HTTP"

# 4. Export creation must still succeed during legal hold
EXPORT_ID=$(curl --silent --fail-with-body -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/exports" | jq -r '.id')
printf '[OK] Export allowed during legal hold: %s\n' "$EXPORT_ID"

# 5. Release legal hold
curl --silent --fail-with-body -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/holds/$HOLD_ID/release"
printf '[OK] Legal hold released.\n'
```

- [ ] Hold successfully blocks deletion confirmation (HTTP 409 `legal_hold`).
- [ ] Hold successfully blocks retention sweep (HTTP 409 `legal_hold`).
- [ ] Export creation succeeds during active legal hold.
- [ ] Hold release succeeds.

---

### Drill 3 — Session-Preserving Export & Revocation Drill

Verify export checksum verification and atomic revocation upon confirmation:

```bash
# 1. Download export bundle privately
curl --silent --fail-with-body \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/exports/$EXPORT_ID" > /tmp/drill-export.json

# 2. Verify bundle manifest checksums offline
python3 -c "
import json, hashlib
with open('/tmp/drill-export.json') as f:
    bundle = json.load(f)
manifest = bundle['manifest']
data = bundle['data']
assert set(manifest['checksums']) == set(data)
for name, rows in data.items():
    raw = json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()
    assert hashlib.sha256(raw).hexdigest() == manifest['checksums'][name], f'Checksum mismatch on {name}'
print('[OK] Export bundle verified: all per-class SHA-256 checksums match manifest.')
"
rm -f /tmp/drill-export.json

# 3. Confirm deletion
curl --silent --fail-with-body -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  -H "Content-Type: application/json" \
  -d "{\"confirmation\":\"DELETE $TARGET_TENANT\"}" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/deletions/$DEL_ID/confirm"
printf '[OK] Deletion confirmed.\n'

# 4. Verify export is immediately revoked
EXPIRED_HTTP=$(curl --silent -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/exports/$EXPORT_ID")
test "$EXPIRED_HTTP" = "409"
printf '[OK] Export immediately revoked upon deletion confirmation: HTTP %s\n' "$EXPIRED_HTTP"
```

- [ ] Export bundle downloaded privately; all per-class SHA-256 checksums verified against manifest.
- [ ] Deletion confirmed with exact typed confirmation string.
- [ ] Export revoked atomically; subsequent download returns HTTP 409 `export_unavailable`.

---

### Drill 4 — Bounded Deletion & Interruption Recovery Drill

Advance deletion batches, verify crash recovery, shared user preservation, and capture the completed receipt:

```bash
# 1. Advance single batch (stepwise progress)
curl --silent --fail-with-body -X POST \
  -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
  -H "X-Tenant-Id: $TARGET_TENANT" \
  -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/deletions/$DEL_ID/advance" > /tmp/step1.json
printf '[OK] Step 1 advanced. Checkpoint: %s\n' "$(jq -r '.checkpoint' /tmp/step1.json)"

# 2. Advance all remaining steps to completion
while true; do
  STATUS=$(curl --silent --fail-with-body -X POST \
    -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
    -H "X-Tenant-Id: $TARGET_TENANT" \
    -H "X-Sioona-Actor: $(python backend/scripts/run_shadow_observation.py --mint-token --tenant "$TARGET_TENANT" --role admin)" \
    "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT/lifecycle/deletions/$DEL_ID/advance")
  STATE=$(echo "$STATUS" | jq -r '.state')
  if [ "$STATE" = "completed" ]; then
    echo "$STATUS" > docs/development/evidence/completed-deletion-receipt.json
    printf '[OK] Deletion completed. Receipt saved to docs/development/evidence/completed-deletion-receipt.json\n'
    break
  fi
  sleep 0.5
done
```

- [ ] Deletion advances in bounded batches across all tables in `DELETE_ORDER`.
- [ ] Interruption between steps preserves checkpoint and rolls back incomplete batch cleanly.
- [ ] Shared users with memberships in `tenant_staging_b` are preserved; solo users removed.
- [ ] Final receipt recorded with zero content text, counts-only.

---

### Drill 5 — Backup-Restore Tombstone Reconciliation Drill

Execute restore rehearsal and tombstone reconciliation before opening traffic:

1. **Restore Rehearsal**:
   - Rehearse restoring pre-deletion Neon branch / backup containing `tenant_lifecycle_drill` data to an isolated target database (`RESTORE_REHEARSAL_DATABASE_URL`).
   - Confirm pre-deletion rows exist in the restored database and that the deletion fence is absent.
2. **Execute Operator Reconciliation Primitive**:
   - Run the operator reconciliation CLI script with the externally retained trusted deletion receipt:

```bash
set -euo pipefail
set +x
read -r -s -p 'Restore target database URL: ' RESTORE_REHEARSAL_DATABASE_URL; printf '\n'

python -m scripts.operator_reconcile_tombstone \
  --database-url "$RESTORE_REHEARSAL_DATABASE_URL" \
  --tenant "tenant_lifecycle_drill" \
  --receipt docs/development/evidence/completed-deletion-receipt.json \
  --output-receipt docs/development/evidence/tombstone-reconciliation-receipt.json \
  --approved-restore-reconciliation
```

- [ ] `operator_reconcile_tombstone.py` successfully validates receipt against tenant and policy `cb18.v1`.
- [ ] Tenant is immediately re-fenced (`fenced = True`, leases cancelled, exports deleted).
- [ ] Deletion state machine replays to completion.
- [ ] Zero displayable rows remain for `tenant_lifecycle_drill` across all `DELETE_ORDER` tables.
- [ ] Unaffected `tenant_staging_b` data is verified completely unchanged (counts and PK digests identical).
- [ ] Actual elapsed recovery time is recorded and measured against RTO (4 hours) and RPO (24 hours).
- [ ] Counts-only verification receipt written to `docs/development/evidence/tombstone-reconciliation-receipt.json`.

---

## 4. Human Approval and Sign-Off Record

| Item | Required Specification | Hosted Operator Value / Receipt |
| :--- | :--- | :--- |
| **Hosted Target** | Neon project & branch IDs; Render service origin | Pending human operator |
| **Direct DB URL** | Session-preserving connection verified (not port 6543) | Pending human operator |
| **Tested Revisions** | Immutable FastAPI SHA & Web SHA | Pending human operator |
| **Legal Hold** | HTTP 409 on confirm/sweep; export allowed; release 200 | Pending human operator |
| **Export Bundle** | SHA-256 checksum manifest match; revoked at confirm | Pending human operator |
| **Bounded Deletion** | 250-row batch advance; crash resume; shared users preserved | Pending human operator |
| **Tombstone Reconciliation** | Re-fence restored rows; replay deletion; tenant B intact | Pending human operator |
| **Measured RTO / RPO** | Recovery duration $\le$ 4h; PITR window $\le$ 24h | Pending human operator |
| **Receipt Destination** | `docs/development/evidence/tombstone-reconciliation-receipt.json` | Pending human operator |
| **Sanket Approval** | Explicit sign-off on hosted lifecycle acceptance | **Pending** |
