#!/bin/bash
set -euo pipefail

# Clean up on success and failure without masking the failing command's status.
trap 'rm -f ai-context.txt' EXIT

TARGET="${1:-${REVIEW_TARGET:-web/src/components/**/*.ts,web/src/components/**/*.tsx}}"

echo "⏳ Packing codebase with Repomix (include: $TARGET)..."
# Target specific directories to keep context size manageable
repomix --include "$TARGET" --output ai-context.txt --quiet

if [ ! -s ai-context.txt ]; then
  echo "⚠️  No files packed for target: $TARGET"
  exit 1
fi

echo "🤖 agy is analyzing the codebase..."
# Combine the prompt and the packed context, then pipe directly to agy
cat reviewer-prompt.txt ai-context.txt | agy --dangerously-skip-permissions

echo "---------------------------------------------------"
echo "👀 Waiting for next file change..."
