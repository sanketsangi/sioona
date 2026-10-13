# Execution Plan: Task CB-10 Adversarial Review & CB-11 Gating

## Overview
Conduct a comprehensive, read-only adversarial codebase review and completion verification for task CB-10 (Canonical Postgres operations), examining committed history (`3258c23`...`58bd88b`) and uncommitted working-tree modifications across `backend` and `web`. Deliver an explicit determination on whether proceeding to task CB-11 is approved.

## Decomposition & Tasks

### Track 1: R1 — Slice Cutover & Architecture Audit
- **Subagent**: `teamwork_preview_explorer` (Explorer 1)
- **Scope**:
  - Audit against `docs/DEVELOPMENT_COOKBOOK.md` §9 (CB-10), `docs/development/tasks/CB-10.md`, and Decision D6.
  - Inspect implementation status of all 5 D6 slices:
    1. Conversations & Messages
    2. Feedback & Supervised Decisions
    3. Pilot Settings
    4. Taxonomy Overrides
    5. Remaining JSON / Store Cache (Postgres vs json-demo demarcation)
  - Diff analysis: committed history (`3258c23`...`58bd88b`) vs uncommitted working-tree modifications. Document what is finalized, in-flight, and unimplemented.

### Track 2: R2 — Test Suite & Lint Execution Verification
- **Subagent**: `teamwork_preview_worker` (Worker 1)
- **Scope**:
  - Run `pytest` in `backend`.
  - Run `vitest`, `tsc` (type check), and `eslint` in `web`.
  - Capture all failure logs, syntax errors (e.g. `SignalReviewSuggestedAction.test.ts`), and lint errors (e.g. React hook ref mutations in `use-mark-acted.ts`).
  - Read-only execution: no code modifications.

### Track 3: R2 — Technical Quality, Concurrency & Rollout Verification
- **Subagent**: `teamwork_preview_explorer` (Explorer 2)
- **Scope**:
  - Verify state-mode enforcement (`SIOONA_STATE_MODE=postgres|json-demo`) and boot failure behaviors in backend.
  - Verify Alembic migration `025_detection_resume.py` and documented host rollout sequence (Migration 025 → FastAPI → Web).
  - Deep-dive concurrency and race-condition handling in `backend/app/services/detection_resume.py`.

### Track 4: R3 — Governance, Invariants & CB-11 Gating Ruling
- **Subagent**: `teamwork_preview_explorer` (Explorer 3)
- **Scope**:
  - Review `docs/development/decisions.md` (lines 189–192, Decision D9, Decision D6).
  - Review `docs/development/PHASE_2_GO.md` and repository engineering invariants in `AGENTS.md`.
  - Check definition-of-done and acceptance criteria for CB-10.
  - Evaluate readiness for CB-11 and state whether authorization is granted or blocked.

### Track 5: Synthesis & Final Gating Determination
- Synthesize all findings into structured sections:
  1. Executive Summary & Gating Ruling (CB-10 completion status & CB-11 go/no-go determination).
  2. Entity-by-entity cutover assessment for all 5 D6 slices with file and line evidence.
  3. Committed vs uncommitted working tree analysis (`3258c23`...`58bd88b` vs uncommitted).
  4. Technical quality findings (concurrency in `detection_resume.py`, migration 025 rollout sequence, boot failure behaviors).
  5. Test suite and verification log (`pytest`, `vitest`, `tsc`, `eslint`, with exact error locations).
  6. Governance & blocker analysis (Decision D9, repo invariants, Phase 2 GO requirements).
- Deliver final report to parent via `send_message`.
