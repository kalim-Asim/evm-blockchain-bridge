# AKA Bridge — EVM Cross-Chain Bridge with Anomaly Detection

A full-stack blockchain bridge prototype connecting **Ethereum Sepolia** and **Harmony Testnet**, extended with an **ML-based anomaly detection system** that identifies attack patterns in real-time bridge traffic.

> Built as a semester project to explore cross-chain infrastructure security.

---

## Project Overview

Most blockchain bridges are secure at the smart contract level but blind to network-level abuse — DDoS floods, Sybil attacks, and scripted bot loops go undetected until damage is done. This project builds a bridge prototype *and* layers an anomaly detector on top of it, treating the bridge's transaction stream as a time-series classification problem.

```
┌─────────────────────────────────────────────────────────┐
│                      User (MetaMask)                    │
└────────────────────┬────────────────────────────────────┘
                     │ sends CHSD
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Sepolia (Origin Chain)                     │
│         AKADollars ERC20 Contract (CHSD)                │
└────────────────────┬────────────────────────────────────┘
                     │ Transfer event detected
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Bridge Backend (Node.js)                   │
│  ┌──────────────────┐   ┌─────────────────────────────┐ │
│  │  Event Watcher   │   │   Anomaly Detector (SVM)    │ │
│  │  (WSS + HTTP     │──▶│   Scores each 60s window    │ │
│  │   polling)       │   │   NORMAL / ATTACK           │ │
│  └──────────────────┘   └─────────────────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ mints D-CHSD
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Harmony Testnet (Destination Chain)           │
│         DAKADollars ERC20 Contract (D-CHSD)             │
└─────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
evm-blockchain-bridge/
│
├── solidity/                   # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── OriginToken.sol     # AKADollars (CHSD) — Sepolia
│   │   └── DestinationToken.sol# DAKADollars (D-CHSD) — Harmony
│   ├── scripts/
│   │   ├── deployOrigin.js
│   │   └── deployDestination.js
│   └── test/
│
├── backend/                    # Bridge backend (Node.js)
│   ├── event-watcher.js        # Watches both chains, triggers mint/burn + anomaly detection
│   ├── anomaly-detector.js     # 60s window feature extractor + SVM inference runner
│   ├── simulate-attack.js      # Demo script: runs Normal → DDoS → Sybil simulation
│   ├── contract-methods.js     # mint, burn, transfer helpers
│   ├── recover-missed-events.js# Replays missed bridge transfers
│   ├── AKADollars.json         # Origin contract ABI
│   └── DAKADollars.json        # Destination contract ABI
│
├── web/                        # Frontend (Vue 3 + Vite + Tailwind)
│   └── src/
│       ├── views/
│       │   ├── Origin.vue      # Bridge CHSD → D-CHSD
│       │   └── Destination.vue # Bridge D-CHSD → CHSD
│       └── components/
│           └── WalletConnect.vue
│
└── ml/                             # Anomaly Detection
    ├── generate_dataset.py         # Synthetic dataset generator
    ├── bridge_anomaly_dataset.csv  # Generated training data (3000 rows)
    ├── train_svm.py                # SVM training, evaluation & model export
    ├── infer.py                    # Inference script called by the backend at runtime
    ├── bridge_svm_model.pkl        # Trained SVM classifier (ready for inference)
    ├── bridge_scaler.pkl           # Fitted StandardScaler (required at inference)
    └── DATASET.md                  # Feature definitions & generation logic
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.4, OpenZeppelin ERC20 |
| Contract Tooling | Hardhat, ethers.js |
| Bridge Backend | Node.js, Web3.js 1.7 |
| Frontend | Vue 3, Vite, Tailwind CSS, ethers.js |
| Anomaly Detection | Python, scikit-learn (SVM), pandas, numpy |
| Origin Network | Ethereum Sepolia Testnet |
| Destination Network | Harmony Shard 0 Testnet |

---

## How the Bridge Works

### Origin → Destination (Bridging CHSD)

1. User approves and sends CHSD tokens to the **bridge wallet** on Sepolia
2. Backend detects the `Transfer` event via WebSocket listener (with HTTP polling fallback)
3. Backend mints equivalent D-CHSD on Harmony Testnet to the sender's address
4. User receives D-CHSD on Harmony

### Destination → Origin (Bridging Back)

1. User sends D-CHSD to the bridge wallet on Harmony
2. Backend detects the event, approves and burns the D-CHSD
3. Backend transfers original CHSD back to the user on Sepolia

---

## Anomaly Detection System

### Problem

A bridge backend is vulnerable to:
- **DDoS** — flooding the bridge with thousands of transactions to cause congestion or drain gas
- **Sybil attacks** — many fake wallets all funneling to one target to obscure the true attacker
- **Bot loops** — scripted back-and-forth bridging to probe for double-spend vulnerabilities
- **Burst attacks** — hundreds of transactions packed into one second to overwhelm processing

### Approach

Every **60-second window** of bridge traffic is condensed into **14 numerical features** and classified by a trained **Support Vector Machine (SVM)** as either `NORMAL (0)` or `ATTACK (1)`.

### Feature Groups

| Group | Features | What it captures |
|---|---|---|
| **Volume** | `tx_count`, `unique_senders`, `unique_receivers`, `active_pairs` | How heavy is the traffic? |
| **Velocity** | `avg_tx_per_sec`, `max_tx_in_1sec`, `min_interarrival`, `std_interarrival` | How fast is it arriving? |
| **Pattern** | `top_sender_share`, `same_pair_ratio`, `sender_entropy` | Is it centralised or distributed? |
| **Context** | `sin_hour`, `cos_hour`, `rate_deviation` | Is this normal for this time of day? |

Key discriminating features:
- `std_interarrival` ≈ 0 → **bot** (humans are irregular, scripts are perfectly timed)
- `same_pair_ratio` ≈ 1 → **looping** or **Sybil targeting**
- `unique_receivers` = 1 with high `tx_count` → **targeting attack**
- `max_tx_in_1sec` >> average → **burst attack**

### Dataset

Since the bridge prototype has minimal real traffic, the training dataset is **synthetically generated** to simulate realistic statistical distributions for each class.

| Class | Count | Attack Types |
|---|---|---|
| Normal | 1500 | — |
| Attack | 1500 | DDoS (375), Sybil (375), Bot Loop (375), Burst (375) |
| **Total** | **3000** | 14 features + label |

Normal traffic follows realistic hourly baselines (peak at midday, quiet at 4am). Each attack type reproduces the statistical fingerprint of real-world bridge exploits.

See [`ml/generate_dataset.py`](ml/generate_dataset.py) for full generation logic and [`ml/DATASET.md`](ml/DATASET.md) for complete feature documentation.

### Model Training Results

The SVM was trained on the 3000-row synthetic dataset using an RBF kernel (`C=10`, `gamma='scale'`).

| Metric | Score |
|---|---|
| Accuracy | 100% |
| ROC-AUC | 1.0000 |
| False Positives (false alarms) | 0 |
| False Negatives (missed attacks) | 0 |
| 5-fold Cross-Validation | 1.0000 ± 0.0000 |

> The perfect score is expected — the synthetic data has clearly separated statistical distributions by design. Performance on real-world traffic would be lower, which is acceptable for a prototype.

The trained model and scaler are saved as `.pkl` files in `ml/` and are **integrated into the running backend**.

### How it runs (live in the backend)

`backend/anomaly-detector.js` plugs directly into `event-watcher.js`:

1. Every incoming `Transfer` event on the Origin chain is recorded into the current window
2. Every **60 seconds** the window is closed, 14 features are computed in Node.js, and `ml/infer.py` is spawned as a child process
3. `infer.py` loads the `.pkl` files, scales the features, and returns a JSON prediction
4. The backend logs the result:

```
✅ Normal traffic  confidence: 99.9%  | tx=12
⚠️  ATTACK DETECTED  [ATTACK]  confidence: 100.0%  | tx=3200  unique_senders=2  same_pair_ratio=0.98
```

No extra process or configuration needed — the detector starts automatically when you run `node event-watcher.js`.

### Training the Model

```bash
cd ml
pip install numpy pandas scikit-learn scipy
python3 train_svm.py
```

This prints full evaluation metrics, a confusion matrix, and smoke-test predictions, then saves `bridge_svm_model.pkl` and `bridge_scaler.pkl`.

---

## Local Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- MetaMask browser extension
- Test ETH on Sepolia (from a faucet)
- Test ONE on Harmony Testnet (from a faucet)

### 1. Install dependencies

```bash
# Smart contracts
cd solidity && npm install

# Backend
cd backend && npm install

# Frontend
cd web && npm install

# ML
pip install numpy pandas scikit-learn scipy
```

### 2. Configure environment variables

**`solidity/.env`**
```env
DEPLOY_ENDPOINT_ORIGIN=https://ethereum-sepolia-rpc.publicnode.com
DEPLOY_ACC_KEY=<your_wallet_private_key>
DEPLOY_ENDPOINT_DESTINATION=https://api.s0.b.hmny.io
BRIDGE_WALLET=<your_bridge_wallet_address>
```

**`backend/.env`**
```env
ORIGIN_WSS_ENDPOINT=wss://ethereum-sepolia-rpc.publicnode.com
ORIGIN_HTTPS_ENDPOINT=https://ethereum-sepolia-rpc.publicnode.com
ORIGIN_TOKEN_CONTRACT_ADDRESS=<deployed_origin_contract_address>
DESTINATION_WSS_ENDPOINT=wss://ws.s0.b.hmny.io
DESTINATION_HTTPS_ENDPOINT=https://api.s0.b.hmny.io
DESTINATION_TOKEN_CONTRACT_ADDRESS=<deployed_destination_contract_address>
BRIDGE_WALLET=<bridge_wallet_address>
BRIDGE_PRIV_KEY=<bridge_wallet_private_key>
ORIGIN_EXPLORER=https://sepolia.etherscan.io/tx/
DESTINATION_EXPLORER=https://explorer.testnet.harmony.one/tx/
WALLET_ZERO=0x0000000000000000000000000000000000000000
```

**`web/.env`**
```env
VITE_ORIGIN_NETWORK_NAME=Sepolia
VITE_ORIGIN_NETWORK_ID=0xaa36a7
VITE_DESTINATION_NETWORK_NAME=Harmony-Testnet
VITE_DESTINATION_NETWORK_ID=0x6357d2e0
VITE_DESTINATION_NETWORK_RPC=https://api.s0.b.hmny.io
VITE_ORIGIN_TOKEN_ADDRESS=<deployed_origin_contract_address>
VITE_DESTINATION_TOKEN_ADDRESS=<deployed_destination_contract_address>
VITE_BRIDGE_WALLET=<bridge_wallet_address>
```

### 3. Deploy contracts

```bash
cd solidity

# Compile
npx hardhat compile

# Deploy to Sepolia (needs test ETH)
npx hardhat run scripts/deployOrigin.js --network origin

# Deploy to Harmony Testnet (needs test ONE)
npx hardhat run scripts/deployDestination.js --network destination
```

Update both `.env` files with the printed contract addresses.

### 4. Run the bridge

```bash
# Terminal 1 — backend
cd backend && node event-watcher.js

# Terminal 2 — frontend
cd web && npm run dev
```

Open `http://localhost:3000` in your browser.

### 5. MetaMask setup

- Enable **Show test networks** in MetaMask → Settings → Advanced
- Add **Sepolia** network and switch to it
- Import token: paste your `VITE_ORIGIN_TOKEN_ADDRESS` to see your CHSD balance
- Use a **separate user wallet** (not the bridge wallet) to bridge tokens

---

## Recovering Missed Events

If the backend was down when a user bridged tokens, run:

```bash
cd backend && node recover-missed-events.js
```

This scans the last 5000 blocks on Sepolia, finds unprocessed bridge transfers, and mints the corresponding D-CHSD retroactively.

---

## Anomaly Detection — Quick Reference

**Generate dataset:**
```bash
cd ml && python3 generate_dataset.py
# Output: bridge_anomaly_dataset.csv — 3000 rows, 14 features, binary label
```

**Train model:**
```bash
cd ml && python3 train_svm.py
# Output: bridge_svm_model.pkl + bridge_scaler.pkl
```

**Run inference manually (test the model):**
```bash
echo '{"features":[18,14,12,13,0.30,2,2.1,3.5,0.15,0.08,3.2,0.0,1.0,-2.0]}' | python3 ml/infer.py
# {"prediction": 0, "label": "NORMAL", "confidence": 0.9997}
```

**Live detection:** starts automatically when you run `cd backend && node event-watcher.js` — no extra steps needed.

**Demo simulation (no blockchain needed):**
```bash
cd backend && node simulate-attack.js
```
Runs three 20-second windows back-to-back and prints the classifier output:
```
✅ Normal traffic  confidence: 99.4%  | tx=12
⚠️  ATTACK DETECTED  [ATTACK]  confidence: 100.0%  | tx=3200  unique_senders=1  same_pair_ratio=1.00
⚠️  ATTACK DETECTED  [ATTACK]  confidence: 89.0%   | tx=300   unique_senders=300  same_pair_ratio=0.00
```

---

## Networks & Contracts

| | Sepolia (Origin) | Harmony Testnet (Destination) |
|---|---|---|
| Token | AKADollars (CHSD) | DAKADollars (D-CHSD) |
| Standard | ERC20 | ERC20 + Burnable |
| Explorer | sepolia.etherscan.io | explorer.testnet.harmony.one |

---

## Security Notes

- The bridge wallet private key **must never be committed** to version control — always use `.env` files (already in `.gitignore`)
- The `DAKADollars` contract enforces an `onlyBridge` modifier — only the bridge wallet can mint or burn, preventing unauthorized token creation
- The anomaly detector is an **additional monitoring layer** — it does not replace smart contract security

---

## Acknowledgements

- OpenZeppelin — ERC20 contract library
- Hardhat — Ethereum development environment
- Chainstack / PublicNode — RPC endpoints
- Harmony Protocol — destination testnet
