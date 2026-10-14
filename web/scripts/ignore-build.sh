#!/usr/bin/env bash
# Vercel Ignored Build Step script
#
# Cancels preview builds on pull requests to conserve Vercel Hobby (Free) tier
# daily deployment limits (100 builds/day). Allows production builds on 'main'.
#
# Exit codes for Vercel Ignored Build Step:
# - exit 0: SKIP the build (canceled build; does not count against deployment limits)
# - exit 1 (or any non-zero): PROCEED with the build

set -euo pipefail

BRANCH="${VERCEL_GIT_COMMIT_REF:-}"

if [ -z "$BRANCH" ]; then
  BRANCH="$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
fi

echo "[vercel-ignore] Branch: '${BRANCH:-unknown}', VERCEL_ENV: '${VERCEL_ENV:-unset}'"

# Production deployments (main branch or VERCEL_ENV=production) must proceed
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "refs/heads/main" ] || [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "[vercel-ignore] ✓ Production build detected for '$BRANCH'. Proceeding with build (exit code 1)."
  exit 1
fi

# Preview deployments on non-production branches are safely skipped on Hobby tier
echo "[vercel-ignore] 🛑 Preview build for branch '$BRANCH' skipped to conserve Hobby tier quota (exit code 0)."
exit 0
