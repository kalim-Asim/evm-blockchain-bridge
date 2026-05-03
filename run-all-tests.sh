#!/bin/bash
# Quick Start Guide for Testing the Attack-Resistant Bridge
# Run this script to execute all tests

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Attack-Resistant Bridge — Quick Start Test Suite        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}[Phase 1] Testing ML Model & Dataset${NC}"
echo "========================================"
cd "$(dirname "$0")/ml"
python3 test-ml-model.py
echo ""

echo -e "${BLUE}[Phase 2] Testing Backend Components${NC}"
echo "========================================"
cd "$(dirname "$0")/backend"
node test-bridge.js
echo ""

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Start the event watcher: cd backend && node event-watcher.js"
echo "2. In another terminal, simulate attacks: node simulate-attack.js"
echo "3. Watch for 🚫 Transaction blocked messages"
echo ""
