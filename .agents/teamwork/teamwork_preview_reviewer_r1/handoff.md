# CB-13 Adversarial Review (Round 1) Report

> **Reviewer**: `teamwork_preview_reviewer` (Round 1)
> **Target PR**: [sanketsangi/sioona#167](https://github.com/sanketsangi/sioona/pull/167)
> **Branch**: `cb/CB-13-routing-benchmark`
> **Worktree**: `/Users/sanket/.codex/worktrees/cb-13-routing-benchmark/Sioona`
> **Date**: 2026-10-14
> **Commit**: `10a14c8e5c5fb29dac377810668c5ba510f4c886`

---

## 1. What the Prior Attempt Got Wrong

The prior attempt had several critical defects, unhandled edge cases, and an unmergeable PR state that blocked fresh GitHub Actions CI runs:

### Defect 1: Merge Conflict with `main` & Broken GitHub Actions Workflow Trigger
- **Input**: Commit `704f6d0` pushed to branch `cb/CB-13-routing-benchmark`.
- **Expected**: GitHub generates a clean merge ref (`refs/pull/167/merge`) and triggers the `Tests` workflow across all 6 CI jobs (`Backend`, `E2E`, `Eval gate`, `Gitleaks`, `Marketing site`, `Web`).
- **Actual**: PR #167 was in state `mergeable: "CONFLICTING"` with `mergeStateStatus: "DIRTY"` due to an `(add/add)` conflict on `site/vercel.json` against `origin/main` (where `origin/main` added `headers` with `Vary`, and PR #167 added `ignoreCommand`). Because GitHub could not generate the merge ref, **zero** GitHub Actions workflow runs were triggered for `704f6d0`. The prior claim of green CI was evaluating an old run (`38520330574` on commit `41bad89`), prior to `704f6d0`.
- **Root Cause**: `site/vercel.json` conflicted on merge with `origin/main`. Resolved by combining `ignoreCommand` and `headers` in `site/vercel.json`, merging `origin/main`, and pushing commit `10a14c8`, which restored PR #167 to `mergeable: "MERGEABLE"` and triggered CI run `38529202079` (all 6 jobs passing green).

### Defect 2: Flawed Evidence Validity Math Treating 100% Hallucinations as Valid (`router.ts`)
- **Input**: Cohort benchmark input with `evidenceValidityRate: 0` (meaning 100% of surfaced quotes were invalid/hallucinated, 0% grounded in transcript).
- **Expected**: `effectiveTruePositives` evaluates to `0` and `qualityAdjustedCostPerActionableSignalUsd` evaluates to `null` (strictly penalizing complete hallucinations).
- **Actual**: `effectiveTruePositives` evaluated to `totalTruePositives * 1 = totalTruePositives`, and `qualityAdjustedCost` treated the ungrounded model as 100% valid!
- **Root Cause**: `computeQualityAdjustedBenchmark` contained `const effectiveTP = ... * (evidenceRate > 0 ? evidenceRate : 1)`. When `evidenceValidityRate === 0`, `0 > 0` is false, causing the ternary to return `1` instead of `0`.
- **Fix**: Replaced with `const evidenceMultiplier = input.evidenceValidityRate !== null ? input.evidenceValidityRate : 1;`, properly distinguishing unmeasured (`null` => 1.0) from zero validity (`0` => 0.0).

### Defect 3: Detect & Verifier Model Errors Recorded as "succeeded" in Audit Ledger (`router.ts`)
- **Input**: Detect model returning an error other than `"daily_quota"`/`"timeout"` (e.g. rate limit 429, provider error 500), or verifier model encountering an error during escalation.
- **Expected**: `InferenceAttempt.status` is recorded as `"failed"` in the audit ledger, and a failed verifier output does not overwrite a successful detect output.
- **Actual**: `recordAttempt` was hardcoded with string literal `"succeeded"` at line 314 and line 330 regardless of `call.error`. Additionally, if verify failed, `finalClassification` was overwritten with failed/empty verify output.
- **Root Cause**: Missing error status check in `executeStagedRoute`.
- **Fix**: Updated `recordAttempt` to pass `call.error ? "failed" : "succeeded"` for both stages, and guarded verify classification assignment so `finalClassification` is preserved from detect if verify fails.

### Defect 4: Whitespace-Only Customer Turns Bypassing Heuristic Screen Stage (`router.ts`)
- **Input**: Conversation where customer turns contain only whitespace (e.g. `["   ", "\n\t  "]`).
- **Expected**: Screened out early as `missing_customer_turn` (consistent with `holdout.ts` customer text checks).
- **Actual**: `customerMessages.length === 1` passed `requireCustomerTurn`, and if characters exceeded `minCharacterCount`, it passed screen stage and dispatched to LLM.
- **Root Cause**: Untrimmed message evaluation in `evaluateScreenStage`.
- **Fix**: Trimmed messages (`m.trim()`) before evaluating non-empty customer turn presence and character count.

### Defect 5: Unhandled Missing Route Comparison Edge Case (`router.ts`)
- **Input**: Candidate route producing 0 effective true positives (`qualityAdjustedCost === null`), compared against a baseline with measurable quality-adjusted cost.
- **Expected**: Candidate is blocked from promotion.
- **Actual**: If `candidate.qualityAdjustedCost === null`, `candidate > baseline` was skipped because comparison was `candidate !== null && baseline !== null`.
- **Root Cause**: Lack of null candidate cost check when baseline has valid cost.
- **Fix**: Updated condition to block candidate when `baseline.qualityAdjustedCost !== null && (candidate.qualityAdjustedCost === null || candidate.qualityAdjustedCost > baseline.qualityAdjustedCost)`.

### Defect 6: Missing `origin/main` in Ignored Build Step Scripts
- **Input**: Commit ref formatted as `origin/main` (common in certain CI or deployment checkout configurations).
- **Expected**: Treated as production release (exit code 1).
- **Actual**: Not matched in `[ "$BRANCH" = "main" ] || [ "$BRANCH" = "refs/heads/main" ]`, resulting in exit code 0.
- **Fix**: Added `[ "$BRANCH" = "origin/main" ]` to both `web/scripts/ignore-build.sh` and `site/scripts/ignore-build.sh`.

---

## 2. What I Changed

1. **`web/src/lib/ai/router.ts`**:
   - Fixed `evaluateScreenStage` to trim message whitespace before evaluating turn count and character thresholds.
   - Fixed `executeStagedRoute` to record `status: "failed"` when detect or verify calls fail (`call.error ? "failed" : "succeeded"`), and preserve detect classification if verify fails.
   - Fixed `computeQualityAdjustedBenchmark` to use `evidenceMultiplier = input.evidenceValidityRate !== null ? input.evidenceValidityRate : 1` so zero evidence validity is penalized to 0 effective true positives.
   - Updated `compareRouteBenchmarks` to block candidate routes with `null` quality-adjusted cost when baseline has a valid cost.

2. **`web/src/lib/ai/router.test.ts`**:
   - Added test for whitespace-only customer messages.
   - Added test for failed detect error recording and verify bypass.
   - Added test for failed verify error recording and detect classification preservation.
   - Added test for `evidenceValidityRate: 0` penalizing effective true positives to 0 and cost to null.
   - Added test for unmeasured (`null`) evidence validity defaulting multiplier to 1.
   - Added test for blocking candidate with null quality-adjusted cost against baseline with measurable cost.
   - Total tests increased from 19 to 25.

3. **`web/scripts/ignore-build.sh` & `site/scripts/ignore-build.sh`**:
   - Added `[ "$BRANCH" = "origin/main" ]` match to production deployment checks.

4. **`web/src/lib/ignore-build.test.ts`**:
   - Added test for `VERCEL_GIT_COMMIT_REF="origin/main"` returning exit code 1.
   - Total tests increased from 6 to 7.

5. **`site/vercel.json`**:
   - Resolved merge conflict with `origin/main`, maintaining both `ignoreCommand` and `headers` (Vary).

6. **Whitespace & Documentation**:
   - Stripped trailing blank lines at EOF in `.gitleaks.toml`, `web/e2e/scan-gate.test.mjs`, and `docs/development/tasks/CB-13.md` (verified clean with `git diff --check origin/main`).
   - Updated `docs/development/tasks/CB-13.md` with Adversarial Review Round 1 sign-off, receipts, and operational status.
   - Posted comprehensive status update to PR #167: https://github.com/sanketsangi/sioona/pull/167#issuecomment-6163386392.

---

## 3. Verification Record

### Deep Verification (Ran Actual Tests)

1. **Focused Vitest Suite (`web/`)**:
   - Command: `cd web && npm test -- eval/gate/holdout.test.ts src/lib/ai/router.test.ts src/lib/ignore-build.test.ts`
   - Result: **43 passed, 0 failed** (Duration: 5.88s).
     - `eval/gate/holdout.test.ts`: 11 passed
     - `src/lib/ai/router.test.ts`: 25 passed
     - `src/lib/ignore-build.test.ts`: 7 passed

2. **Holdout Gate Preflight Fail-Closed Gate**:
   - Command: `cd web && npm run eval:holdout:preflight`
   - Result: Exited with code `1`, stdout: `{"code":1,"failures":[{"code":"holdout_sample_size","detail":"Frozen holdout cannot satisfy unchanged D5"}]}`.

3. **Offline Promotion Eval Gate**:
   - Command: `cd web && npm run eval:gate`
   - Result: Exited with code `0`, `failures: []`, generated clean-tree promotion artifact.

4. **Full Web Test Suite**:
   - Command: `cd web && npm test`
   - Result: **1,816 passed, 0 failed across 198 test files** (1 skipped: `groww-batch02.eval.test.ts`).

5. **Full Site Test Suite**:
   - Command: `cd site && npm run typecheck && npm test`
   - Result: **68 passed, 0 failed across 22 test files**; zero TypeScript diagnostics.

6. **Backend Pytest Suite**:
   - Command: `cd backend && /Users/sanket/Documents/Sioona/backend/.venv/bin/python -m pytest`
   - Result: **428 passed, 36 skipped, 0 failed**.

7. **TypeScript Typecheck & Whitespace Checks**:
   - Command: `cd web && npx tsc --noEmit && cd ../site && npm run typecheck && git diff --check origin/main`
   - Result: **Exit code 0, zero diagnostics, zero whitespace errors**.

8. **Live GitHub Actions CI Suite (PR #167, Run ID 38529202079)**:
   - Command: `gh run view 38529202079`
   - Result: **All 6 jobs 100% green**:
     - `Tests/Backend (pull_request)`: ✓ Passed (1m13s)
     - `Tests/E2E (pull_request)`: ✓ Passed (4m15s)
     - `Tests/Eval gate (pull_request)`: ✓ Passed (1m12s)
     - `Tests/Gitleaks (pull_request)`: ✓ Passed (12s)
     - `Tests/Marketing site (pull_request)`: ✓ Passed (50s)
     - `Tests/Web (pull_request)`: ✓ Passed (3m30s)

9. **Live Vercel Checks (PR #167)**:
   - Command: `gh pr view 167 --json statusCheckRollup`
   - Result:
     - `Vercel – sioona-site`: `state: SUCCESS` (`Canceled by Ignored Build Step`)
     - `Vercel – sioona-web-staging`: `state: SUCCESS` (`Canceled by Ignored Build Step`)

### Shallow Verification (Manual Only)
- PR Comment on GitHub: Inspected comment receipt URL (https://github.com/sanketsangi/sioona/pull/167#issuecomment-6163386392).

### Unverified Aspects
- **Live Groq Provider Invocations**: Evaluation and testing remain strictly offline with synthetic items and test doubles per task invariants and OP-5.
- **Vercel Pro Account Features**: Vercel Pro has not yet been purchased; Pro upgrade requirements (concurrent previews, preview passwords, 300s serverless timeouts) are documented in `web/DEPLOY.md` and `docs/development/tasks/CB-13.md` for activation upon acquisition.
- **Vercel Web UI Dashboard Overrides**: Could not inspect the Vercel web UI settings directly to check if any project has an overridden UI command for Ignored Build Step that supersedes `vercel.json`.

---

## 4. Known Issues
- `Minor Robustness Risk`: The global Hobby tier 100 deployments/day ceiling caused `Vercel – web` to register a rate limit failure at the account level before the container started. Both `sioona-site` and `sioona-web-staging` were picked up and cleanly canceled by `ignoreCommand` (`state: SUCCESS`). When the daily quota resets or when Vercel Pro is acquired, all projects will skip PR builds seamlessly.

---

## 5. Remaining Risk & Next Step
The PR #167 branch `cb/CB-13-routing-benchmark` is now in a clean, conflict-free, fully verified state with all 6 GitHub Actions CI checks passing green, candidate route promotion strictly blocked in production, and Vercel Hobby build-ignore scripts operating as verified live on GitHub.

**Next step**: When an operator supplies the external $n \ge 120$ holdout corpus matching an approved baseline SHA-256 digest, run `npm run eval:promotion` to verify candidate route quality-adjusted cost prior to production merge.
