# Original User Request

## Initial Request — 2026-10-12T22:12:17Z

Build a production-ready automated continuous AI code review system featuring a resilient daemon file watcher for local development, intelligent context packing with Repomix, non-interactive review execution via the `agy` CLI, and a GitHub Actions workflow for pull request reviews.

Working directory: ~/teamwork_projects/ai_code_reviewer
Integrity mode: development

## Baseline Prototype Context

The project builds upon the concepts in the local prototype:
- Review script: `review.sh` (Repomix packing piped to `agy --dangerously-skip-permissions`)
- Review guidelines: `reviewer-prompt.txt` (focusing on state management race conditions, tenant isolation flaws, missing error boundaries, and unoptimized render loops)

## Requirements

### R1. Local Development Daemon
Build a background file-watching daemon that observes configurable project directories, debounces file modifications, identifies changed files and dependencies, packages them into a targeted context bundle using Repomix, and pipes the review instructions to `agy` non-interactively, printing formatted review findings directly to the console.

### R2. GitHub Actions PR Reviewer
Implement a GitHub Actions workflow and CLI runner that triggers on pull requests, computes diffs against the base branch, bundles relevant source files with Repomix, executes `agy` code review, and posts structured review comments and inline annotations to the PR using GitHub APIs.

### R3. Configurable Review Profiles & Rule Sets
Support project-level configuration (e.g., config file or CLI flags) allowing repositories to customize review dimensions (security, performance, tenant isolation, styling), configure ignore patterns, set maximum context token budgets, and define severity thresholds.

### R4. Automated Verification & Benchmark Harness
Provide an end-to-end programmatic verification suite featuring synthetic code diff fixtures—including intentional bugs (race conditions, async leaks, unhandled exceptions) and clean control samples—that automatically runs the review pipeline and verifies detection accuracy, structured output formatting, and error handling without human inspection.

## Acceptance Criteria

### Local Watcher Execution
- [ ] File watcher detects edits across nested directories with configurable debounce (default 2.5s) without crashing or launching duplicate concurrent review processes.
- [ ] Repomix bundle contains only targeted changed files and relevant modules, excludes binaries/lockfiles, and cleans up temporary bundle files after each cycle.
- [ ] Review execution succeeds non-interactively via `agy`, outputs exact file and line references for identified issues, or outputs a clean status indicator when no issues exist.

### GitHub Actions Integration
- [ ] Workflow triggers on pull requests and securely authenticates with `GITHUB_TOKEN`.
- [ ] Generated review posts to the pull request as structured Markdown with collapsible sections and actionable recommendations.

### Programmatic Test Suite
- [ ] Automated test suite runs against synthetic bug fixtures (at least 5 distinct issue types) and passes all assertions, confirming detection of each issue.
- [ ] Automated test suite runs against clean control fixtures and passes assertions confirming zero false-positive bug reports.
- [ ] CLI commands exit with appropriate status codes (0 for pass, non-zero for failed checks or execution errors) across both local and CI execution modes.

## 2026-10-13T12:45:15Z

Conduct a read-only adversarial codebase review and completion verification for task CB-10 (Canonical Postgres operations), examining both committed history and working-tree modifications across backend and web, and deliver an explicit determination on whether proceeding to task CB-11 is approved.

Working directory: /Users/sanket/Documents/Sioona
Integrity mode: development

## Requirements

### R1. Comprehensive CB-10 Slice & Architecture Audit
Audit the codebase against `docs/DEVELOPMENT_COOKBOOK.md` §9 (CB-10), `docs/development/tasks/CB-10.md`, and Decision D6. Examine the exact implementation status of each D6 slice:
1. Conversations & Messages
2. Feedback & Supervised Decisions
3. Pilot Settings
4. Taxonomy Overrides
5. Remaining JSON / Store Cache (demarcation of Postgres mode vs local json-demo)

Compare committed commits (`3258c23`...`58bd88b`) against the uncommitted working-tree modifications to identify what is finalized, what is in-flight, and what remains unimplemented.

### R2. Technical Quality, Test Integrity & Hosted Rollout Verification
Verify the technical robustness and health of the CB-10 changes without modifying any files:
- Verify state-mode enforcement (`SIOONA_STATE_MODE=postgres|json-demo`) and boot failure behaviors.
- Verify Alembic migration `025_detection_resume.py` and the documented host rollout sequence (Migration 025 → FastAPI → Web).
- Inspect concurrency and race-condition handling in `backend/app/services/detection_resume.py`.
- Run and verify the relevant test suites (`pytest` in backend, `vitest`, `tsc`, and `eslint` in web), documenting any failures, lint errors (such as React hook ref mutations in `use-mark-acted.ts`), or syntax issues (such as `SignalReviewSuggestedAction.test.ts`).

### R3. Explicit Gating Ruling on Task CB-11
Evaluate repo invariants, milestone dependencies, and governance records (`docs/development/decisions.md` lines 189–192 and `docs/development/PHASE_2_GO.md`):
- Determine whether task CB-10 meets all definition-of-done and acceptance criteria.
- State explicitly whether authorization is granted to proceed to task CB-11, detailing all governing blockers, unapproved decision gates (Decision D9), and prerequisites.

## Acceptance Criteria

### Audit Report & Findings
- [ ] Complete entity-by-entity cutover assessment for all five D6 slices with file and line evidence.
- [ ] Detailed findings on code quality, including exact file locations for any linter errors, syntax errors, or concurrency gaps.
- [ ] Verification log with test outcomes for backend (`pytest`) and frontend (`vitest`, `tsc`, `eslint`).
- [ ] Explicit statement answering whether task CB-10 is fully complete.
- [ ] Explicit statement answering whether proceeding to task CB-11 is approved, citing authoritative cookbook and decision governance records.

### Safety & Constraints
- [ ] Read-only execution: no files modified, no git commits made, no external network calls or hosted database operations executed.
