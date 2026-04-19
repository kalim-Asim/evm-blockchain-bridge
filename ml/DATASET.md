# Anomaly Detection Dataset — Documentation

## Overview

`bridge_anomaly_dataset.csv` is a synthetic dataset generated to train an SVM-based anomaly detector for the AKA Bridge. Each row represents one **60-second monitoring window** of bridge traffic, described by 14 numerical features and a binary label.

---

## Why Synthetic?

The bridge prototype has minimal real transaction history (< 10 txs). Real-world bridge attack datasets are not publicly available. The synthetic generator reproduces the **statistical fingerprints** of real attack patterns documented in blockchain security research, making it suitable for training a proof-of-concept model.

---

## Dataset Statistics

| Property | Value |
|---|---|
| Total rows | 3000 |
| Normal windows (label=0) | 1500 |
| Attack windows (label=1) | 1500 |
| Features | 14 |
| Class balance | 50 / 50 |

### Attack type breakdown (within label=1)

| Attack Type | Count | Description |
|---|---|---|
| `ddos` | 375 | Mass flooding from 1–5 wallets |
| `sybil` | 375 | Many fake wallets targeting one receiver |
| `bot_loop` | 375 | Scripted looping between same pairs |
| `burst` | 375 | Hundreds of txs in 1 second, then silence |

---

## Feature Definitions

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

### Label

| Column | Values | Meaning |
|---|---|---|
| `label` | 0 / 1 | 0 = normal traffic, 1 = attack |
| `attack_type` | string | `normal`, `ddos`, `sybil`, `bot_loop`, `burst` |

---

## Statistical Separation (mean values by class)

| Feature | Normal (0) | Attack (1) | Signal |
|---|---|---|---|
| `tx_count` | ~24 | ~944 | Attacks flood the bridge |
| `unique_receivers` | ~17 | ~2 | Attacks target specific wallets |
| `same_pair_ratio` | 0.10 | 0.91 | Attacks loop the same pairs |
| `max_tx_in_1sec` | ~2 | ~124 | Attacks burst in one second |
| `std_interarrival` | 3.2 | 1.4 | Bots are regular, humans are not |
| `sender_entropy` | 3.9 | 2.8 | Normal traffic is more distributed |
| `rate_deviation` | ~0 | ~927 | Attacks massively exceed the baseline |

---

## Generation Logic

Normal traffic is modelled using:
- Hourly baselines (peak ~35 txs/min at noon, trough ~4 at 4am)
- Exponential inter-arrival times (Poisson process — standard for network traffic)
- High sender diversity, low pair repetition

Each attack type uses distinct statistical parameters:

**DDoS** — `tx_count` ∈ [500, 5000], `unique_senders` ∈ [1, 5], interarrivals sampled from Exponential(0.02) — extremely fast and regular.

**Sybil** — `unique_senders` ∈ [50, 300], `unique_receivers` ∈ [1, 2], `same_pair_ratio` ∈ [0.88, 1.0] — many sources, one target.

**Bot Loop** — interarrivals generated as `interval + Normal(0, 2% noise)` — near-perfect regularity, `std_interarrival` ≈ 0.

**Burst** — `max_tx_in_1sec` = entire burst size, interarrivals inside burst ∈ [0.001, 0.01], large gaps afterward.

---

## Reproducing the Dataset

```bash
cd ml
python3 generate_dataset.py
```

The generator uses a fixed random seed (`seed=42`) so output is fully reproducible.

---

## Recommended Preprocessing for SVM

SVM is sensitive to feature scale. Before training:

```python
from sklearn.preprocessing import StandardScaler

features = [
    'tx_count', 'unique_senders', 'unique_receivers', 'active_pairs',
    'avg_tx_per_sec', 'max_tx_in_1sec', 'min_interarrival', 'std_interarrival',
    'top_sender_share', 'same_pair_ratio', 'sender_entropy',
    'sin_hour', 'cos_hour', 'rate_deviation'
]

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_train)
```

Drop `attack_type` before training (it's for analysis only, not a model input).
