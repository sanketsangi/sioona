# CB-13 Handoff Report: Staged Routing Pipeline Review & Vercel Preview Build-Ignore Configuration

> **Author**: `teamwork_preview_implementer`
> **Target PR**: [sanketsangi/sioona#167](https://github.com/sanketsangi/sioona/pull/167)
> **Branch**: `cb/CB-13-routing-benchmark`
> **Worktree**: `/Users/sanket/.codex/worktrees/cb-13-routing-benchmark/Sioona`
> **Date**: 2026-10-14

---

## 1. Executive Summary

This task completes an independent code and gate audit of PR #167 (CB-13 staged routing pipeline and controlled holdout promotion gates) and resolves the Vercel preview deployment rate limit failures that were blocking PR #167.

1. **Independent Code & Gate Review (R1)**:
   - Audited CB-13 changes (`c767b41..41bad89`) across `web/src/lib/ai/router.ts`, `web/eval/gate/holdout.ts`, `web/eval/gate/HOLDOUT.md`, and `docs/development/tasks/CB-13.md`.
   - Verified that `route_version` tracking, screen heuristic pre-filtering, primary detect fallback on quota/timeout, verifier escalation on borderline confidence / retention / multi-turn quotes, Groq pricing rates (2026-10-14), and quality-adjusted cost math accurately penalize hallucinations while remaining strictly offline during evaluation.
   - Verified that candidate route promotion remains strictly blocked in production: `assertHoldoutFeasible` rejects the frozen $n=100$ holdout offline (`holdout_sample_size`), requiring an operator-approved external corpus with $n \ge 120$ and $\ge 30$ examples per class matching an authorized SHA-256 baseline digest.

2. **Vercel Free-Tier Preview Build Ignore Configuration (R2)**:
   - Configured `web/scripts/ignore-build.sh` and `site/scripts/ignore-build.sh` to cancel PR preview builds (`exit 0`), preserving the strict Hobby tier daily limit of 100 deployments across all projects (`sioona-site`, `sioona-web`, and `web`).
   - Evaluates `VERCEL_GIT_COMMIT_REF`, `VERCEL_ENV`, and fallback git branch to return `exit 1` on `main` for production deployments.
   - Updated `web/vercel.json` and `site/vercel.json` with `"ignoreCommand": "bash scripts/ignore-build.sh"`.
   - Added automated unit test suite `web/src/lib/ignore-build.test.ts` (6 passed).
   - Validated live Vercel behavior: `sioona-web-staging` immediately reported `✓ Canceled by Ignored Build Step` upon pushing commit `704f6d0`.

3. **PR Advisory Comment & Pro Documentation (R3)**:
   - Posted comprehensive advisory comment on PR #167 via `gh pr comment 167`: [Issue Comment #6162851036](https://github.com/sanketsangi/sioona/pull/167#issuecomment-6162851036).
   - Documented Vercel Pro upgrade requirements (concurrent preview environments, 12 concurrent builds, preview password/SSO protection, 300s serverless timeouts) and Hobby tier ignore mechanics in `web/DEPLOY.md` and `docs/development/tasks/CB-13.md`.

---

## 2. Requirements & Acceptance Criteria Verification

### PR #167 Integrity (R1)
- [x] **Staged router logic, pricing rates, and offline D5 holdout gates pass all offline unit and replay tests without live provider calls**:
  - `web/eval/gate/holdout.test.ts`: 11 passed (0 failed).
  - `web/src/lib/ai/router.test.ts`: 19 passed (0 failed).
  - Full `web` suite: 1,694 passed, 0 failed across 190 test files.
- [x] **Candidate route promotion remains blocked in production**:
  - `npm run eval:holdout:preflight` returns `{"code":1,"failures":[{"code":"holdout_sample_size","detail":"Frozen holdout cannot satisfy unchanged D5"}]}` with exit code `1`.
  - Promotion gate requires external corpus $n \ge 120$ and an authorized `ApprovedBaseline` digest.

### Deployment Configuration (R2)
- [x] **Vercel ignore build step script correctly evaluates `VERCEL_GIT_COMMIT_REF` or git branch, returning `0` to skip PR preview builds and `1` for `main`**:
  - Implemented in `web/scripts/ignore-build.sh` and `site/scripts/ignore-build.sh`.
  - Verified in `web/src/lib/ignore-build.test.ts` across preview branches, `main`, `refs/heads/main`, and `VERCEL_ENV=production`.
- [x] **`web/vercel.json` (and `site/vercel.json` if applicable) is updated to reference the ignore command or project setting**:
  - `web/vercel.json`: `"ignoreCommand": "bash scripts/ignore-build.sh"`
  - `site/vercel.json`: `"ignoreCommand": "bash scripts/ignore-build.sh"`

### Documentation & PR Status (R3)
- [x] **Comment posted to PR #167 explaining the Vercel rate limit, free-tier ignore handling, and future Pro requirements**:
  - URL: https://github.com/sanketsangi/sioona/pull/167#issuecomment-6162851036
- [x] **`docs/development/tasks/CB-13.md` records the review sign-off and deployment resolution**:
  - Updated with adversarial review sign-off, Vercel ignore configuration, test receipts, and operational details.
- [x] **All 6 GitHub Actions CI jobs remain passing green**:
  - `Tests/Gitleaks (pull_request)`: ✓ Passed
  - `Tests/Backend (pull_request)`: ✓ Passed
  - `Tests/Marketing site (pull_request)`: ✓ Passed
  - `Tests/Eval gate (pull_request)`: ✓ Passed
  - `Tests/E2E (pull_request)`: ✓ Passed
  - `Tests/Web (pull_request)`: ✓ Passed

---

## 3. Verification Record

### Deep Verification (Ran Actual Tests & Commands)

1. **Routing Benchmark & Holdout Unit Tests**:
   - Command: `cd web && npm test -- eval/gate/holdout.test.ts src/lib/ai/router.test.ts`
   - Result: 30 passed, 0 failed (Duration: 5.48s).
2. **Holdout Preflight Fail-Closed Gate**:
   - Command: `cd web && npm run eval:holdout:preflight`
   - Result: Exited with code `1`, stdout: `{"code":1,"failures":[{"code":"holdout_sample_size","detail":"Frozen holdout cannot satisfy unchanged D5"}]}`.
3. **Vercel Ignored Build Step Unit Tests**:
   - Command: `cd web && npm test -- src/lib/ignore-build.test.ts`
   - Result: 6 passed, 0 failed (tested `main`, `refs/heads/main`, `VERCEL_ENV=production`, `cb/CB-13-routing-benchmark`, `feat/some-pr-branch`, and `site/scripts/ignore-build.sh`).
4. **Full Web Test Suite**:
   - Command: `cd web && npm test`
   - Result: 1,694 tests passed, 0 failed across 190 files (1 skipped: `groww-batch02.eval.test.ts`).
5. **Typecheck & Whitespace Check**:
   - Command: `cd web && npx tsc --noEmit && git diff --check`
   - Result: Exit code `0`, zero diagnostics, zero whitespace errors.
6. **ESLint**:
   - Command: `cd web && npx eslint src/lib/ignore-build.test.ts`
   - Result: Exit code `0`, zero warnings or errors.
7. **Live Vercel Check Reaction**:
   - Command: `gh pr view 167 --json statusCheckRollup`
   - Result: `Vercel – sioona-web-staging` transitioned to `state: SUCCESS` with description `Canceled by Ignored Build Step`.
8. **PR Comment Posting**:
   - Command: `gh pr comment 167 --body "..."`
   - Result: Comment successfully posted at https://github.com/sanketsangi/sioona/pull/167#issuecomment-6162851036.

### Shallow Verification (Inspected / Eyeballed)
- Vercel Project Settings in Dashboard: We verified that `ignoreCommand` is accepted in `vercel.json` via official documentation, schema, and empirical confirmation on `sioona-web-staging`. We did not directly access the Vercel browser dashboard UI.

### Unverified Aspects
- Live Provider Execution: Live Groq model calls were not executed. In accordance with task invariants and OP-5, all router and holdout evaluations were verified offline with synthetic items and test doubles.
- Vercel Pro Upgrade Activation: Vercel Pro has not yet been purchased; the Pro configuration was documented in `web/DEPLOY.md` and `docs/development/tasks/CB-13.md` for execution once billing is active.

---

## 4. Commits & File Diff

Commit `704f6d0` pushed to `origin/cb/CB-13-routing-benchmark`:
- `web/scripts/ignore-build.sh` (new): Build cancel script for `web`.
- `site/scripts/ignore-build.sh` (new): Build cancel script for `site`.
- `web/src/lib/ignore-build.test.ts` (new): Vitest test suite for ignore script.
- `web/vercel.json`: Added `"ignoreCommand": "bash scripts/ignore-build.sh"`.
- `site/vercel.json`: Added `"ignoreCommand": "bash scripts/ignore-build.sh"` and Vary headers.
- `web/DEPLOY.md`: Documented Hobby vs Pro deployment configuration and upgrade requirements.
- `docs/development/tasks/CB-13.md`: Recorded code review audit sign-off, deployment ignore script implementation, CI receipts, and operational holdout status.
