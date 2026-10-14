# CB-10 staging checklist — 14 October 2026

Status: prepared, not executed. **Exact-revision CI passed; staging execution remains gated on operator preflight and target approval.** This checklist supplements [the operator runbook](CB-10-OPERATOR-RUNBOOK.md), which supplies commands and rollout details. No hosted acceptance is claimed.

## Verified CI receipt

- Local branch: `main`; HEAD: `66fd97cf6da3422a3cb3528faa3dd25dc5431162`.
- The initial query had no exact-HEAD runs because the commit was local. After the request to resolve this issue, the existing commit was pushed without including working-tree edits.
- [Tests run 38505336105](https://github.com/sanketsangi/sioona/actions/runs/38505336105) completed successfully with `headSha=66fd97cf6da3422a3cb3528faa3dd25dc5431162`: Web, Backend, E2E, Eval gate, Gitleaks and Marketing site all succeeded. Remote `main` now contains this commit. Dirty files and this uncommitted checklist are outside that CI receipt.
- At inspection, nine tracked paths were modified and one site test was untracked, including the CB-10 task record. Preserve them; build the staging artifact from a clean, pinned checkout. This checklist is an additional local documentation file.
- Recheck immediately before execution: `gh run list --commit <full-sha>` and `gh run view <run-id> --json headSha,conclusion,jobs,url`. Require matching SHA and all six Tests jobs successful. Do not treat Dependency Graph success as the test gate.

## Preflight and deployment

- [ ] Record approved isolated staging resource IDs, two synthetic tenants, operator, immutable backend/web SHAs, previous compatible revisions and observation start/end with timezone. No production connection or paid provisioning is implied.
- [ ] Attach exact-revision CI and review receipts; verify deployment artifact excludes unrelated working-tree edits.
- [ ] Record backup/PITR and successful restore rehearsal on an approved disposable target; retain a read-only source snapshot and checksum outside the repository.
- [ ] Block manual uploads, detection/redetection, live routes, backend ingestion and recovery cron at ingress; drain pending publication work. `LIVE_INGEST=0` alone does not pause all ingestion. Freeze operator edits and automatic deploys.
- [ ] Keep providers and outbound sends disabled; record zero attempts and sends before and after every drill.
- [ ] Operator follows **025_detection_resume → 026_weekly_upload_receipts → FastAPI → Web**. Verify schema, constraints, ten-table forced RLS/grants and actual runtime-role connection before deploying clients; hold the pause through mixed versions and reconciliation.
- [ ] Verify deployed full SHAs and authenticated canonical reads. Missing row can be empty state; generic route 404, unavailable database or integrity errors must fail closed. Record auth mode; shadow mode does not prove enforce-mode denial.

## Ingestion

- [ ] Publish a deterministic synthetic file containing known conversation/message identities. Verify upload membership, conversations, messages, predictions, evidence and runs are persisted atomically; reconstruct evidence from persisted text and offsets.
- [ ] Upload multiple weekly files, then a non-weekly file. Verify one receipt per completed publication, correct weekly delta and filename ownership; baseline edits preserve upload-owned fields.
- [ ] Replay the same upload ID and simulate a lost response after commit. Both retries add zero duplicate rows and zero weekly increments.
- [ ] Publish two distinct weekly uploads concurrently. Both increments survive exactly once. Inject transaction failure: no partial publication, receipt or increment; resume counts once.
- [ ] Exercise permitted live ingestion with a signed tenant-bound principal in the approved auth mode. Under enforce, forged tenant identity and unneeded reads/mutations are denied; required pilot/resume/taxonomy/publication reads succeed. Live append preserves the upload filename. Use synthetic payloads and no live provider calls.

## Retries and pending work

- [ ] Inject a synthetic classification failure with A successful and B failed in the same aborted pass. Canonical reload retains A and B as unpublished work, plus unrelated prior pending IDs; skipped IDs retain their own state.
- [ ] Retry with a cap, then resume the remainder. Publish only unpublished work; successful publications are not duplicated and no pending IDs vanish.
- [ ] Interleave two stale-version resume saves and the first-cursor insert race. Persisted pending IDs retain the required union; one run cannot erase another run's failures.
- [ ] Interrupt the staging API/database. UI shows a recoverable error; canonical reads cannot substitute demo/empty data. Restore connectivity and click Retry: it refetches and reconstructs current persisted state.

## Reconciliation

- [ ] Quiesce and drain again before comparison. Verify the frozen source checksum before and after; compare under tenant scope with consistent read-only database reads.
- [ ] Conversations/messages: counts, identities, duplicates, ownership and exact normalized text/role/metadata/timestamp hashes; predictions, evidence and runs. Verify keep-set, filters, stable 50-row pages and SignalScore numerator/denominator.
- [ ] Feedback/decisions: identities, verdicts, review/Acted timestamps, approved-unsent/edited/dismissed outcomes and persisted signal links; canonical UI overlays match.
- [ ] Pilot: baseline, notes, weekly count, filename, null/empty semantics and receipt provenance. Document historical uploads without receipts; do not manufacture receipts.
- [ ] Taxonomy: phrase identities/hashes, ownership/activation and concurrent Adapt additions. Inventory remaining upload manifests/status, resume IDs and derived fields as canonical, reconstructible or demo-only.
- [ ] Retain comparator revision, normalization rules and bounded count/hash/mismatch receipts for every slice. Conversation shadow alone is insufficient; absent/filtered/error reports mean not compared. Investigate every missing/changed/extra row and document target-only provenance. Never overwrite or prune to force parity.

## Restart recovery and acceptance

- [ ] Start a genuinely new web process/container with recorded PID/deployment and a clean runtime directory containing no `store*.json`. Browser reload alone is insufficient.
- [ ] Reconstruct conversations, predictions, evidence, feedback/decisions, pilot, taxonomy, upload state and failed/skipped resume IDs without inference or JSON fallback. Compare pre/post counts and hashes and authenticated dashboard/Insights/Eval views.
- [ ] Restart after an acknowledged publication and after a commit whose response was lost. Retry preserves publication/receipt idempotency; interrupted unpublished work remains recoverable. Repeat a backend restart and verify database durability.
- [ ] Prove two seeded tenants remain isolated through actor/API/runtime SQL reads and writes; missing tenant scope returns zero. Empty tables are not isolation evidence.
- [ ] Reopen only approved traffic after parity and matching revisions. Observe for the explicitly signed duration (retain the applicable foundation minimum of 30 minutes); capture error/retry/resume/receipt metrics and counts-only diagnostics. Require zero unexplained loss, counter drift, JSON writes, sends and provider attempts.
- [ ] On mismatch, leakage, wrong revision or partial recovery: pause, drain and retain evidence. Roll back web then backend to the compatible approved pair; leave additive schema/receipts intact. Keep ingestion paused if old counter semantics are incompatible. Data restore requires the recorded human approval.
- [ ] Hand off deployment/CI IDs, source checksum, migration/runtime/auth receipts, each drill result, observation outcome and rollback decision. Unexecuted items remain pending. Writer removal is a separate reviewed PR after parity; Sanket signs hosted CB-10 acceptance before CB-11 implementation proceeds.

For each item record: operator, start/end in Asia/Kolkata, exact revisions, synthetic scenario, expected result, observed bounded counts/statuses/hashes, protected evidence location and PASS/FAIL. Never put secrets, transcript text or customer exports in the checklist or CI artifacts.
