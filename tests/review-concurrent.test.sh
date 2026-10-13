#!/bin/bash
set -euo pipefail

# Regression test: verify that concurrent reviews do not overwrite or delete
# each other's context bundles.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TEST_TMP=$(mktemp -d "${TMPDIR:-/tmp}/review-concurrency-test.XXXXXX")
trap 'rm -rf "$TEST_TMP"' EXIT

# Create a mock agy script that delays execution to guarantee overlap,
# records what it received, and verifies the context file is readable.
MOCK_AGY="$TEST_TMP/mock-agy.sh"
cat << 'MOCK_EOF' > "$MOCK_AGY"
#!/bin/bash
set -euo pipefail

PID=$$
OUTPUT_RECORD="$MOCK_LOG_DIR/agy-$PID.received"

# Read all of stdin into output record
cat > "$OUTPUT_RECORD"

# Sleep briefly to ensure overlapping execution with peer processes
sleep 1.5

# Return simulated reviewer output
echo "✅ LGTM - Mock review complete for PID $PID"
MOCK_EOF
chmod +x "$MOCK_AGY"

MOCK_LOG_DIR="$TEST_TMP/logs"
mkdir -p "$MOCK_LOG_DIR"
export MOCK_LOG_DIR
export AGY_BIN="$MOCK_AGY"

# Target 1 and Target 2 are distinct components
TARGET_A="web/src/components/SignalBadge.tsx"
TARGET_B="web/src/components/SioonaLogotype.tsx"

LOG_A="$TEST_TMP/run_a.log"
LOG_B="$TEST_TMP/run_b.log"

echo "🧪 Launching concurrent review subprocess A ($TARGET_A)..."
(cd "$ROOT_DIR" && ./review.sh "$TARGET_A" > "$LOG_A" 2>&1) &
PID_A=$!

# Stagger launch slightly so process A is in the middle of its agy step
sleep 0.4

echo "🧪 Launching concurrent review subprocess B ($TARGET_B)..."
(cd "$ROOT_DIR" && ./review.sh "$TARGET_B" > "$LOG_B" 2>&1) &
PID_B=$!

echo "⏳ Waiting for concurrent subprocesses to finish..."
wait $PID_A
EXIT_A=$?

wait $PID_B
EXIT_B=$?

if [ $EXIT_A -ne 0 ]; then
  echo "❌ Process A failed with exit code $EXIT_A"
  cat "$LOG_A"
  exit 1
fi

if [ $EXIT_B -ne 0 ]; then
  echo "❌ Process B failed with exit code $EXIT_B"
  cat "$LOG_B"
  exit 1
fi

# Verify there are 2 mock received files
RECEIVED_FILES=("$MOCK_LOG_DIR"/agy-*.received)
if [ ${#RECEIVED_FILES[@]} -ne 2 ]; then
  echo "❌ Expected 2 mock review executions, found: ${#RECEIVED_FILES[@]}"
  exit 1
fi

# Check that one received file has SignalBadge and the other has SioonaLogotype
FOUND_A=0
FOUND_B=0

for file in "${RECEIVED_FILES[@]}"; do
  if grep -q "SignalBadge" "$file"; then
    FOUND_A=$((FOUND_A + 1))
    # Ensure it didn't get overwritten with Target B
    if grep -q "SioonaLogotype" "$file"; then
      echo "❌ Contamination detected: Target B was bundled into Target A's context file!"
      exit 1
    fi
  fi

  if grep -q "SioonaLogotype" "$file"; then
    FOUND_B=$((FOUND_B + 1))
    # Ensure it didn't get overwritten with Target A
    if grep -q "SignalBadge" "$file"; then
      echo "❌ Contamination detected: Target A was bundled into Target B's context file!"
      exit 1
    fi
  fi
done

if [ $FOUND_A -ne 1 ] || [ $FOUND_B -ne 1 ]; then
  echo "❌ Context isolation verification failed: FOUND_A=$FOUND_A, FOUND_B=$FOUND_B"
  exit 1
fi

echo "✅ Concurrent subprocess regression passed: unique context isolation verified without cross-process clobbering or early deletion."
