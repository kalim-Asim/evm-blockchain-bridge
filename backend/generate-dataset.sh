#!/bin/bash
set -e

# ──────────────────────────────────────────────────────────────────────────────
# AKA Bridge — Authentic Dataset Generation Script
#
# Runs all 11 traffic modes on a local Hardhat node and produces a balanced
# training CSV in ml/bridge_anomaly_dataset.csv.
#
# Normal modes  (label=0) — 6 sub-types covering the full real-world envelope:
#   normal          ~20 min  mixed realistic human traffic
#   normal-steady   ~15 min  low-volume metronomic drip
#   normal-busy     ~15 min  busy-hour surge, fast but legitimate
#   normal-whale    ~12 min  few wallets, many repeat transfers
#   normal-retail   ~15 min  many distinct wallets, 1-2 tx each
#   normal-offpeak  ~15 min  night-time trickle, very sparse
#
# Attack modes  (label=1) — 5 types with increased tx counts:
#   burst           ~1.5 min  DDoS flood (400 tx)
#   repeated        ~2 min    single wallet hammering (300 tx)
#   spike           ~8 min    multi-wave spike
#   sybil           ~2.5 min  coordinated multi-wallet (400 tx)
#   botloop         ~2.5 min  machine-precise bot (360 tx)
#
# Total wall-clock time: ~110–120 minutes
# Expected dataset: ≥ 1000 normal windows, ~400–600 attack windows (balanced)
# ──────────────────────────────────────────────────────────────────────────────

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$(dirname "$DIR")"

echo "=========================================================="
echo "  Authentic Dataset Generation (Local Hardhat Node)       "
echo "  Normal: 6 sub-modes  |  Attack: 5 modes                "
echo "  Estimated time: ~110–120 minutes total                  "
echo "=========================================================="

# ── Step 1: Start Hardhat node ────────────────────────────────────────────────
echo ""
echo "[1/6] Starting local Hardhat node..."
cd "$ROOT_DIR/solidity"
npx hardhat node > /dev/null 2>&1 &
NODE_PID=$!

# Kill node on any exit (success, error, or Ctrl-C)
trap "echo ''; echo '[Cleanup] Stopping Hardhat node...'; kill $NODE_PID 2>/dev/null || true" EXIT

sleep 5

# ── Step 2: Deploy + fund ─────────────────────────────────────────────────────
echo "[2/6] Deploying contract and funding test accounts..."
npx hardhat run scripts/setup-dataset-env.js --network localhost

# ── Step 3: Load env ──────────────────────────────────────────────────────────
echo "[3/6] Loading local environment variables..."
cd "$DIR"
set -a
source .env.dataset
set +a

# ── Step 4: Remove stale JSONL files ─────────────────────────────────────────
echo "[4/6] Cleaning up any previous JSONL event files..."
rm -f dataset-events-*.jsonl

# ── Helper: run one traffic mode and collect its events ───────────────────────
#
# Usage: run_mode <traffic-gen-mode> <output-jsonl-suffix>
#
# Starts the listener in the background, waits for it to connect, runs the
# traffic generator (blocking), waits for the mempool to drain so the listener
# captures the last block's events, then stops the listener.
run_mode() {
  local MODE="$1"
  local SUFFIX="$2"
  local OUTFILE="dataset-events-${SUFFIX}.jsonl"

  echo ""
  echo "  ┌─────────────────────────────────────────────────────"
  echo "  │ Mode: $MODE  →  $OUTFILE"
  echo "  └─────────────────────────────────────────────────────"

  # Start listener — writes to the mode-specific JSONL file
  node dataset-listener.js "$OUTFILE" &
  local LISTENER_PID=$!

  # Give the listener time to subscribe before traffic starts
  sleep 4

  # Run traffic generator — blocks until the mode completes
  node dataset-traffic-gen.js "$MODE"

  # Extra drain time: Hardhat mines instantly, but the listener's HTTP poll
  # runs every 2 s, so we wait 10 s to be sure it captured the final block.
  sleep 10

  # Stop listener gracefully
  kill -SIGINT $LISTENER_PID 2>/dev/null || true
  wait $LISTENER_PID 2>/dev/null || true

  # Report
  if [ -f "$OUTFILE" ]; then
    local EVENT_COUNT
    EVENT_COUNT=$(wc -l < "$OUTFILE" | tr -d ' ')
    echo "  ✓ Captured $EVENT_COUNT events → $OUTFILE"
  else
    echo "  ✗ No events captured for mode: $MODE"
  fi
  echo "  ─────────────────────────────────────────────────────"
}

# ── Step 5: Run all modes ─────────────────────────────────────────────────────
echo ""
echo "[5/6] Generating traffic — 11 modes total"
echo "      Normal modes run longer to produce ≥ 1000 balanced windows."
echo ""

# ── Normal sub-modes (label=0) ────────────────────────────────────────────────
# Each maps to its own JSONL so dataset-extract.js can label them all label=0.
# Running them separately also means the listener buffer stays small and no
# events are lost between mode transitions.

echo "━━━ NORMAL MODES (6 sub-types) ━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_mode "normal"          "normal"
run_mode "normal-steady"   "normal-steady"
run_mode "normal-busy"     "normal-busy"
run_mode "normal-whale"    "normal-whale"
run_mode "normal-retail"   "normal-retail"
run_mode "normal-offpeak"  "normal-offpeak"

echo ""
echo "━━━ ATTACK MODES (5 types) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_mode "burst"    "burst"
run_mode "repeated" "repeated"
run_mode "spike"    "spike"
run_mode "sybil"    "sybil"
run_mode "botloop"  "botloop"

# ── Step 6: Extract features → CSV ───────────────────────────────────────────
echo ""
echo "[6/7] Extracting features from all JSONL files into CSV..."

# Build the full argument list for dataset-extract.js, one entry per JSONL file.
# Normal sub-modes all get label=0 / attack_type=normal.
# Attack modes get their specific attack_type labels.

node dataset-extract.js \
  "normal:dataset-events-normal.jsonl" \
  "normal:dataset-events-normal-steady.jsonl" \
  "normal:dataset-events-normal-busy.jsonl" \
  "normal:dataset-events-normal-whale.jsonl" \
  "normal:dataset-events-normal-retail.jsonl" \
  "normal:dataset-events-normal-offpeak.jsonl" \
  "ddos:dataset-events-burst.jsonl" \
  "bot_loop:dataset-events-repeated.jsonl" \
  "burst:dataset-events-spike.jsonl" \
  "sybil:dataset-events-sybil.jsonl" \
  "bot_loop:dataset-events-botloop.jsonl"

# ── Step 7: Train model ───────────────────────────────────────────────────────
echo ""
echo "[7/7] Training new ML model on balanced dataset..."
cd "$ROOT_DIR/ml"
python3 train_model.py

# ── Cleanup ───────────────────────────────────────────────────────────────────
echo ""
echo "[Cleanup] Removing temporary .env.dataset..."
kill $NODE_PID 2>/dev/null || true
trap - EXIT
rm -f "$DIR/.env.dataset"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=========================================================="
echo "    Dataset Generation and Model Training Complete!       "
echo ""
echo "  Normal sub-modes captured:"
echo "    normal        — mixed realistic traffic"
echo "    normal-steady — low-volume metronomic drip"
echo "    normal-busy   — busy-hour surge"
echo "    normal-whale  — repeat whale transfers"
echo "    normal-retail — many distinct wallets"
echo "    normal-offpeak— sparse night-time trickle"
echo ""
echo "  Attack modes captured:"
echo "    burst / repeated / spike / sybil / botloop"
echo ""
echo "  CSV  →  ml/bridge_anomaly_dataset.csv"
echo "  Model→  ml/ (updated by train_model.py)"
echo "=========================================================="
