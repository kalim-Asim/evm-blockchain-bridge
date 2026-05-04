#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
BACKEND_DIR="$(dirname "$DIR")"
ROOT_DIR="$(dirname "$BACKEND_DIR")"

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
cd "$BACKEND_DIR"
set -a
source .env.dataset
set +a

MODES=("normal" "normal-steady" "normal-busy" "normal-whale" "normal-retail" "normal-offpeak" "burst" "repeated" "spike" "sybil" "botloop")
echo "[4/6] Generating authentic traffic for ${#MODES[@]} modes via EVM Time-Warping..."
echo "      (Simulating 25 hours of normal traffic and 8 hours of attacks in minutes!)"

# Remove any old JSONL files to ensure fresh dataset
rm -f "$BACKEND_DIR"/data/dataset-events-*.jsonl

for mode in "${MODES[@]}"; do
  echo ""
  echo "  ┌─────────────────────────────────────────────"
  echo "  │ Starting traffic mode: $mode"
  echo "  └─────────────────────────────────────────────"
  
  # Start listener in background
  node "$BACKEND_DIR"/dataset/dataset-listener.js "$BACKEND_DIR/data/dataset-events-${mode}.jsonl" &
  LISTENER_PID=$!
  
  # Give listener time to connect
  sleep 3
  
  # Run traffic generator (blocking — waits until mode finishes)
  node "$BACKEND_DIR"/dataset/dataset-traffic-gen.js "$mode"
  
  # Give listener extra time to capture final events from mempool
  sleep 8
  
  # Stop listener safely
  kill -SIGINT $LISTENER_PID 2>/dev/null || true
  wait $LISTENER_PID 2>/dev/null || true
  
  # Show how many events were captured
  if [ -f "$BACKEND_DIR/data/dataset-events-${mode}.jsonl" ]; then
    EVENT_COUNT=$(wc -l < "$BACKEND_DIR/data/dataset-events-${mode}.jsonl")
    echo "  ✓ Captured $EVENT_COUNT events for mode: $mode"
  else
    echo "  ✗ No events captured for mode: $mode"
  fi
  echo "  ─────────────────────────────────────────────"
done

echo ""
echo "[5/6] Extracting features into CSV..."
node "$BACKEND_DIR"/dataset/dataset-extract.js

echo ""
echo "[6/6] Training new ML model..."
cd "$ROOT_DIR/ml"
python3 train_model.py

echo ""
echo "Cleaning up..."
kill $NODE_PID 2>/dev/null || true
trap - EXIT
rm -f "$BACKEND_DIR/.env.dataset"

echo ""
echo "=========================================================="
echo "    Dataset Generation and Model Training Complete!       "
echo "=========================================================="
