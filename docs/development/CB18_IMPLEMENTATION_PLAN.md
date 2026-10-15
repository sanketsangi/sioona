# CB-18 approval packet — audit, retention, export, and deletion

Prepared 2026-10-15 against main `f281d6cf5b956cd1118a1cd998d0d9cca518ba3e`.
**Proposal only. No Phase 3 implementation or decision approval is recorded.**

## Entry gates and dependency graph

Cookbook §10 requires CB-03 and CB-10 plus approved D11 for CB-18.
CB-03 code is merged, but staging enforcement acceptance remains open. CB-10 code
is merged, but hosted reconciliation, observation, restart/outage checks, writer
removal and Sanket's signed acceptance remain open. Offline green alone cannot
satisfy these gates. Supply the acceptance receipts or explicitly approve a
local-only implementation exception with hosted execution still prohibited.

The graph in §6.2 is: CB-03 + CB-10 → CB-18 → CB-17; CB-11 → CB-16;
CB-11 → CB-17; CB-16 + CB-17 → CB-19. The full card text additionally requires
CB-03/07/11 for CB-16 and CB-03/08/11/18 for CB-17. CB-19 requires foundations
and approved integrations, not CB-16 alone. CB-18 is the next audit prerequisite;
it does not authorize either integration.

D11 is the specific policy decision for CB-18. D10 remains not approved for
CB-16/17. The introductory §10 demand/authorization rule should be clarified in
the approval: authorize internal lifecycle/audit work independently, without
choosing or enabling live/outbound integrations. Neither an approved draft nor
CB-18 audit infrastructure grants permission to send.

## Exact inputs Sanket must approve

Record a dated decision with approver, policy version, effective date, scope,
review date and owner. The following fields must have concrete answers before
lifecycle implementation; no retention period is inferred from a build fixture.

1. **Implementation scope and prerequisite evidence.** Provide CB-03 staging and
   signed CB-10 acceptance receipt links, or approve a local-only exception.
   Choose audit-only first versus audit plus lifecycle; approve the staged plan
   below. State explicitly that D10 and hosted execution remain separate.
2. **Retention schedule, per class.** For each class below supply: retention
   duration and unit; clock/start event; applicable tenants/environments;
   soft/hard-delete or irreversible anonymization; exceptions; legal-hold
   precedence; expiry execution frequency; owner; deletion completion deadline.
   Define whether shorter customer contracts override defaults and whether
   expiry may ever run automatically under a previously approved policy.
   - Persisted redacted messages/conversations and immutable upload snapshots.
   - Predictions, evidence anchors, detection output/runs and resume cursors.
   - Feedback, supervised decisions, Acted/outcome state and taxonomy/pilot data.
   - Inference attempts, pending/unknown usage, reservations, budgets and
     tenant controls (including financial/audit retention exceptions).
   - Jobs, job-conversation references, upload memberships/receipts and caches.
   - Workspace/membership identity and shared user records; define removal of
     one workspace without deleting a user belonging to another workspace.
   - Audit events and deletion/export receipts, including actor/resource IDs:
     approve identifier/pseudonymization rules and the append-only versus
     approved-deletion exception. No transcript, email, payload or secret in audit.
   - Generated export files, temporary files, download tokens and application
     logs/monitoring artifacts.
   - Integration credentials and provider copies, if introduced under D10.
   - Public pilot-intake records (`pilot_requests`, not tenant-owned): choose a
     separate policy/data-subject path, or explicitly exclude with an owner.
3. **Export contract.** Authorized requester/admin and reauthentication rules;
   included data classes and format/version (proposed JSON plus manifest);
   point-in-time consistency/cutoff; actor identity redaction; destination and
   residency; encryption/access control; download TTL and revocation; size/time
   limits and completion SLA. Specify whether exports include retained ledger
   and audit rows. Credentials, signing keys and cross-tenant/global user data
   must never be exported. Decide approval/confirmation requirements and whether
   completion notifications are in scope; nothing auto-sends.
4. **Deletion contract.** Tenant deletion versus selective data-subject deletion;
   who requests, who approves (one or two people), reauthentication and exact
   confirmation text; grace/cancel window; execution deadline; irreversible
   boundary; handling of in-flight workers, provider calls, imports and exports;
   idempotency/retry/failed-step recovery; completion receipt contents. Decide
   whether reset-demo remains distinct from permanent workspace deletion.
5. **Legal holds.** Who can place/release a hold, tenant versus resource scope,
   reason codes (no free text in audit), expiry/review process; whether a hold
   blocks export, retention expiry and deletion; precedence for conflicting
   requests; what can be retained after a delete request and who sees it.
6. **Backup and external-copy policy.** Human-verified provider inventory and
   actual retention/expiry for Postgres backups/PITR, application storage,
   generated exports, logs and any integration provider. Approve maximum
   residual lifetime, access restrictions, restore-time reapplication of
   deletion tombstones before serving traffic, RPO/RTO and drill owner. Do not
   promise immediate backup deletion. Unknown provider values remain unresolved.
7. **Operations and authorization.** Operator/security owner, rollout tenant and
   environment, approved migration window, scheduling/pause controls, failure
   alerts, review cadence and acceptance signer. Implementation approval covers
   local synthetic testing only unless additional execution is explicit.

D10 inputs, for later integration cards, are separately: actual customer demand,
first source/provider and event scope, consent, tenant credential ownership and
revocation, monitored sandbox; first outbound action/provider/target, minimal
scopes, exact-payload approval/expiry and timeout reconciliation policy. These
are not prerequisites for an expressly authorized internal-only CB-18 slice.

## Existing implementation to extend

`backend/app/services/tenant_data.py::wipe_tenant_data` is the existing synchronous,
one-transaction wipe. It takes the tenant corpus lock and commits internally;
refactor that transaction boundary deliberately before adding checkpoints.
`backend/app/api/routes/tenant_data.py` exposes the existing deletion route under
the actor router. New lifecycle operations should require verified, current admin
membership in every actor-auth mode, using the always-enforced pattern of the
economics/jobs routes; do not rely on caller-supplied tenant/role headers.

The wipe currently explicitly deletes feedback, decisions, predictions, attempts,
messages, runs, upload memberships, job-conversations, classification cache, jobs,
uploads, conversations, resume, pilot settings and taxonomy. Evidence is removed
through the prediction foreign key's `ON DELETE CASCADE`; test that on Postgres.
It is not a complete lifecycle program: weekly receipts, budget/reservation/control
state, workspace/memberships, shared identity, export artifacts and future secrets
need an explicit policy/disposition. Global controls and shared users cannot be
indiscriminately deleted. This is CB-18 planned scope, not authorization to change
the current wipe's semantics during the Phase 0–2 verification.

## Proposed implementation sequence (approval required)

1. **Inventory and failing contracts.** Enumerate every registered table and
   external/derived store; give each an export/retention/deletion disposition.
   Add two-tenant and shared-user fixtures and failing admin, export isolation,
   hold, evidence-removal, checkpoint/restart and worker-fencing tests first.
   Freeze the approved D11 policy as a versioned contract.
2. **Audit foundation (2–4 days).** Inspect `alembic heads` at implementation time
   and add a linear additive migration for append-only audit events. Persist
   bounded actor/tenant/resource version/operation/result/correlation/time only.
   Use RLS and restricted runtime privileges to reject update/delete; define a
   separately authorized deletion exception exactly as D11 specifies. Audit
   mutations in their transaction; use durable intent/outcome records when work
   crosses transaction boundaries. Start with admin controls and lifecycle
   events; provide a text-free, tenant-scoped admin read path. Verify missing
   tenant context, cross-tenant reads/writes and runtime privilege enforcement.
3. **Policy and hold primitives.** Add versioned policy/hold/request state under
   server-derived tenant identity. Define `requested → confirmed → running →
   completed | blocked | failed` transitions and permission checks. Store bounded
   references, no raw transcripts in jobs/audit. Reject execution without an
   approved policy; no scheduler is enabled merely by deploying code.
4. **Export.** Build a tenant-scoped consistent snapshot with a versioned manifest
   and checksums, bounded paging and resumable generation. Keep artifacts private
   and short-lived, exclude secrets, verify download authorization on each
   request, and invalidate artifacts/tokens upon deletion. Implement only the
   storage/delivery mechanism selected in D11; do not provision a new service.
5. **Resumable deletion (lifecycle total 3–5 days).** Extend the existing wipe into
   ordered bounded steps with durable checkpoints and counts-only receipts.
   Disable/fence new tenant work, drain or cancel jobs and deny late publication
   before destructive steps. Recheck holds/authorization at execution boundaries.
   Respect FK order and policy exceptions, invalidate all evidence/cache/export
   display paths and remove credentials where applicable. Ensure a crashed step
   can retry without losing checkpoints or recreating deleted data. Keep approved
   audit/tombstone state sufficient for restore reconciliation.
6. **Retention and UI.** Route approved expirations through the same lifecycle
   machinery; preserve human-approved boundaries. Admin UI shows policy/hold,
   exact tenant and consequences, confirmation, progress, blocked/error/retry
   states, accessible focus/keyboard behavior and completion receipts. No send
   or irreversible execution is implicit in navigation or draft approval.
7. **Acceptance and rollout proposal.** Run backend units plus disposable
   PostgreSQL migrations, RLS and interruption/race tests; web tests/lint/types/
   build, site gates if touched and unchanged offline eval gate. Exercise two
   tenants, shared users, legal holds, all table dispositions, pending provider
   attempts, late workers, every checkpoint interruption, expired downloads,
   zero displayable evidence and restore-tombstone replay. Record exact source
   revision and receipts; prepare schema-first deployment/rollback and backup
   expiry runbook. Hosted migration, deletion/export of customer data, scheduler
   enablement, restore drills and external writes require separate approval.

Approval must identify the selected scope, completed decision inputs and entry
gate receipts/exception. Until then this document is reviewable planning only.

## 2026-10-15 local implementation authorization

Sanket approved D11 and the audit-plus-lifecycle local implementation/disposable
PostgreSQL verification scope in the implementation request. This supersedes the
proposal-only restriction for that local scope and explicitly permits the local
CB-03/CB-10 entry-gate exception. Hosted execution, entry-gate acceptance, provider
backup facts, operational SLAs/rollout windows and D10 remain separate. See
`decisions.md` D11 for the approved policy and `tasks/CB-18.md` for the concrete
clocks, conservative hold closure, bounded export envelope, retention disposition,
verification receipts, and schema-first rollout/restore runbook. No external
storage/notification service, scheduler or customer-data execution is enabled.
