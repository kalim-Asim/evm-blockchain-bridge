# System Architecture

## High-Level Design

The system has two independent but complementary responsibilities:

1. **Bridge** — move ERC20 tokens between Sepolia and Harmony Testnet
2. **Anomaly Detector** — classify 60-second traffic windows as normal or attack

---

## Component Diagram

```
┌──────────────┐     CHSD transfer      ┌──────────────────────┐
│  User Wallet │ ─────────────────────▶ │  AKADollars.sol      │
│  (MetaMask)  │                        │  Sepolia (Origin)    │
└──────────────┘                        └──────────┬───────────┘
                                                   │ Transfer event
                                                   ▼
                                        ┌──────────────────────┐
                                        │   event-watcher.js   │
                                        │                      │
                                        │  ┌────────────────┐  │
                                        │  │  WSS Listener  │  │
                                        │  │  + HTTP Poll   │  │  ◀── fallback
                                        │  └───────┬────────┘  │
                                        │          │            │
                                        │  ┌───────▼────────┐  │
                                        │  │ handleEthEvent │  │
                                        │  └───────┬────────┘  │
                                        │          │            │
                                        │  ┌───────▼────────┐  │
                                        │  │   mintTokens   │  │
                                        │  └───────┬────────┘  │
                                        └──────────┼───────────┘
                                                   │ mint D-CHSD
                                                   ▼
                                        ┌──────────────────────┐
                                        │  DAKADollars.sol     │
                                        │  Harmony (Dest)      │
                                        └──────────────────────┘


                              60s window of events
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │  Feature Extractor  │
                             │  (14 features)      │
                             └──────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │   SVM Classifier    │
                             │   (RBF kernel)      │
                             └──────────┬──────────┘
                                        │
                          ┌─────────────┴────────────┐
                          ▼                           ▼
                     NORMAL (0)                  ATTACK (1)
                     continue                   log alert
```

---

## Smart Contracts

### AKADollars.sol (Origin — Sepolia)
- Standard ERC20 with fixed initial supply
- Initial supply minted to deployer (bridge wallet) at deployment
- No special access control — anyone can transfer
- Users transfer CHSD to the bridge wallet to initiate a bridge

### DAKADollars.sol (Destination — Harmony)
- ERC20 + ERC20Burnable
- `onlyBridge` modifier on `mint()` and `burnFrom()`
- Only the bridge wallet address (set at deployment) can create or destroy tokens
- This prevents unauthorised minting on the destination chain

---

## Bridge Backend

### event-watcher.js

The core event loop. On startup:

1. Tests both HTTP endpoints — exits if both are down
2. Tries to establish WebSocket connections to both chains
3. Registers `Transfer` event listeners on both contracts
4. After 10 seconds, activates HTTP polling as a safety net alongside WSS
5. Uses a `processedEvents` Set to deduplicate events seen by both WSS and polling

**Origin transfer logic (`handleEthEvent`):**
- Ignore if `from == BRIDGE_WALLET` (bridge-initiated, not a user bridge)
- If `to == BRIDGE_WALLET` → call `mintTokens` on destination chain

**Destination transfer logic (`handleDestinationEvent`):**
- Ignore if `from == WALLET_ZERO` (this is a mint event, not a user transfer)
- If `to == BRIDGE_WALLET` → `approveForBurn` → `burnTokens` → `transferToEthWallet`

### contract-methods.js

Stateless helpers. Each function:
1. Encodes the ABI call
2. Estimates gas
3. Fetches current gas price
4. Fetches nonce
5. Sends the transaction
6. Returns `true` on success, `false` on failure (never throws to caller)

### recover-missed-events.js

One-shot recovery script. Scans past Sepolia blocks for `Transfer` events to the bridge wallet that were never matched by a D-CHSD mint. Filters out bridge-wallet-originated transfers and mint events (from zero address), then replays `mintTokens` for any missed transfers.

---

## Frontend

Single-page Vue 3 app with two views:

**Origin.vue** — Bridge CHSD → D-CHSD
- Connects MetaMask on Sepolia
- Shows CHSD balance (live, updates on wallet change)
- `transfer(bridgeWallet, amount)` on the origin ERC20 contract

**Destination.vue** — Bridge D-CHSD → CHSD
- Connects MetaMask on Harmony Testnet
- Shows D-CHSD balance
- `transfer(bridgeWallet, amount)` on the destination ERC20 contract
- Network validation before every transaction

**WalletConnect.vue** — reusable component
- Checks current MetaMask chain against `targetNetworkId` prop
- Prompts `wallet_switchEthereumChain` if wrong network
- Stores connected address in Pinia store

---

## Anomaly Detection

### Training Pipeline (offline)

```
bridge_anomaly_dataset.csv
        │
        ▼
StandardScaler (fit on train set)
        │
        ▼
SVC(kernel='rbf', C=1.0, gamma='scale')
        │
        ▼
bridge_svm_model.pkl + scaler.pkl
```

### Inference Pipeline (online — to be integrated into backend)

```
Every 60 seconds:
  collect all Transfer events in window
        │
        ▼
  compute 14 features
        │
        ▼
  scaler.transform(features)
        │
        ▼
  model.predict(features)
        │
   0 ───────── 1
   NORMAL      ATTACK → log alert
```

---

## Data Flow Summary

| Step | From | To | Protocol |
|---|---|---|---|
| User sends CHSD | MetaMask | Origin contract | Sepolia RPC |
| Event detected | Origin contract | Backend | WebSocket / HTTP poll |
| D-CHSD minted | Backend | Destination contract | Harmony RPC |
| User sends D-CHSD back | MetaMask | Destination contract | Harmony RPC |
| Burn + transfer back | Backend | Origin contract | Sepolia RPC |
| Feature window | Backend event log | SVM model | In-process |

---

## Key Design Decisions

**Why WSS + HTTP polling fallback?**
WebSocket connections to public testnet nodes drop frequently. HTTP polling every 15 seconds ensures no events are missed even when WSS is down. The `processedEvents` Set prevents double-processing.

**Why the same wallet as bridge wallet and deployer?**
Simplified testnet setup. In production these would be separate: a deployer EOA (hardware wallet) and an operational bridge hot wallet.

**Why SVM for anomaly detection?**
SVMs with RBF kernel work well on small, tabular, balanced datasets. The 14 engineered features have strong discriminative power, making kernel methods a natural fit before reaching for neural approaches.

**Why synthetic training data?**
Bridge exploits are rare and not publicly logged at the per-window feature level. Synthetic generation from known attack statistical distributions is standard practice in network intrusion detection research when real labelled data is unavailable.
