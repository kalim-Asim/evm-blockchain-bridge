# Attack-Resistant Bridge Testing Guide

## Overview
Your bridge uses a ML-based Ensemble classifier to detect and block attacks in real-time while allowing normal transactions.

## System Components

### 1. ML Detection Layer
- **Model**: Ensemble (Random Forest + Gradient Boosting)
- **Inference**: `ml/infer.py` (called per transaction)
- **Features**: 14 statistical metrics from 60-second windows
- **Attack Types Detected**: 
  - DDoS (massive spam from few wallets)
  - Sybil attacks (many fake wallets → one receiver)
  - Bot loops (scripted back-and-forth)
  - Burst attacks (huge spike then silence)

### 2. Bridge Components
- **Event Watcher**: `backend/event-watcher.js` - Listens for transfer events
- **Anomaly Detector**: `backend/anomaly-detector.js` - Real-time classification
- **Transaction Handler**: `backend/contract-methods.js` - Executes allowed transfers

---

## Testing Plan

### Phase 1: Unit Tests (ML Model)

#### Test 1.1: Verify Model Loads Correctly
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/ml
python3 -c "
import pickle
import os
model = pickle.load(open('bridge_model.pkl', 'rb'))
scaler = pickle.load(open('bridge_scaler.pkl', 'rb'))
print('✅ Model loaded:', type(model).__name__)
print('✅ Scaler loaded:', type(scaler).__name__)
"
```

#### Test 1.2: Test Inference with Normal Traffic
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/ml
echo '{"features": [5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10]}' | python3 infer.py
# Expected: {"prediction": 0, "label": "NORMAL", "confidence": ...}
```

#### Test 1.3: Test Inference with Attack Traffic (DDoS pattern)
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/ml
echo '{"features": [150, 2, 3, 1, 2.5, 50, 0.01, 0.05, 0.9, 0.95, 0.3, 0.5, 0.866, 135]}' | python3 infer.py
# Expected: {"prediction": 1, "label": "ATTACK", "confidence": ...}
```

#### Test 1.4: Test Inference with Sybil Attack Pattern
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/ml
echo '{"features": [80, 40, 1, 40, 1.33, 3, 0.5, 0.8, 0.1, 0.95, 3.9, 0.5, 0.866, 50]}' | python3 infer.py
# Expected: {"prediction": 1, "label": "ATTACK", "confidence": ...}
```

---

### Phase 2: Integration Tests (Anomaly Detector)

#### Test 2.1: Feature Extraction Accuracy
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/backend
node -e "
const detector = require('./anomaly-detector');

// Mock 5 normal transactions in current window
const mockEvents = [
  { returnValues: { from: '0x111', to: '0x222' } },
  { returnValues: { from: '0x111', to: '0x222' } },
  { returnValues: { from: '0x333', to: '0x222' } },
  { returnValues: { from: '0x444', to: '0x555' } },
  { returnValues: { from: '0x666', to: '0x777' } },
];

detector.injectMockTxs(mockEvents);
console.log('✅ Injected 5 mock transactions');
"
```

#### Test 2.2: Classification Event Listener
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/backend
node -e "
const detector = require('./anomaly-detector');

detector.on('classification', (alert) => {
  console.log('Classification Alert:', JSON.stringify(alert, null, 2));
  process.exit(0);
});

// Simulate a transaction
setTimeout(() => {
  detector.classifyTransaction({
    returnValues: { from: '0xAAA', to: '0xBBB' }
  });
}, 100);

// Timeout after 5s
setTimeout(() => {
  console.log('❌ Timeout waiting for classification');
  process.exit(1);
}, 5000);
"
```

---

### Phase 3: End-to-End Tests (Full Bridge)

#### Test 3.1: Start Event Watcher with Normal Traffic Simulation
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/backend

# Terminal 1: Start event watcher
node event-watcher.js &
WATCHER_PID=$!

# Terminal 2: Wait a few seconds then simulate attack
sleep 3
node -e "
const fs = require('fs');
const events = [
  { returnValues: { from: '0x111', to: process.env.BRIDGE_WALLET } },
  { returnValues: { from: '0x222', to: process.env.BRIDGE_WALLET } },
  { returnValues: { from: '0x333', to: process.env.BRIDGE_WALLET } },
];
console.log('Simulating normal transactions...');
" 

# Watch for: "✅ Normal traffic" messages
kill $WATCHER_PID 2>/dev/null
```

#### Test 3.2: Test DDoS Attack Detection & Blocking
Run the provided attack simulator:
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/backend
node simulate-attack.js
# Watch for: "🚫 Transaction blocked by Anomaly Detector!"
```

#### Test 3.3: UI Simulator Test
```bash
# Open backend/transaction-simulator.html in a browser
# This interactive tool lets you:
# 1. Generate synthetic normal traffic
# 2. Generate synthetic attacks (DDoS, Sybil, etc.)
# 3. Watch real-time classification results
# 4. See which transactions were blocked
```

---

### Phase 4: Dataset & Model Validation

#### Test 4.1: Check Dataset Stats
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/ml
python3 -c "
import pandas as pd
df = pd.read_csv('bridge_anomaly_dataset.csv')
print(f'Total samples: {len(df)}')
print(f'Normal: {(df[\"label\"]==0).sum()}')
print(f'Attack: {(df[\"label\"]==1).sum()}')
print(f'\\nAttack types:')
print(df[df['label']==1]['attack_type'].value_counts())
"
```

#### Test 4.2: Re-train Model (Optional - if data changed)
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/ml

# Regenerate dataset
python3 generate_dataset.py

# Train ensemble model
python3 train_model.py

# Should output accuracy, precision, recall, confusion matrix
```

#### Test 4.3: Model Performance Metrics
```bash
cd /home/asimk/Downloads/evm-blockchain-bridge/ml
python3 -c "
import pickle
import numpy as np
from sklearn.metrics import classification_report
import pandas as pd

# Load model and data
model = pickle.load(open('bridge_model.pkl', 'rb'))
df = pd.read_csv('bridge_anomaly_dataset.csv')

# Get features
FEATURES = [
    'tx_count', 'unique_senders', 'unique_receivers', 'active_pairs',
    'avg_tx_per_sec', 'max_tx_in_1sec', 'min_interarrival', 'std_interarrival',
    'top_sender_share', 'same_pair_ratio', 'sender_entropy',
    'sin_hour', 'cos_hour', 'rate_deviation'
]

X = df[FEATURES].values
y = df['label'].values
preds = model.predict(X)

print(classification_report(y, preds, target_names=['NORMAL', 'ATTACK']))
"
```

---

## Testing Checklist

### ✅ Quick Validation (5 minutes)
- [ ] Models load without error: `python3 -c "import pickle; pickle.load(open('ml/bridge_model.pkl', 'rb'))"`
- [ ] Inference script runs: `echo '...' | python3 ml/infer.py`
- [ ] Event watcher starts: `node backend/event-watcher.js` (watch 10s then Ctrl+C)

### ✅ Moderate Testing (30 minutes)
- [ ] Run attack simulator: `node backend/simulate-attack.js`
- [ ] Watch for blocked transactions: Look for "🚫 Transaction blocked"
- [ ] Check normal transaction processing: Look for "✅ Normal traffic"
- [ ] Test feature extraction: Run mock transaction injection

### ✅ Comprehensive Testing (1-2 hours)
- [ ] Re-train model from scratch
- [ ] Run all test_*.py files in ml/
- [ ] Full end-to-end: start watcher → simulate traffic → verify blocks
- [ ] Test with real contract events if deployed
- [ ] Monitor performance metrics (inference latency, detection rate)

---

## Expected Behavior

### Normal Transactions ✅
```
✅ Normal traffic | confidence: 94.2% | tx=5 | unique_senders=3
[Bridge processes transaction normally]
```

### Detected Attacks 🚫
```
⚠️  ATTACK DETECTED [DDoS] confidence: 98.7% | tx=150 | unique_senders=2 | same_pair_ratio=0.95
[Transaction blocked, attacker funds NOT transferred]
```

### System Logs
- Check `backend/history.json` for all classification events
- Monitor console for real-time classification output
- Check for inference errors in stderr

---

## Troubleshooting

### Model Not Found
```bash
# Ensure models exist
ls -la ml/bridge_model.pkl ml/bridge_scaler.pkl
# If missing, regenerate:
cd ml && python3 train_model.py
```

### Inference Errors
```bash
# Check Python path and dependencies
python3 -c "import sklearn, pickle, numpy; print('✅ All deps available')"
```

### Event Watcher Not Detecting Events
- Ensure `.env` has correct contract addresses and wallet config
- Check network connectivity to blockchain node
- Verify WebSocket and HTTP providers are working

### False Positives (Blocking Legitimate Transactions)
- Re-train model with more diverse normal traffic patterns
- Adjust WINDOW_MS (currently 60s) in anomaly-detector.js
- Review features causing high attack scores

---

## Performance Benchmarks

**Target Metrics:**
- Inference latency: < 500ms per transaction
- Detection accuracy: > 95% on known attacks
- False positive rate: < 1%
- System uptime: 99.9%

**Current Setup:**
- Inference: Python child process (spawned per transaction)
- Model: Ensemble Voting Classifier
- Features: 14 statistical metrics

---

## Next Steps

1. **Deploy & Monitor**: Run on testnet, monitor detection metrics
2. **Tune Thresholds**: Adjust confidence thresholds based on false positives
3. **Add Whitelist**: Implement trusted wallet whitelist
4. **Rate Limiting**: Add fallback rate limiting if ML fails
5. **Alerting**: Set up alerts for high-confidence attacks

