#!/bin/bash
set -euo pipefail

TARGET="${1:-${REVIEW_TARGET:-web/src/components/**/*.ts,web/src/components/**/*.tsx}}"
CONTEXT_FILE=$(mktemp "${TMPDIR:-/tmp}/ai-context.XXXXXX")

# Clean up only this invocation's unique temporary file on exit
trap 'rm -f "$CONTEXT_FILE"' EXIT

echo "⏳ Packing codebase with Repomix (include: $TARGET)..."
# Target specific directories to keep context size manageable
repomix --include "$TARGET" --output "$CONTEXT_FILE" --quiet

if [ ! -s "$CONTEXT_FILE" ]; then
  echo "⚠️  No files packed for target: $TARGET"
  exit 1
fi

echo "🤖 agy is analyzing the codebase..."
# Combine the prompt and the packed context, then pipe directly to agy
AGY_BIN="${AGY_BIN:-agy}"
cat reviewer-prompt.txt "$CONTEXT_FILE" | "$AGY_BIN" --dangerously-skip-permissions

echo "---------------------------------------------------"
echo "👀 Waiting for next file change..."
