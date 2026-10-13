# CB-10 Operator Rollout Runbook — Hosted Canonical Postgres Cutover

This runbook defines the exact 5-step operator command sequence for executing and signing off the hosted rollout of **CB-10 (Canonical Postgres Operations)** across all D6 slices.

> [!IMPORTANT]
> **Operator Invariants**
> - **Execution Order:** Step 1 (Schema Read-Only) → Step 2 (Apply Migration) → Step 3 (Verify Schema & Grants) → Step 4 (Deploy FastAPI Revision) → Step 5 (Deploy Web Revision & Reconcile). Never deploy Web before FastAPI routes are live, and never combine application deployment with implicit migration execution.
> - **Separation of Roles:** Use `MIGRATION_DATABASE_URL` (table owner with DDL privileges) exclusively for Alembic migrations. The application runtime connects via `DATABASE_URL` using `sioona_runtime`, which has no DDL permissions and is subject to Row Level Security (`CB-04`).
> - **Zero Loss & Zero JSON Writer:** In `SIOONA_STATE_MODE=postgres`, Postgres is the sole writer for operational state. No customer data is dropped or unmetered. Production refuses `json-demo` at boot.
> - **Confidentiality:** Never log or commit raw transcripts, secrets, customer exports, or database connection strings containing credentials.
> - **Pilot Invariant:** Nothing auto-sends. Human keep-set claim remains `SignalScore >= 80%` with `n >= 5`.

---

## 0. Operator Pre-flight & Target Identification

Set and record the target environment variables in the operator shell. Do not output values containing passwords or secrets.

```bash
# 1. Database connection strings (replace placeholders; do not echo credentials)
export HOSTED_MIGRATION_DATABASE_URL="postgresql://owner_user:owner_secret@ep-hosted.neon.tech/sioona_db?sslmode=require"
export HOSTED_RUNTIME_DATABASE_URL="postgresql://sioona_runtime:runtime_secret@ep-hosted.neon.tech/sioona_db?sslmode=require"

# 2. Service endpoints
export FASTAPI_BASE_URL="https://api-staging.sioona.com"
export WEB_BASE_URL="https://app-staging.sioona.com"

# 3. Target tenant and operator principal
export TARGET_TENANT_ID="tenant_staging"
export SIGNED_ACTOR_TOKEN="<SHORT_LIVED_SIGNED_HS256_ACTOR_TOKEN>"

# 4. Immutable application revisions
export BACKEND_GIT_SHA="<FASTAPI_COMMIT_SHA>"
export WEB_GIT_SHA="<WEB_COMMIT_SHA>"
```

Confirm Neon point-in-time recovery (PITR) / snapshot is current, providers are disabled or budget-capped (`CB-07`), and no active ingestion runs are executing for `$TARGET_TENANT_ID`.

---

## Step 1: Read-Only Check of Hosted Neon `alembic current` and `alembic heads`

Verify the current schema state on Neon without applying changes.

```bash
cd backend

# Inspect current applied revision on target database
MIGRATION_DATABASE_URL="$HOSTED_MIGRATION_DATABASE_URL" alembic current

# Inspect target migration heads declared in codebase
MIGRATION_DATABASE_URL="$HOSTED_MIGRATION_DATABASE_URL" alembic heads
```

### Verification Criteria
1. `alembic current` displays `024_tenant_rls` (or verified prior head).
2. `alembic heads` displays exactly `025_detection_resume (head)`.
3. Confirm there is exactly one head and no divergent migration branch.

---

## Step 2: Apply Additive Migrations Through `025_detection_resume`

Apply additive schema changes using the table owner migration connection.

```bash
cd backend

# Execute forward migration to head
MIGRATION_DATABASE_URL="$HOSTED_MIGRATION_DATABASE_URL" alembic upgrade head
```

### Execution Details & Recovery Rules
- Migration `025_detection_resume` creates table `detection_resume` (`tenant_id`, `failed_conversation_ids`, `skipped_conversation_ids`, `updated_at`).
- Grants `SELECT, INSERT, UPDATE, DELETE` to role `sioona_runtime`.
- Enables and forces Row Level Security (`FORCE ROW LEVEL SECURITY`) with policy `tenant_isolation`.
- **Recovery rule:** This migration is strictly additive. If migration execution is interrupted or encounters an error, do **not** run `downgrade` against a shared or staging database. Diagnose the owner role permissions and re-run `alembic upgrade head`.

---

## Step 3: Verify `alembic_version`, Table Presence, RLS Policies, and Grants

Confirm database catalog state using `psql` with the migration owner URL.

### 3.1 Verify Recorded Migration Head
```bash
psql "$HOSTED_MIGRATION_DATABASE_URL" -c "
  SELECT version_num FROM alembic_version;
"
```
*Expected output:* `025_detection_resume`

### 3.2 Verify `detection_resume` Table Schema
```bash
psql "$HOSTED_MIGRATION_DATABASE_URL" -c "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'detection_resume'
  ORDER BY ordinal_position;
"
```
*Expected columns:*
- `tenant_id` (`text` / `character varying`, `NO`)
- `failed_conversation_ids` (`json` / `jsonb`, `NO`)
- `skipped_conversation_ids` (`json` / `jsonb`, `NO`)
- `updated_at` (`timestamp with time zone`, `NO`)

### 3.3 Verify RLS is Enabled and Forced
```bash
psql "$HOSTED_MIGRATION_DATABASE_URL" -c "
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
  WHERE relname = 'detection_resume';
"
```
*Expected output:* `relrowsecurity = true`, `relforcerowsecurity = true`.

### 3.4 Verify Tenant Isolation Policy
```bash
psql "$HOSTED_MIGRATION_DATABASE_URL" -c "
  SELECT policyname, tablename, permissive, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE tablename = 'detection_resume';
"
```
*Expected output:* Policy `tenant_isolation` with `USING (tenant_id = current_setting('app.tenant_id', true))` and matching `WITH CHECK`.

### 3.5 Verify `sioona_runtime` Grants
```bash
psql "$HOSTED_MIGRATION_DATABASE_URL" -c "
  SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_name = 'detection_resume' AND grantee = 'sioona_runtime'
  ORDER BY privilege_type;
"
```
*Expected output:* Grants for `DELETE`, `INSERT`, `SELECT`, and `UPDATE`.

### 3.6 Verify Complete 9-Table RLS Suite
```bash
psql "$HOSTED_MIGRATION_DATABASE_URL" -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'messages',
      'conversations',
      'signal_predictions',
      'signal_feedback',
      'supervised_action_decisions',
      'detection_runs',
      'inference_attempts',
      'signal_evidence',
      'detection_resume'
    )
  ORDER BY tablename;
"
```
*Expected output:* Exactly 9 rows, all with `rowsecurity = true`.

---

## Step 4: Deploy FastAPI Revision First & Verify Tenant-Scoped Responses

Deploy backend revision `$BACKEND_GIT_SHA` to hosting (e.g. Render). Once the revision is live, verify the endpoints.

### 4.1 Health Check
```bash
curl -f -s "$FASTAPI_BASE_URL/health" || curl -f -s "$FASTAPI_BASE_URL/v1/health"
```

### 4.2 Verify `/detection-resume` Unset Cursor (404)
When no cursor has been written for `$TARGET_TENANT_ID`, the API must return HTTP 404 with detail `detection_resume_not_found`. (A 500 error indicates missing migration 025).

```bash
curl -i -s \
  -H "X-Tenant-Id: $TARGET_TENANT_ID" \
  -H "X-Sioona-Actor: $SIGNED_ACTOR_TOKEN" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT_ID/detection-resume"
```
*Expected HTTP status:* `404 Not Found`
*Expected JSON body:* `{"detail":"detection_resume_not_found"}`

### 4.3 Verify Cross-Tenant Isolation (403 Forbidden)
Assert that mismatched tenant header vs URL path is refused server-side.

```bash
curl -i -s \
  -H "X-Tenant-Id: tenant_unauthorized" \
  -H "X-Sioona-Actor: $SIGNED_ACTOR_TOKEN" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT_ID/detection-resume"
```
*Expected HTTP status:* `403 Forbidden`

### 4.4 Verify `/pilot` Endpoint and Update Scope Boundary
Verify pilot settings response and field preservation rules:
- Unset pilot settings return HTTP 404 with detail `pilot_settings_not_found`.
- Baseline edits (`baseline_opportunities`, `baseline_note`) must preserve existing remote upload metadata (`weekly_export_count`, `last_uploaded_file_name`).
- Upload metadata updates (`overwriteUploadMetadata: true`) persist export counts and file names without wiping configured baseline notes.

```bash
# Read current pilot settings for target tenant
curl -i -s \
  -H "X-Tenant-Id: $TARGET_TENANT_ID" \
  -H "X-Sioona-Actor: $SIGNED_ACTOR_TOKEN" \
  "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT_ID/pilot"
```

---

## Step 5: Deploy Matching Web Revision, Run Quiesced Zero-Loss Reconciliation, and Verify Reconstruction

Deploy web revision `$WEB_GIT_SHA` configured with:
```bash
SIOONA_STATE_MODE=postgres
SIOONA_ACTOR_AUTH=enforce
DATABASE_URL="$HOSTED_RUNTIME_DATABASE_URL"
```

### 5.1 Boot Integrity Verification
Inspect web container boot logs. Verify that `instrumentation.ts` registers cleanly and verifies `assertValidStateModeAtBoot()`.
Confirm that any attempt to boot in production with `SIOONA_STATE_MODE=json-demo` fails closed with `ProductionRefusesJsonDemoError`.

### 5.2 Quiesced Zero-Loss Reconciliation Across All D6 Slices
With ingestion quiesced for `$TARGET_TENANT_ID`, run the canonical store load with shadow comparison (`shadowConversations: true`):

1. **Slice 1 (Conversations & Messages):**
   - Source counts and target counts match exactly.
   - Message text, role, ownership, and normalized timestamp hashes match (`reconcileConversationData.equal === true`).
   - `missingConversations` is empty (`[]`).
   - `missingMessages` is empty (`[]`).
   - `changedConversations` is empty (`[]`).
   - `changedMessages` is empty (`[]`).
2. **Slice 2 (Feedback & Supervised Decisions):**
   - Verified that operator feedback decisions (`approved`, `edited`, `dismissed`) and `supervised_action_decisions` are read canonically from Postgres.
   - Verify that UI overlays persisted decisions and does not fall back to JSON.
3. **Slice 3 (Pilot Settings):**
   - Pilot baseline opportunities, notes, and upload counts hydrate directly from Postgres `pilot_settings`.
   - `putPilotSettings` updates Postgres without invoking `writeStore`.
4. **Slice 4 (Taxonomy Overrides):**
   - Active tenant taxonomy overrides hydrate from Postgres `taxonomy_overrides`.
   - Mutations fail closed if `SIOONA_TAXONOMY_NEON=0` in Postgres mode.
5. **Slice 5 (Store Cache & Zero JSON Writes):**
   - Confirm `writeStore` is a no-op in Postgres mode.
   - Confirm no `data/store*.json` files are created or updated in the application environment.

### 5.3 Multi-Process Cold-Start Dashboard Reconstruction Check
1. Restart the Web service or trigger a cold container restart.
2. In a clean browser session (or via curl with authenticated session cookie):
   ```bash
   curl -i -s -H "Host: app-staging.sioona.com" "$WEB_BASE_URL/"
   ```
3. Verify HTTP 200 response with full dashboard reconstruction:
   - Conversations and messages displayed.
   - Predictions and evidence anchors rendered from Postgres without re-running inference.
   - Feedback and supervised action badges accurately reflect persisted records.

---

## CB-10 Acceptance Sign-Off

Record completion details below. Do not include database passwords or customer conversation text.

- **Staging / Target Tenant:** `__________________________`
- **Hosted Migration Revision:** `025_detection_resume`
- **FastAPI Revision (Git SHA):** `__________________________`
- **Web Revision (Git SHA):** `__________________________`
- **Execution Timestamp (UTC):** `__________________________`
- **Operator Name / Role:** `__________________________`

### Checklist Boxes
- [ ] **Step 1:** Read-only check of hosted Neon `alembic current` and `alembic heads` verified.
- [ ] **Step 2:** Additive migration `025_detection_resume` applied successfully.
- [ ] **Step 3:** `alembic_version` (025), table schema, 9 RLS policies, and `sioona_runtime` grants verified.
- [ ] **Step 4:** FastAPI revision deployed first; tenant-scoped `/detection-resume` (404 missing, 403 isolation) and `/pilot` verified.
- [ ] **Step 5:** Web revision deployed in `postgres` mode; quiesced zero-loss reconciliation check passed across all D6 slices; multi-process cold-start verified without runtime JSON.
- [ ] **Invariants Preserved:** Zero customer data lost; no unmetered LLM calls; no auto-sends; human keep-set claim preserved.
