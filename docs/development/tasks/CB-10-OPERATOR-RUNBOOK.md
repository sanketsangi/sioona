# CB-10 hosted operator approval package and execution runbook

Status: **prepared; not executed or accepted**. CB-10 remains **in-progress**.
Repository/PR authorization from Sanket on 2026-10-14 covers publication, merges,
and the D9 specification. It does not supply a hosted target, observation window,
restore approval, provider spend, or CB-10 acceptance. Complete the table below
before an operator executes this runbook on Neon/Render. Never put secrets,
transcripts, customer exports, or credential-bearing URLs in repository evidence.

## Approval and sign-off record

| Item | Required value / evidence | Operator approval / timestamp |
| --- | --- | --- |
| Target | Neon project and branch IDs, database name; Render service ID; web project/environment ID; isolated staging or explicitly approved production | Pending |
| Tenant | Verified tenant ID and source ownership; authorized second synthetic tenant for isolation drill | Pending |
| Operator | Name, role, approver; migration owner distinct from `sioona_runtime` | Pending |
| Revisions | Immutable backend, web, previous backend and previous web SHAs; CI receipts | Pending |
| Source snapshot | Quiesced read-only snapshot location, SHA-256 manifest checksum, counts by D6 slice, capture timestamp | Pending |
| Observation window | Start/end with timezone, minimum duration, permitted traffic, success thresholds, monitor owner | Pending |
| Backup / restore | Neon backup/PITR timestamp and retention, protected source copy, restore rehearsal target and successful receipt | Pending |
| Rollback | Previous revision compatibility, pause/drain procedure, restore point, abort thresholds, rollback approver | Pending |
| Runtime / auth | Runtime role URL switch (OP-3); auth mode and isolated shadow/enforce acceptance (OP-2) or explicit residual | Pending |
| Final acceptance | Zero unexplained loss, hosted checklist receipts, observation outcome, signed CB-10 acceptance by Sanket | Pending |

The only permitted order is **Preflight → `025_detection_resume` →
`026_weekly_upload_receipts` → FastAPI revision → Web revision**. Keep ingestion
paused through reconciliation and all mixed-version checks. Do not rely on an
application deploy to run implicit migrations. Existing OP-1–OP-5 deadlines in
[Phase 2 go](../PHASE_2_GO.md) remain. D9 approves a specification; CB-11
implementation waits for signed CB-10 acceptance. Paid worker provisioning and
live provider spend need a separate operator go.

## Preflight, pause, and immutable source

Run commands from the repository root in an operator workstation with `psql`,
Alembic/backend dependencies, `curl`, `jq`, and the approved web hosting CLI.
Use protected environment bindings, disable shell tracing, and use a private
operator evidence directory outside the repository. The variables below are
required inputs, not supplied credentials or approved targets:

```bash
set -euo pipefail
set +x
: "${HOSTED_MIGRATION_DATABASE_URL:?owner URL required}"
: "${HOSTED_RUNTIME_DATABASE_URL:?sioona_runtime URL required}"
: "${FASTAPI_BASE_URL:?approved API origin}"
: "${WEB_BASE_URL:?approved web origin}"
: "${TARGET_TENANT_ID:?approved tenant}"
: "${OTHER_TENANT_ID:?second synthetic tenant}"
: "${SIOONA_SERVICE_TOKEN:?service credential}"
: "${BACKEND_GIT_SHA:?immutable revision}"
: "${WEB_GIT_SHA:?immutable revision}"
: "${SOURCE_SNAPSHOT_DIR:?protected quiesced snapshot}"
: "${OPERATOR_EVIDENCE_DIR:?private directory outside repo}"
mkdir -p "$OPERATOR_EVIDENCE_DIR"
chmod 700 "$OPERATOR_EVIDENCE_DIR"
test -z "$(git status --porcelain)"
git cat-file -e "$BACKEND_GIT_SHA^{commit}"
git cat-file -e "$WEB_GIT_SHA^{commit}"
git diff --check
(cd backend && MIGRATION_DATABASE_URL="$HOSTED_MIGRATION_DATABASE_URL" alembic current)
(cd backend && MIGRATION_DATABASE_URL="$HOSTED_MIGRATION_DATABASE_URL" alembic heads)
```

Require one code head, `026_weekly_upload_receipts`. Record the hosted current
revision; normally `024_tenant_rls`, or 025/026 if already applied. Investigate
any earlier or divergent revision before proceeding. Pin the migration checkout
to the approved backend SHA; do not move backwards if 026 is already present.

Pause upload UI access and block ingestion mutations at the hosting ingress for
all tenants sharing the deployment, including `/api/ingest`, detect/redetect,
live-ingest and backend ingestion endpoints. Disable live ingestion
(`LIVE_INGEST=0`), scheduled polls/recovery cron and automatic deploys. There is
no general CB-10 ingestion-pause flag: disabling `LIVE_INGEST` alone does not
block manual uploads or recovery. Drain active uploads, publications, `after()`
work and recovery tasks; verify active-run counts stop changing and that a
synthetic mutation is denied at ingress. Pause operator edits too. Keep providers
disabled through CB-07 controls; record zero provider attempts and zero sends.
Do not change production actor auth to enforce without OP-2 acceptance.

Capture the frozen source after draining, preserve the original read-only, and
recheck it before every slice and at the end:

```bash
(cd "$SOURCE_SNAPSHOT_DIR" && find . -type f -print0 | sort -z | xargs -0 sha256sum) \
  > "$OPERATOR_EVIDENCE_DIR/source-files.sha256"
sha256sum "$OPERATOR_EVIDENCE_DIR/source-files.sha256" \
  > "$OPERATOR_EVIDENCE_DIR/source-manifest.sha256"
(cd "$SOURCE_SNAPSHOT_DIR" && sha256sum -c "$OPERATOR_EVIDENCE_DIR/source-files.sha256")
pg_dump --dbname="$HOSTED_MIGRATION_DATABASE_URL" --format=custom \
  --file="$OPERATOR_EVIDENCE_DIR/pre-cutover.dump"
sha256sum "$OPERATOR_EVIDENCE_DIR/pre-cutover.dump" \
  > "$OPERATOR_EVIDENCE_DIR/pre-cutover.dump.sha256"
```

The dump contains protected customer data: encrypt/restrict it under the existing
backup policy, never upload it as a CI artifact. Confirm PITR and rehearse restore
on an approved disposable branch (`pg_restore --exit-on-error --no-owner
--dbname="$RESTORE_REHEARSAL_DATABASE_URL" "$OPERATOR_EVIDENCE_DIR/pre-cutover.dump"`)
with counts/hash verification. Do not use a production URL for the rehearsal.

## Apply 025, verify, then apply 026

Use only the migration owner for DDL. Execute each upgrade only if the database
is behind that revision. If it is already 026, verify both tables without running
`upgrade 025` (which would be a backward target).

```bash
(cd backend && MIGRATION_DATABASE_URL="$HOSTED_MIGRATION_DATABASE_URL" \
  alembic upgrade 025_detection_resume)
psql "$HOSTED_MIGRATION_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT version_num FROM public.alembic_version;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='detection_resume'
ORDER BY ordinal_position;
SQL
```

Require revision 025 and columns `tenant_id`, `failed_conversation_ids`,
`skipped_conversation_ids`, `updated_at`, all non-null. Then:

```bash
(cd backend && MIGRATION_DATABASE_URL="$HOSTED_MIGRATION_DATABASE_URL" \
  alembic upgrade 026_weekly_upload_receipts)
psql "$HOSTED_MIGRATION_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT version_num FROM public.alembic_version;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('detection_resume','weekly_upload_receipts')
ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.detection_resume'::regclass,
                  'public.weekly_upload_receipts'::regclass);
SQL
```

Require recorded revision 026, receipts columns `tenant_id`, `receipt_id`,
`weekly_file_count`, `created_at` (all non-null), composite primary key
`(tenant_id, receipt_id)`, and `weekly_file_count >= 0` check. Both migrations
are additive. On error stop, inspect the recorded revision/catalog and repair
owner permissions before retrying the explicit target. Never downgrade a shared
host or discard receipts to recover an application deployment.

## Ten-table RLS and runtime verification

```bash
psql "$HOSTED_MIGRATION_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname='sioona_runtime';
WITH expected(name) AS (VALUES
 ('messages'),('conversations'),('signal_predictions'),('signal_feedback'),
 ('supervised_action_decisions'),('detection_runs'),('inference_attempts'),
 ('signal_evidence'),('detection_resume'),('weekly_upload_receipts'))
SELECT e.name, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) AS owner,
       has_table_privilege('sioona_runtime',c.oid,'SELECT') AS can_select,
       has_table_privilege('sioona_runtime',c.oid,'INSERT') AS can_insert,
       has_table_privilege('sioona_runtime',c.oid,'UPDATE') AS can_update,
       has_table_privilege('sioona_runtime',c.oid,'DELETE') AS can_delete
FROM expected e LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.name
ORDER BY e.name;
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN (
 'messages','conversations','signal_predictions','signal_feedback',
 'supervised_action_decisions','detection_runs','inference_attempts',
 'signal_evidence','detection_resume','weekly_upload_receipts')
ORDER BY tablename, policyname;
SQL
```

Require exactly ten catalog rows with RLS enabled and forced, matching
`tenant_isolation` USING/WITH CHECK based on
`current_setting('app.tenant_id', true)`, CRUD grants, and owners distinct from
`sioona_runtime`. Require `NOSUPERUSER`, `NOBYPASSRLS`; LOGIN is enabled by the
operator out of band for OP-3. Other canonical tables (pilot/taxonomy) still need
API authority checks; this ten-table list does not claim they have D8 policies.

Connect with the actual runtime URL, not owner `SET ROLE` alone:

```bash
psql "$HOSTED_RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v tenant="$TARGET_TENANT_ID" <<'SQL'
SELECT current_user;
BEGIN;
SELECT count(*) AS missing_scope_rows FROM public.detection_resume;
SELECT count(*) AS missing_scope_receipts FROM public.weekly_upload_receipts;
SELECT set_config('app.tenant_id', :'tenant', true);
SELECT count(*) AS wrong_tenant_rows FROM public.detection_resume
WHERE tenant_id <> current_setting('app.tenant_id', true);
SELECT count(*) AS wrong_tenant_receipts FROM public.weekly_upload_receipts
WHERE tenant_id <> current_setting('app.tenant_id', true);
ROLLBACK;
SQL
```

Require `current_user=sioona_runtime` and all four counts zero. On isolated
staging, repeat missing-scope and cross-tenant reads/writes for all ten tables
using two persisted synthetic tenants; cross-tenant writes must fail and missing
scope reads return zero. Empty tables alone cannot prove isolation. Attach
bounded counts and denial status, never row contents.

## Deploy FastAPI revision and smoke test before web

Use the approved existing Render service and protected API token. Set runtime
`DATABASE_URL` to the accepted runtime-role URL, retain the owner URL only for
explicit operator migration tooling, and preserve service-token/actor settings.
Disable automatic deploys and implicit migration commands first.

```bash
: "${RENDER_SERVICE_ID:?approved existing backend service}"
: "${RENDER_API_KEY:?operator credential}"
jq -n --arg sha "$BACKEND_GIT_SHA" '{commitId:$sha}' \
  > "$OPERATOR_EVIDENCE_DIR/backend-deploy-request.json"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $RENDER_API_KEY" -H 'Content-Type: application/json' \
  --data-binary @"$OPERATOR_EVIDENCE_DIR/backend-deploy-request.json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  > "$OPERATOR_EVIDENCE_DIR/backend-deploy.json"
BACKEND_DEPLOY_ID=$(jq -er '.id' "$OPERATOR_EVIDENCE_DIR/backend-deploy.json")
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys/$BACKEND_DEPLOY_ID" \
  > "$OPERATOR_EVIDENCE_DIR/backend-deploy-status.json"
jq '{id,status,commit}' "$OPERATOR_EVIDENCE_DIR/backend-deploy-status.json"
curl --fail --silent --show-error "$FASTAPI_BASE_URL/health"
```

Repeat the status GET until `live`, abort on failure; verify `.commit.id` equals
the full backend SHA. A health 200 alone does not identify the deployed revision.
Refresh the signed actor assertion for every smoke request when enforce is
accepted (HS256 D1 assertions expire after 60 seconds). Use a verified operator
membership; tenant headers are not authority.

```bash
: "${SIGNED_ACTOR_TOKEN:?fresh operator assertion}"
for resource in detection-resume pilot; do
  code=$(curl --silent --show-error \
    -H "Authorization: Bearer $SIOONA_SERVICE_TOKEN" \
    -H "X-Tenant-Id: $TARGET_TENANT_ID" \
    -H "X-Sioona-Actor: $SIGNED_ACTOR_TOKEN" \
    -o "$OPERATOR_EVIDENCE_DIR/$resource.json" -w '%{http_code}' \
    "$FASTAPI_BASE_URL/v1/tenants/$TARGET_TENANT_ID/$resource")
  case "$code" in
    200) jq -e 'type == "object"' "$OPERATOR_EVIDENCE_DIR/$resource.json" >/dev/null ;;
    404) if [ "$resource" = detection-resume ]; then detail=detection_resume_not_found;
         else detail=pilot_settings_not_found; fi
         jq -e --arg detail "$detail" '.detail == $detail' \
           "$OPERATOR_EVIDENCE_DIR/$resource.json" >/dev/null ;;
    *) printf 'Smoke failure: %s HTTP %s\n' "$resource" "$code"; exit 1 ;;
  esac
done
```

A generic route 404 or `database_unavailable` is a rollout failure, not empty
canonical state. Protected response files may contain pilot notes/IDs: publish
only statuses/counts. In accepted enforce mode, reuse tenant A's assertion with
both path and header set to tenant B; expect 403. Also check missing/invalid
assertions are denied, and authorized B cannot see A. Header/path mismatch alone
only proves the header gate. If auth is off/shadow, record that OP-2 is open and
do not claim verified actor isolation from that check.

On synthetic staging, use `/pilot` PUT with `update_scope="baseline"` and confirm
it preserves upload-owned count/filename; use `update_scope="upload"` and confirm
it preserves baseline. The HTTP body uses `update_scope`, not the web helper's
`overwriteUploadMetadata` option. Confirm locked `?merge=true` Adapt saves retain
both concurrent additions. Keep production edits frozen during these drills.

## Deploy web, reconcile while quiesced, then observe

Use the approved hosting project, with `SIOONA_STATE_MODE=postgres`, taxonomy
Neon writes enabled, backend origin/service token, and the previously accepted
auth mode. Preserve `LIVE_INGEST=0` and ingress pause. Do not change auth policy
as a side effect of deploying CB-10.

In the Render dashboard, select the approved `sioona-web` service/environment and
manually deploy the exact approved `WEB_GIT_SHA`. Follow `web/DEPLOY.md` for build
and environment configuration. Require the deployment to be live, read back the
full Git SHA and service/environment, and confirm the approved hostname points
to it. Record the deployment ID and full SHA in the operator evidence directory.
Authenticate to the web
with the approved synthetic operator session; verify dashboard, Insights, Eval
and pilot, including an unset tenant with no fabricated demo settings. A login
redirect or plain curl 200 does not prove dashboard reconstruction.

### Quiesced D6 reconciliation: zero unexplained loss

Retain pause until every slice passes. Read the source snapshot offline and read
Postgres under the verified tenant scope in a consistent read-only transaction.
Compare counts, stable identity sets, duplicate identities and normalized
SHA-256 values; never publish raw records. Normalization must preserve exact
message content/code-point offsets, ownership, null/absent distinctions and
UTC timestamp equivalence. Investigate missing, extra, changed and target-only
rows. Every target-only row needs documented provenance; zero unexplained loss
is mandatory. Missing shadow reports mean **not compared**, never equality.

| D6 order | Required comparisons and cutover evidence |
| --- | --- |
| Conversations/messages | Counts, conversation/message IDs and ownership, exact text/role/metadata/timestamp hashes; predictions, evidence offsets/content hashes and detection runs. Use `reconcileConversationData` and both `conversationShadow`/`conversationViewShadow` reports through `loadStore({shadowConversations:true})` where available. Compare keep-set, channel/GT filters, stable 50-row pages, SignalScore numerator/denominator. |
| Feedback/decisions | Counts and identity sets, verdict, reviewed/acted timestamps, edited/dismissed/approved-unsent decisions, outcomes, links to persisted signals; UI overlays match Postgres with no JSON fallback. |
| Pilot | Baseline opportunities/notes, authoritative weekly count, filename, null/empty semantics. Compare receipt identity/count baseline and document historical uploads lacking receipts; do not invent receipts or reset counters. |
| Taxonomy | Active tenant overrides, phrase identity/hash sets, activation and ownership; concurrent Adapt merge retains additions, unavailable canonical reads fail closed. |
| Remaining JSON | Inventory every field/cache from CB-10 entity map: upload manifests/status, failed/skipped resume IDs, runs, signal/evidence and derived state. Classify each as canonical, derived/reconstructible, or demo-only with rationale. No unexplained operational field may be discarded. |

The existing conversation shadow helper does not reconcile every D6 entity.
For other slices prepare a reviewed read-only comparator using the frozen source
and tenant-scoped API/SQL, recording comparator revision, normalization rules,
counts/hashes and mismatches. There is no all-slice backfill CLI in this package.
If data is missing, stop and prepare a separately reviewed transaction-safe
repair/backfill with source provenance and rollback; never silently overwrite
canonical rows or import demo/sample data into a live tenant. Re-run comparisons
after repairs against the same source. Copy the snapshot only to an approved
protected shadow location; runtime JSON must never serve as a fallback/writer.

### Hosted verification and observation checklist

- [ ] Both migrations/catalog receipts, ten-table RLS/grants and runtime role verified.
- [ ] Backend-before-web revision receipts; ingestion pause/drain held throughout mixed versions.
- [ ] All five D6 slices compared, zero unexplained missing/changed/extra rows, source checksum unchanged; count/hash and UI view parity signed.
- [ ] Fresh web **process/container** restart with new PID/deployment and clean runtime data directory, no `store*.json`; conversations, predictions, evidence, feedback/decisions, pilot, taxonomy and resume reconstruct without inference. Repeat authenticated dashboard/Eval views and canonical counts/hashes.
- [ ] Staging database/API outage produces recoverable error and generic 404 fails closed; restore connectivity and Retry refetches canonical data. Failed/skipped conversation IDs survive restart and recovery publishes only unpublished IDs. No silent JSON fallback.
- [ ] Tenant A/B seeded isolation: actor, API and runtime SQL reads/writes denied across tenants; missing tenant scope returns zero; demo cannot overwrite live state. Record any OP-2 residual explicitly.
- [ ] Weekly receipts: new synthetic weekly publication increments once; replay same upload ID, retry after commit and resume add zero; two distinct concurrent publications both count exactly once. Receipt insertion and pilot increment roll back together on failure; baseline/filename ownership preserved. Keep provider calls disabled, use deterministic/synthetic data.
- [ ] Zero sends and zero provider attempts verified from counters/audit/ledger for the rehearsal; nothing auto-sends, Approve remains decision-only and Acted display-only. Gateway, v3 prompts, CB-08 evidence and `SignalScore >= 80%` (`n >= 5`) unchanged.
- [ ] Reopen only approved ingestion traffic after parity and matching revisions; observe through the signed window with counts-only shadow diagnostics, error/retry/resume/receipt metrics and no JSON writes. Any unexplained mismatch aborts acceptance.
- [ ] Post-observation **writer-removal PR** opened separately: remove residual production JSON/dual-writer/shadow paths per entity map after proven parity, preserve local demo mode and reviewed rollback. Record its review/checks; do not treat this code merge as that step.
- [ ] Sanket signs CB-10 acceptance after the hosted receipts and observation; only then update CB-10 from in-progress and lift the CB-11 implementation gate.

## Abort, rollback, and evidence handoff

Abort on schema/RLS/grant mismatch, wrong revision, auth leakage, unreconciled
rows, counter drift, JSON writes or sends. Keep ingress/cron paused, disable
provider allowance, drain in-flight work and retain source/evidence. Roll back
the web first, then the backend to the signed compatible pair; leave additive
025/026 schema and durable receipts in place. Older clients can use obsolete
counter semantics, so **do not reopen ingestion** on an incompatible rollback.
Never switch production to `json-demo`. If a data restore is necessary, get the
recorded restore approver, restore to an isolated Neon branch, reconcile all
writes since backup and verify counts/hashes before switching both applications.
Do not point an old web process at a new backend during rollback with traffic on.

Final bounded receipt: target/tenant/operator, source manifest checksum, backup
and restore receipts, migration revisions/catalog results, runtime/auth mode,
backend/web deployment IDs and SHAs, reconciliation comparator SHA and counts,
restart/outage/isolation/receipt drill results, zero-send counters, observation
start/end and monitor outcome, rollback decision, writer-removal PR link and
Sanket's signed acceptance. Unfilled approvals and unexecuted checks stay pending.

## OP-3 guarded populated upgrade helper (024 through 034)

`backend/scripts/operator_production_upgrade.py` supports a single known Alembic
revision on the ancestry from `024_tenant_rls` through
`034_operational_telemetry`, including both `027_complete_tenant_rls` and
`027_jobs`. It never creates a database or seeds application data. This helper
is an operator action; agents must not execute it against a hosted target.

Complete the target approval, restorable backup/restore rehearsal and rollback
record above first. Stop API traffic, ingestion, worker claims and recovery cron.
Using the protected operator environment, supply `HOSTED_MIGRATION_DATABASE_URL`
with the direct owner URL, `SIOONA_RUNTIME_PASSWORD`, and
`OP3_APPROVED_DATABASE` with the exact database name. Set
`OP3_BACKUP_RESTORE_VERIFIED=1`, `OP3_WRITERS_STOPPED=1` and
`ALLOW_SHARED_RUNTIME_ROLE=1` only after approving those conditions. The last
flag approves cluster-wide password rotation: check all consumers and sibling
databases before setting it. A pooler target or libpq target override is rejected.
Do not put credentials in shell command arguments, receipts or source files.

Run from the repository root:

```sh
python backend/scripts/operator_production_upgrade.py
```

The helper takes bounded exclusive locks on all existing public tables, streams
ordered primary keys into SHA-256 digests, and compares counts and digests before
and after the pinned upgrade in the same transaction. Every existing application
table must have a primary key; `alembic_version` is checked separately. The
migration owner must bypass forced RLS to see every tenant's rows. This proves
row identity preservation, not equality of non-key fields; reviewed migrations
may intentionally update lifecycle checkpoints. The locks support the stopped
writer window; they do not replace stopping writers or a restorable backup.

Before commit it checks restricted runtime attributes, role memberships,
relation ownership, effective audit SELECT/INSERT and denied UPDATE/DELETE/
TRUNCATE (including column UPDATE), forced RLS on all public tenant tables and
zero rows with missing tenant context. It then opens a real runtime LOGIN
connection through `scripts.check_schema`. No broad grants are added. Migration
grants remain authoritative; unsafe privileges require operator repair.

Only after all checks pass is a counts-only receipt atomically written to
`docs/development/evidence/production-upgrade-receipt.json`. It contains no
connection identifiers, tenant identifiers, table names, primary-key digests or
source text. `RECEIPT_PATH` can select a fresh path; existing receipts are never
overwritten. A failed pre-commit check rolls back the upgrade and role change.
A failed runtime connection/schema check or receipt publication can occur after
commit: investigate current revision and runtime state before retrying; never
perform an automatic downgrade. No receipt is committed as hosted proof by this
implementation. The Render runtime URL switch, API/worker/web acceptance,
tenant A/B application checks and final OP-3 sign-off remain operator steps.
