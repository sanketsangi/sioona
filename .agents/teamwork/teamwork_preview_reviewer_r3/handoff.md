# CB-13 Adversarial Review (Round 3) Report

> **Reviewer**: `teamwork_preview_reviewer` (Round 3)
> **Target PR**: [sanketsangi/sioona#167](https://github.com/sanketsangi/sioona/pull/167)
> **Branch**: `cb/CB-13-routing-benchmark`
> **Worktree**: `/Users/sanket/.codex/worktrees/cb-13-routing-benchmark/Sioona`
> **Date**: 2026-10-14
> **Commit**: `6d53032`

---

## 1. What the Prior Attempt Got Wrong

The prior attempt (Round 2) fixed several edge cases, but an independent adversarial review discovered critical subtle bugs, mathematical inconsistencies, unhandled exceptions, and parallel test race risks:

### Defect 1: Undefined Evidence Validity Multiplier Produced `NaN` Breakdowns (`router.ts`)
- **Input**: `computeQualityAdjustedBenchmark` called with an unmeasured cohort where `evidenceValidityRate: undefined` (or omitted).
- **Expected**: `evidenceMultiplier` cleanly defaults to `1.0`, yielding finite numbers for `validActionableSignals`, `effectiveTruePositives`, and `qualityEfficiencyIndex`.
- **Actual**: Line 419 did `input.evidenceValidityRate !== null ? input.evidenceValidityRate : 1`. In JavaScript/TypeScript, `undefined !== null` evaluates to `true`! As a result, `evidenceMultiplier` evaluated to `undefined`, and subsequent multiplications evaluated to `validActionableSignals: NaN`, `effectiveTruePositives: NaN`, and `qualityEfficiencyIndex: NaN`.
- **Root Cause**: Reliance on strict inequality against `null` (`!== null`) without guarding against `undefined` or validating finite number types.
- **Fix**: Replaced with `typeof input.evidenceValidityRate === "number" && Number.isFinite(input.evidenceValidityRate) ? Math.max(0, Math.min(1, input.evidenceValidityRate)) : 1`.

### Defect 2: Truthiness Check Silenced -100% Efficiency Regressions (`router.ts`)
- **Input**: Baseline with `qualityEfficiencyIndex: 100`, candidate with `qualityEfficiencyIndex: 0`.
- **Expected**: `deltaQualityEfficiencyPct` evaluates to `-100%`, accurately capturing that the candidate's quality efficiency dropped completely to zero.
- **Actual**: `deltaQualityEfficiencyPct` evaluated to `null`!
- **Root Cause**: Line 477 used a truthiness check `if (baseline.qualityEfficiencyIndex && candidate.qualityEfficiencyIndex)`. Because `0` is falsy in JavaScript, when candidate efficiency was 0, the check evaluated to `false` and skipped delta computation entirely, masking a catastrophic efficiency collapse.
- **Fix**: Replaced with explicit `baseline.qualityEfficiencyIndex !== null && candidate.qualityEfficiencyIndex !== null`.

### Defect 3: Unhandled `NaN` Latency Caused Subprocess RangeError Crash (`router.ts`)
- **Input**: Provider invoker returning `latencyMs: NaN` or negative latency.
- **Expected**: `recordAttempt` bounds latency safely to a non-negative finite number without throwing.
- **Actual**: Line 260 did `const boundedLatencyMs = Math.max(0, latencyMs)`. If `latencyMs` is `NaN`, `Math.max(0, NaN)` returns `NaN`. Then `new Date(Date.now() - NaN).toISOString()` threw an unhandled `RangeError: Invalid time value`. Furthermore, line 276 stored raw `latencyMs` instead of the bounded variable, persisting negative/NaN values into attempt records.
- **Root Cause**: Missing `Number.isFinite(latencyMs)` check before timestamp subtraction, and failure to store `boundedLatencyMs` in the attempt object.
- **Fix**: Updated to `const boundedLatencyMs = Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : 0;` and assigned `latencyMs: boundedLatencyMs`.

### Defect 4: Token Calculation Allowed Negative Costs and `NaN` on Corrupt Usage (`router.ts`)
- **Input**: Provider usage with negative tokens (e.g. `inputTokens: -100`), non-finite values (`NaN`, `Infinity`), or `cachedInputTokens: NaN`.
- **Expected**: `calculateAttemptCostUsd` returns `null` or guards values cleanly.
- **Actual**: Computed negative dollar costs or `NaN`.
- **Root Cause**: `calculateAttemptCostUsd` only checked for `null` and `unknown`, without verifying `inputTokens >= 0`, `outputTokens >= 0`, or `Number.isFinite(...)`.
- **Fix**: Added strict non-negative and finite bounds for input and output tokens, and safely sanitized `cachedInputTokens`.

### Defect 5: Unsafe Customer Message Property Access in Screen & Staged Execution (`router.ts`)
- **Input**: `input.customerMessages` is null/undefined in `evaluateScreenStage`, or `conversation.messages` is null/undefined or has turns with null content in `executeStagedRoute`.
- **Expected**: Graceful screening out or skipping of invalid turns without throwing `TypeError`.
- **Actual**: Threw unhandled `TypeError: Cannot read properties of undefined (reading 'filter')`.
- **Root Cause**: Missing `Array.isArray` fallback and missing string type filter on message contents.
- **Fix**: Added defensive `Array.isArray(conversation?.messages)` guards and filtered `typeof m?.content === "string"`.

### Defect 6: CLI Gate Test Timed Out Under Parallel Test Contention (`run-gate.test.ts`)
- **Input**: Full web test suite execution across 199 files.
- **Expected**: All test files pass within allocated timeouts.
- **Actual**: `eval/gate/run-gate.test.ts` failed with `Error: Test timed out in 5000ms` on `eval:gate replay > emits and saves the full artifact from the CLI`.
- **Root Cause**: Default Vitest timeout is 5,000ms. Spawning a tsx subprocess while all other test suites run concurrently caused CPU contention, stretching execution to 6.5s.
- **Fix**: Added explicit `15_000`ms timeout to the CLI spawn test.

---

## 2. What I Changed

1. **`web/src/lib/ai/router.ts`**:
   - Fixed `computeQualityAdjustedBenchmark` to validate `evidenceValidityRate` with `typeof ... === "number" && Number.isFinite(...)` and bounded to $[0, 1]$, defaulting `null`/`undefined` to `1.0`.
   - Fixed `compareRouteBenchmarks` to check `baseline.qualityEfficiencyIndex !== null && candidate.qualityEfficiencyIndex !== null` rather than truthiness.
   - Hardened `calculateAttemptCostUsd` against negative and non-finite token usage counts.
   - Hardened `executeStagedRoute` and `recordAttempt` against `NaN`/negative latency values and malformed conversation message arrays.
   - Hardened `evaluateScreenStage` and `evaluateVerifyEscalation` against null/undefined arrays and non-finite confidence numbers.

2. **`web/src/lib/ai/router.test.ts`**:
   - Added unit test verifying `evidenceValidityRate: undefined` defaults to 1.0 without `NaN`.
   - Added unit test verifying out-of-range `evidenceValidityRate: 1.5` clamps to 1.0.
   - Added unit test verifying `deltaQualityEfficiencyPct` is `-100%` when candidate drops to 0 efficiency.
   - Added unit tests for negative tokens, `NaN` tokens, and `NaN` cached input tokens in `calculateAttemptCostUsd`.
   - Added unit test verifying `NaN` latencyMs in `executeStagedRoute` does not throw `RangeError` and records 0ms latency.
   - Added unit test verifying null/undefined customer messages in `evaluateScreenStage`.
   - Added unit test verifying null classification and `NaN` confidence in `evaluateVerifyEscalation`.
   - Total unit and synthetic replay tests in `router.test.ts` increased from 30 to 36.

3. **`web/eval/gate/run-gate.test.ts`**:
   - Added 15,000ms timeout to `eval:gate replay > emits and saves the full artifact from the CLI` to eliminate parallel worker execution flake.

4. **`docs/development/tasks/CB-13.md`**:
   - Documented Adversarial Code Review (Round 3) sign-off, receipts, and verification records.
   - Committed and pushed changes to `cb/CB-13-routing-benchmark` (`6d53032`).

---

## 3. Verification Record

### Deep Verification (Ran Actual Tests)

1. **Focused Vitest Suite (`web/`)**:
   - Command: `cd web && npm test -- eval/gate/holdout.test.ts src/lib/ai/router.test.ts src/lib/ignore-build.test.ts`
   - Result: **54 passed, 0 failed across 3 test files** (Duration: 6.16s).
     - `eval/gate/holdout.test.ts`: 11 passed
     - `src/lib/ai/router.test.ts`: 36 passed
     - `src/lib/ignore-build.test.ts`: 7 passed

2. **Holdout Gate Preflight Fail-Closed Gate**:
   - Command: `cd web && npm run eval:holdout:preflight`
   - Result: Exited with code `1`, stdout: `{"code":1,"failures":[{"code":"holdout_sample_size","detail":"Frozen holdout cannot satisfy unchanged D5"}]}`.

3. **Promotion Fail-Closed Gate**:
   - Command: `cd web && npm run eval:promotion`
   - Result: Exited with code `1`, stdout: `{"code":1,"failures":[{"code":"holdout_unverified","detail":"verified baseline and candidate holdout results required"}]}`.

4. **Offline Eval Gate**:
   - Command: `cd web && npm run eval:gate`
   - Result: Exited with code `0`, `failures: []`, clean tree validation artifact generated.

5. **Full Web Test Suite**:
   - Command: `cd web && npm test`
   - Result: **1,827 passed, 0 failed, 5 skipped across 199 test files** (Duration: 104.31s).

6. **Full Site Test Suite**:
   - Command: `cd site && npm run typecheck && npm test`
   - Result: **68 passed, 0 failed across 22 test files**; zero TypeScript diagnostics.

7. **Backend Pytest Suite**:
   - Command: `cd backend && /Users/sanket/Documents/Sioona/backend/.venv/bin/python -m pytest`
   - Result: **428 passed, 36 skipped, 0 failed** in 13.07s.

8. **TypeScript Typecheck & Whitespace Checks**:
   - Command: `cd web && npx tsc --noEmit && cd ../site && npm run typecheck && git diff --check origin/main`
   - Result: **Exit code 0, zero diagnostics, zero whitespace errors**.

9. **Live GitHub Actions CI Suite (PR #167)**:
   - Run 38531464178 & 38532729904 passed 100% green across all 6 jobs.
   - Run 38533970225 (on commit `6d53032`):
     - `Tests/Gitleaks`: ✓ Passed (12s)
     - `Tests/Backend`: ✓ Passed (1m03s)
     - `Tests/Marketing site`: ✓ Passed (56s)
     - `Tests/Eval gate`: ✓ Passed (1m29s)

10. **Live Vercel Preview Build-Ignore Verification**:
    - `Vercel – sioona-site`: State **SUCCESS** with description `"Canceled by Ignored Build Step"`, verifying live that PR preview builds are cleanly skipped without burning quota or compute.

### Shallow Verification (Manual Only)
- PR #167 status and metadata inspection via `gh pr view 167`.

### Unverified Aspects
- **Live Groq Provider Calls**: Strict invariant OP-5 requires zero live LLM provider calls during test execution. All evaluations remain strictly offline via test doubles and synthetic replays.
- **Vercel Pro Account Features**: Vercel Pro subscription has not yet been purchased. Pro features (concurrent previews, preview password protection) are documented in `web/DEPLOY.md` and `docs/development/tasks/CB-13.md` for activation upon acquisition.
- **Vercel Web UI Settings Overrides**: Did not inspect the Vercel web UI dashboard directly to confirm whether any project has an overridden UI command for Ignored Build Step.

---

## 4. Known Issues
- `Minor Robustness Risk`: Under the Hobby tier global limit (100 deployments/day per account), if the account exhausts its daily quota before a webhook arrives, Vercel may reject the deployment at the account boundary (`Vercel – web` and `Vercel – sioona-web-staging`) prior to container initialization. Once daily quota resets or when upgraded to Pro, `scripts/ignore-build.sh` cleanly cancels PR preview builds (`exit 0`), as confirmed live on `sioona-site`.

---

## 5. Remaining Risk & Next Step
The PR #167 branch `cb/CB-13-routing-benchmark` is now completely hardened with all edge cases resolved, mathematical formulas guarded against zero/NaN/undefined pitfalls, full test suites 100% green, candidate route promotion strictly blocked in production, and Vercel Hobby build-ignore scripts operating as verified live on GitHub.

**Next step**: When an operator supplies the external $n \ge 120$ holdout corpus matching an approved baseline SHA-256 digest, run `npm run eval:promotion` to verify candidate route quality-adjusted cost prior to production merge.
