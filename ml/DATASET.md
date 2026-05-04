# Anomaly Detection Dataset — Documentation

## Overview

`bridge_anomaly_dataset.csv` is an **authentic EVM transaction dataset** generated via a local Hardhat node. It captures raw `Transfer` events sent to a simulated ERC20 contract, processing them into 14 statistical features using a 1-second overlapping sliding window. This dataset is designed to train the anomaly detection model used in the AKA Bridge.

---

## Why Authentic over Synthetic?

Initially, the project used purely synthetic statistical distributions to generate dataset rows. While useful for early testing, a synthetic dataset fails to capture the true latency, block-mining variability, and raw EVM transaction mechanics.

The **Authentic Pipeline** solves this by programmatically deriving funded wallets on a local node and executing real `.transfer()` transactions. This simulates actual traffic flows, complete with EVM block timestamps, mimicking what the production node sees over WebSocket/HTTP.

---

## Generation Pipeline

### 1. Traffic Generation (`backend/dataset-traffic-gen.js`)
This script uses multiple test wallets to generate realistic bridge transfers. It employs **EVM Time-Warping** (`evm_increaseTime` and `evm_mine`) to simulate hours of human-paced and bot-paced traffic in minutes. It runs through specific predefined modes:

**Normal Modes (Label = 0)**
*   **Normal:** Mixed realistic human traffic (casual users, repeat users, and power users).
*   **Normal-Steady:** Low-volume steady drip, one user at a time.
*   **Normal-Busy:** Peak-hour surge with many users and a faster pace.
*   **Normal-Whale:** A few high-value wallets making repeated transfers with human-like jitter.
*   **Normal-Retail:** Many distinct wallets sending only 1-2 transactions ever (simulating airdrop/onboarding events).
*   **Normal-Offpeak:** Sparse night-time or weekend trickle.

**Attack Modes (Label = 1)**
*   **Burst:** DDoS massive flood from 1-2 wallets targeting the bridge.
*   **Repeated:** A single wallet hammering the bridge continuously.
*   **Spike:** Waves of quiet traffic followed by massive spikes.
*   **Sybil:** Coordinated attacks from multiple wallets all funneling into the bridge.
*   **Botloop:** Machine-precise intervals (e.g. 250ms loops) from a single sender without human jitter.

### 2. Event Listener (`backend/dataset-listener.js`)
This script acts identically to the real bridge's `event-watcher.js`. It listens to the Hardhat node via HTTP/WSS, extracting `Transfer` events and their genuine block timestamps, saving them to `dataset-events-<mode>.jsonl` files.

### 3. Feature Extraction (`backend/dataset-extract.js`)
This processes the `.jsonl` files. It steps through the timeline second-by-second (a **1-second overlapping sliding window**), looking back exactly 60 seconds from the current step to extract features. 

---

## Feature Definitions

The sliding window yields 14 features:

### Volume Features — "How heavy is the traffic?"
| Column | Type | Description |
|---|---|---|
| `tx_count` | int | Total transactions in the 60s window |
| `unique_senders` | int | Number of distinct sending wallets |
| `unique_receivers` | int | Number of distinct receiving wallets |
| `active_pairs` | int | Unique sender→receiver combinations |

### Velocity Features — "How fast is it arriving?"
| Column | Type | Description |
|---|---|---|
| `avg_tx_per_sec` | float | tx_count / 60 |
| `max_tx_in_1sec` | int | Peak transactions in any single second |
| `min_interarrival` | float | Shortest gap between any two transactions (seconds) |
| `std_interarrival` | float | Standard deviation of inter-transaction gaps |

### Pattern Features — "Is it centralised or distributed?"
| Column | Type | Description |
|---|---|---|
| `top_sender_share` | float | Fraction of txs from the single most active sender (0–1) |
| `same_pair_ratio` | float | Fraction of txs that reuse the same sender→receiver pair (0–1) |
| `sender_entropy` | float | Shannon entropy of sender distribution (higher = more spread out) |

### Context Features — "Is this normal for this time of day?"
| Column | Type | Description |
|---|---|---|
| `sin_hour` | float | sin(2π × hour / 24) — cyclical hour encoding |
| `cos_hour` | float | cos(2π × hour / 24) — cyclical hour encoding |
| `rate_deviation` | float | tx_count minus the historical hourly average |

### Labels
| Column | Values | Meaning |
|---|---|---|
| `label` | 0 / 1 | 0 = Normal Traffic, 1 = Attack |
| `attack_type` | string | `normal`, `ddos`, `sybil`, `burst`, `bot_loop`, `spike`, `repeated` |

---

## Reproducing the Dataset

To build the dataset completely from scratch (this takes ~15 minutes and automatically launches Hardhat, generates traffic, extracts features, and retrains the ML model):

```bash
cd backend
./generate-authentic-dataset.sh
```

## Scaling and ML Processing

The dataset features are raw numerical values and must be scaled prior to classification using the `StandardScaler` fitted during training (saved as `bridge_scaler.pkl`). The ML model strictly utilizes a Linear Support Vector Classifier (`SVC`) optimized to completely eliminate false positives for "Normal" traffic windows while successfully classifying authentic attack traffic.
