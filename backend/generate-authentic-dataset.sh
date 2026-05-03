#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$(dirname "$DIR")"

echo "=========================================================="
echo "  Authentic Dataset Generation (Local Hardhat Node)       "
echo "  This will take ~10-15 minutes for comprehensive data.   "
echo "=========================================================="

echo "[1/6] Starting local Hardhat node..."
cd "$ROOT_DIR/solidity"
npx hardhat node > /dev/null 2>&1 &
NODE_PID=$!

# Make sure we clean up the node if the script fails or is interrupted
trap "kill $NODE_PID 2>/dev/null || true" EXIT

# Wait for node to initialize
sleep 5

echo "[2/6] Deploying contract and funding test accounts..."
npx hardhat run scripts/setup-dataset-env.js --network localhost

echo "[3/6] Loading local environment variables..."
cd "$DIR"
set -a
source .env.dataset
set +a

MODES=("normal" "burst" "repeated" "spike" "sybil" "botloop")
echo "[4/6] Generating authentic traffic for ${#MODES[@]} modes..."
echo "      (normal=5min, burst/repeated/sybil/botloop=~1min each, spike=~4min)"

# Remove any old JSONL files to ensure fresh dataset
rm -f dataset-events-*.jsonl

for mode in "${MODES[@]}"; do
  echo ""
  echo "  ┌─────────────────────────────────────────────"
  echo "  │ Starting traffic mode: $mode"
  echo "  └─────────────────────────────────────────────"
  
  # Start listener in background
  node dataset-listener.js "dataset-events-${mode}.jsonl" &
  LISTENER_PID=$!
  
  # Give listener time to connect
  sleep 3
  
  # Run traffic generator (blocking — waits until mode finishes)
  node dataset-traffic-gen.js "$mode"
  
  # Give listener extra time to capture final events from mempool
  sleep 8
  
  # Stop listener safely
  kill -SIGINT $LISTENER_PID 2>/dev/null || true
  wait $LISTENER_PID 2>/dev/null || true
  
  # Show how many events were captured
  if [ -f "dataset-events-${mode}.jsonl" ]; then
    EVENT_COUNT=$(wc -l < "dataset-events-${mode}.jsonl")
    echo "  ✓ Captured $EVENT_COUNT events for mode: $mode"
  else
    echo "  ✗ No events captured for mode: $mode"
  fi
  echo "  ─────────────────────────────────────────────"
done

echo ""
echo "[5/6] Extracting features into CSV..."
node dataset-extract.js

echo ""
echo "[6/6] Training new ML model..."
cd "$ROOT_DIR/ml"
python3 train_model.py

echo ""
echo "Cleaning up..."
kill $NODE_PID 2>/dev/null || true
trap - EXIT
rm -f "$DIR/.env.dataset"

echo ""
echo "=========================================================="
echo "    Dataset Generation and Model Training Complete!       "
echo "=========================================================="
