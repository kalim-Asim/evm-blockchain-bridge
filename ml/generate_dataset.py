"""
Bridge Anomaly Detection — Synthetic Dataset Generator
Generates realistic normal and attack traffic windows for SVM training.

Each row = one 60-second monitoring window on the bridge.

Attack types simulated:
  1. ddos       — massive spam from very few wallets
  2. sybil      — many fake wallets all funneling to one receiver
  3. bot_loop   — scripted back-and-forth looping pairs
  4. burst      — huge spike in one second then silence
"""

import numpy as np
import pandas as pd
from scipy.stats import entropy as scipy_entropy
import math, random

rng = np.random.default_rng(42)

# ─────────────────────────────────────────────────────────────
# Helper: Shannon entropy from a list of counts
# ─────────────────────────────────────────────────────────────
def shannon_entropy(counts):
    counts = np.array(counts, dtype=float)
    counts = counts[counts > 0]
    if len(counts) == 0:
        return 0.0
    probs = counts / counts.sum()
    return float(-np.sum(probs * np.log2(probs)))


# ─────────────────────────────────────────────────────────────
# Helper: time-of-day cyclical encoding
# ─────────────────────────────────────────────────────────────
def time_features(hour):
    sin_h = math.sin(2 * math.pi * hour / 24)
    cos_h = math.cos(2 * math.pi * hour / 24)
    return sin_h, cos_h


# ─────────────────────────────────────────────────────────────
# Historical average tx_count per hour (baseline for normal traffic)
# Simulates a realistic crypto bridge: quiet at night, busier during the day
# ─────────────────────────────────────────────────────────────
HOURLY_BASELINE = {
    0: 8,  1: 6,  2: 5,  3: 4,  4: 4,  5: 5,
    6: 8,  7: 12, 8: 18, 9: 25, 10: 30, 11: 32,
    12: 35, 13: 33, 14: 30, 15: 28, 16: 26, 17: 24,
    18: 22, 19: 20, 20: 18, 21: 15, 22: 12, 23: 10,
}


# ─────────────────────────────────────────────────────────────
# NORMAL traffic window
# ─────────────────────────────────────────────────────────────
def generate_normal(hour):
    base = HOURLY_BASELINE[hour]
    tx_count = max(3, int(rng.normal(base, base * 0.3)))

    # Unique senders: most txs come from different people
    unique_senders = max(1, min(tx_count, int(rng.normal(tx_count * 0.85, tx_count * 0.1))))
    unique_receivers = max(1, min(tx_count, int(rng.normal(tx_count * 0.75, tx_count * 0.12))))
    active_pairs = max(1, min(tx_count, int(rng.normal(tx_count * 0.80, tx_count * 0.1))))

    avg_tx_per_sec = tx_count / 60.0
    # Humans cluster sometimes — max in 1 sec is low
    max_tx_in_1sec = max(1, int(rng.normal(2, 1)))

    # Interarrival times: humans are slow and irregular
    interarrivals = rng.exponential(60.0 / max(tx_count, 1), tx_count)
    min_interarrival = float(np.min(interarrivals)) if tx_count > 1 else 60.0
    std_interarrival = float(np.std(interarrivals)) if tx_count > 1 else 0.0

    # Pattern: no single sender dominates
    top_sender_share = float(rng.uniform(0.05, 0.30))
    same_pair_ratio = float(rng.uniform(0.02, 0.18))

    # Entropy: high (distributed traffic)
    sender_counts = rng.integers(1, 5, size=unique_senders)
    sender_entropy = shannon_entropy(sender_counts)

    sin_h, cos_h = time_features(hour)
    rate_deviation = tx_count - base

    return {
        "tx_count": tx_count,
        "unique_senders": unique_senders,
        "unique_receivers": unique_receivers,
        "active_pairs": active_pairs,
        "avg_tx_per_sec": round(avg_tx_per_sec, 4),
        "max_tx_in_1sec": max_tx_in_1sec,
        "min_interarrival": round(min_interarrival, 4),
        "std_interarrival": round(std_interarrival, 4),
        "top_sender_share": round(top_sender_share, 4),
        "same_pair_ratio": round(same_pair_ratio, 4),
        "sender_entropy": round(sender_entropy, 4),
        "sin_hour": round(sin_h, 4),
        "cos_hour": round(cos_h, 4),
        "rate_deviation": round(rate_deviation, 4),
        "label": 0,   # 0 = normal
        "attack_type": "normal",
    }


# ─────────────────────────────────────────────────────────────
# ATTACK type 1: DDoS — massive flood from 1-5 wallets
# ─────────────────────────────────────────────────────────────
def generate_ddos(hour):
    base = HOURLY_BASELINE[hour]
    tx_count = int(rng.uniform(500, 5000))

    unique_senders = int(rng.uniform(1, 6))
    unique_receivers = int(rng.uniform(1, 4))
    active_pairs = int(rng.uniform(1, unique_senders + 1))

    avg_tx_per_sec = tx_count / 60.0
    max_tx_in_1sec = int(rng.uniform(50, min(500, tx_count)))

    # Bots fire very fast and very regularly
    interarrivals = rng.exponential(0.02, tx_count)
    min_interarrival = float(np.min(interarrivals)) if tx_count > 1 else 0.001
    std_interarrival = float(np.std(interarrivals)) if tx_count > 1 else 0.001

    top_sender_share = float(rng.uniform(0.70, 1.00))
    same_pair_ratio = float(rng.uniform(0.80, 1.00))

    sender_counts = rng.integers(100, 1000, size=unique_senders)
    sender_entropy = shannon_entropy(sender_counts)

    sin_h, cos_h = time_features(hour)
    rate_deviation = tx_count - base

    return {
        "tx_count": tx_count,
        "unique_senders": unique_senders,
        "unique_receivers": unique_receivers,
        "active_pairs": active_pairs,
        "avg_tx_per_sec": round(avg_tx_per_sec, 4),
        "max_tx_in_1sec": max_tx_in_1sec,
        "min_interarrival": round(min_interarrival, 6),
        "std_interarrival": round(std_interarrival, 6),
        "top_sender_share": round(top_sender_share, 4),
        "same_pair_ratio": round(same_pair_ratio, 4),
        "sender_entropy": round(sender_entropy, 4),
        "sin_hour": round(sin_h, 4),
        "cos_hour": round(cos_h, 4),
        "rate_deviation": round(rate_deviation, 4),
        "label": 1,
        "attack_type": "ddos",
    }


# ─────────────────────────────────────────────────────────────
# ATTACK type 2: Sybil — many fake wallets all going to 1-2 receivers
# ─────────────────────────────────────────────────────────────
def generate_sybil(hour):
    base = HOURLY_BASELINE[hour]
    tx_count = int(rng.uniform(100, 800))

    # Many fake sender wallets
    unique_senders = int(rng.uniform(50, 300))
    unique_senders = min(unique_senders, tx_count)

    # All going to 1 or 2 targets
    unique_receivers = int(rng.choice([1, 2], p=[0.7, 0.3]))
    active_pairs = unique_senders  # each fake wallet → same target

    avg_tx_per_sec = tx_count / 60.0
    max_tx_in_1sec = int(rng.uniform(5, 50))

    interarrivals = rng.exponential(0.05, tx_count)
    min_interarrival = float(np.min(interarrivals)) if tx_count > 1 else 0.01
    std_interarrival = float(np.std(interarrivals)) if tx_count > 1 else 0.01

    # Each fake wallet sends roughly same amount → low top_sender_share
    top_sender_share = float(rng.uniform(0.02, 0.10))
    # All go to same receiver → very high same_pair_ratio
    same_pair_ratio = float(rng.uniform(0.88, 1.00))

    # Many senders → high entropy (looks distributed, that's the trick of sybil)
    sender_counts = rng.integers(1, 4, size=unique_senders)
    sender_entropy = shannon_entropy(sender_counts)

    sin_h, cos_h = time_features(hour)
    rate_deviation = tx_count - base

    return {
        "tx_count": tx_count,
        "unique_senders": unique_senders,
        "unique_receivers": unique_receivers,
        "active_pairs": active_pairs,
        "avg_tx_per_sec": round(avg_tx_per_sec, 4),
        "max_tx_in_1sec": max_tx_in_1sec,
        "min_interarrival": round(min_interarrival, 6),
        "std_interarrival": round(std_interarrival, 6),
        "top_sender_share": round(top_sender_share, 4),
        "same_pair_ratio": round(same_pair_ratio, 4),
        "sender_entropy": round(sender_entropy, 4),
        "sin_hour": round(sin_h, 4),
        "cos_hour": round(cos_h, 4),
        "rate_deviation": round(rate_deviation, 4),
        "label": 1,
        "attack_type": "sybil",
    }


# ─────────────────────────────────────────────────────────────
# ATTACK type 3: Bot Loop — scripted back-and-forth, very regular timing
# ─────────────────────────────────────────────────────────────
def generate_bot_loop(hour):
    base = HOURLY_BASELINE[hour]
    tx_count = int(rng.uniform(80, 600))

    unique_senders = int(rng.uniform(2, 8))
    unique_receivers = int(rng.uniform(2, 8))
    active_pairs = int(rng.uniform(2, min(unique_senders * unique_receivers, 10)))

    avg_tx_per_sec = tx_count / 60.0
    max_tx_in_1sec = int(rng.uniform(3, 30))

    # setInterval-style: nearly perfectly regular timing
    interval = 60.0 / tx_count
    noise = rng.normal(0, interval * 0.02, tx_count)  # 2% noise only
    interarrivals = np.abs(interval + noise)
    min_interarrival = float(np.min(interarrivals))
    std_interarrival = float(np.std(interarrivals))   # very low — bot fingerprint

    top_sender_share = float(rng.uniform(0.30, 0.60))
    same_pair_ratio = float(rng.uniform(0.85, 1.00))   # always same pairs looping

    sender_counts = rng.integers(10, 100, size=unique_senders)
    sender_entropy = shannon_entropy(sender_counts)

    sin_h, cos_h = time_features(hour)
    rate_deviation = tx_count - base

    return {
        "tx_count": tx_count,
        "unique_senders": unique_senders,
        "unique_receivers": unique_receivers,
        "active_pairs": active_pairs,
        "avg_tx_per_sec": round(avg_tx_per_sec, 4),
        "max_tx_in_1sec": max_tx_in_1sec,
        "min_interarrival": round(min_interarrival, 6),
        "std_interarrival": round(std_interarrival, 6),
        "top_sender_share": round(top_sender_share, 4),
        "same_pair_ratio": round(same_pair_ratio, 4),
        "sender_entropy": round(sender_entropy, 4),
        "sin_hour": round(sin_h, 4),
        "cos_hour": round(cos_h, 4),
        "rate_deviation": round(rate_deviation, 4),
        "label": 1,
        "attack_type": "bot_loop",
    }


# ─────────────────────────────────────────────────────────────
# ATTACK type 4: Burst — massive spike in one second, then silence
# ─────────────────────────────────────────────────────────────
def generate_burst(hour):
    base = HOURLY_BASELINE[hour]

    # Burst: 50-300 txs crammed into 1 second
    burst_size = int(rng.uniform(50, 300))
    # Then a few trickle txs in the rest of the window
    trickle = int(rng.uniform(0, 10))
    tx_count = burst_size + trickle

    unique_senders = int(rng.uniform(1, 5))
    unique_receivers = int(rng.uniform(1, 3))
    active_pairs = int(rng.uniform(1, unique_senders + 1))

    avg_tx_per_sec = tx_count / 60.0
    max_tx_in_1sec = burst_size   # the whole burst in 1 sec

    # Interarrivals: within burst = near zero, then large gaps
    burst_interarrivals = rng.uniform(0.001, 0.01, burst_size)
    gap = rng.uniform(10, 55, trickle) if trickle > 0 else np.array([])
    all_interarrivals = np.concatenate([burst_interarrivals, gap])
    min_interarrival = float(np.min(all_interarrivals)) if len(all_interarrivals) > 0 else 0.001
    std_interarrival = float(np.std(all_interarrivals)) if len(all_interarrivals) > 1 else 0.0

    top_sender_share = float(rng.uniform(0.60, 1.00))
    same_pair_ratio = float(rng.uniform(0.75, 1.00))

    sender_counts = rng.integers(10, 200, size=unique_senders)
    sender_entropy = shannon_entropy(sender_counts)

    sin_h, cos_h = time_features(hour)
    rate_deviation = tx_count - base

    return {
        "tx_count": tx_count,
        "unique_senders": unique_senders,
        "unique_receivers": unique_receivers,
        "active_pairs": active_pairs,
        "avg_tx_per_sec": round(avg_tx_per_sec, 4),
        "max_tx_in_1sec": max_tx_in_1sec,
        "min_interarrival": round(min_interarrival, 6),
        "std_interarrival": round(std_interarrival, 6),
        "top_sender_share": round(top_sender_share, 4),
        "same_pair_ratio": round(same_pair_ratio, 4),
        "sender_entropy": round(sender_entropy, 4),
        "sin_hour": round(sin_h, 4),
        "cos_hour": round(cos_h, 4),
        "rate_deviation": round(rate_deviation, 4),
        "label": 1,
        "attack_type": "burst",
    }


# ─────────────────────────────────────────────────────────────
# GENERATE full dataset
# ─────────────────────────────────────────────────────────────
def generate_dataset(n_normal=1500, n_per_attack=375):
    rows = []
    hours = list(range(24))

    # Normal windows — spread across all hours weighted by baseline activity
    weights = np.array([HOURLY_BASELINE[h] for h in hours], dtype=float)
    weights /= weights.sum()

    for _ in range(n_normal):
        hour = int(rng.choice(hours, p=weights))
        rows.append(generate_normal(hour))

    # Attack windows — attacks can happen any time, slightly more at off-peak (sneaky)
    attack_hours_weights = np.ones(24) / 24  # uniform — attackers don't care about time

    generators = [generate_ddos, generate_sybil, generate_bot_loop, generate_burst]
    for gen in generators:
        for _ in range(n_per_attack):
            hour = int(rng.choice(hours, p=attack_hours_weights))
            rows.append(gen(hour))

    df = pd.DataFrame(rows)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)  # shuffle
    return df


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Generating dataset...")
    df = generate_dataset(n_normal=1500, n_per_attack=375)

    out_path = "bridge_anomaly_dataset.csv"
    df.to_csv(out_path, index=False)

    print(f"\n✅ Dataset saved to {out_path}")
    print(f"   Total rows     : {len(df)}")
    print(f"   Normal (0)     : {(df['label'] == 0).sum()}")
    print(f"   Attack (1)     : {(df['label'] == 1).sum()}")
    print(f"\n   Attack breakdown:")
    print(df[df['label']==1]['attack_type'].value_counts().to_string())
    print(f"\n   Columns: {list(df.columns)}")
    print(f"\n--- Sample normal row ---")
    print(df[df['label']==0].iloc[0].to_string())
    print(f"\n--- Sample attack row ---")
    print(df[df['label']==1].iloc[0].to_string())

    # Basic sanity checks
    print("\n--- Feature stats ---")
    print(df.drop(columns=['attack_type']).groupby('label').mean().round(3).T.to_string())
