# Original User Request

## Initial Request — 2026-10-14T06:51:52Z

This is a single self-contained fix; keep it small and focused.

Review PR #167 (staged routing pipeline and holdout gates) and resolve Vercel preview deployment rate limit failures by configuring preview build-skip scripts for the free tier and documenting Vercel Pro requirements.

Working directory: /Users/sanket/.codex/worktrees/cb-13-routing-benchmark/Sioona
Integrity mode: development

## Requirements

### R1. Independent Code & Gate Review of PR #167
Audit the CB-13 changes in PR #167 (`c767b41..41bad89`) covering `router.ts` (`route_version`, screen heuristic, detect fallback, verifier escalation, Groq pricing table, and quality-adjusted cost per actionable signal math) and `holdout.ts` (offline D5 preflight and baseline-digest gates). Verify that candidate promotion remains strictly blocked in production until an operator provides an approved $n \ge 120$ D5 holdout corpus.

### R2. Vercel Free-Tier Preview Build Ignore Configuration
Configure an Ignored Build Step script in `web/` (and `site/` if applicable) for Vercel so that preview deployments on pull requests are safely skipped while the account is on the Hobby (Free) tier. The script must return exit code `0` on non-production branches to cancel preview builds and conserve the daily deployment quota, while returning exit code `1` on `main` to allow production deployments to proceed.

### R3. PR Advisory Comment & Documentation
Post an advisory comment on PR #167 via `gh pr comment 167` documenting:
1. Current status: all 6 GitHub Actions CI checks (`Backend`, `E2E`, `Eval gate`, `Gitleaks`, `Marketing site`, `Web`) are fully green.
2. Vercel preview failures on PR #167 are due to Hobby plan daily build rate limits (100 deployments/day across all projects).
3. Requirements for Vercel Pro upgrade once purchased (enabling concurrent preview environments, increased build concurrency, and preview password protection).
4. Update `docs/development/tasks/CB-13.md` and/or `web/DEPLOY.md` to document the free-tier build-ignore behavior and Pro upgrade path.

## Acceptance Criteria

### PR #167 Integrity
- [ ] Staged router logic, pricing rates, and offline D5 holdout gates pass all offline unit and replay tests without live provider calls.
- [ ] Candidate route promotion remains blocked in production.

### Deployment Configuration
- [ ] Vercel ignore build step script correctly evaluates `VERCEL_GIT_COMMIT_REF` or git branch, returning `0` to skip PR preview builds and `1` for `main`.
- [ ] `web/vercel.json` (and `site/vercel.json` if applicable) is updated to reference the ignore command or project setting.

### Documentation & PR Status
- [ ] Comment posted to PR #167 explaining the Vercel rate limit, free-tier ignore handling, and future Pro requirements.
- [ ] `docs/development/tasks/CB-13.md` records the review sign-off and deployment resolution.
- [ ] All 6 GitHub Actions CI jobs remain passing green.
