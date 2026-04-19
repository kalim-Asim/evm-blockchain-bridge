"""
SVM Anomaly Detector — Training Script
Trains a Support Vector Machine on bridge traffic windows.

Output:
  bridge_svm_model.pkl   — trained SVM classifier
  bridge_scaler.pkl      — fitted StandardScaler (must be used at inference time)
"""

import pandas as pd
import numpy as np
import pickle
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    roc_auc_score,
)

# ─────────────────────────────────────────────────────────────
# 1. Load dataset
# ─────────────────────────────────────────────────────────────
print("=" * 55)
print("  AKA Bridge — SVM Anomaly Detector Training")
print("=" * 55)

df = pd.read_csv("bridge_anomaly_dataset.csv")
print(f"\n[1] Dataset loaded: {len(df)} rows, {len(df.columns)} columns")
print(f"    Normal (0): {(df['label'] == 0).sum()} rows")
print(f"    Attack (1): {(df['label'] == 1).sum()} rows")
print(f"    Attack breakdown:")
print(df[df['label']==1]['attack_type'].value_counts().to_string(header=False))

# ─────────────────────────────────────────────────────────────
# 2. Select features
# ─────────────────────────────────────────────────────────────
FEATURES = [
    'tx_count', 'unique_senders', 'unique_receivers', 'active_pairs',
    'avg_tx_per_sec', 'max_tx_in_1sec', 'min_interarrival', 'std_interarrival',
    'top_sender_share', 'same_pair_ratio', 'sender_entropy',
    'sin_hour', 'cos_hour', 'rate_deviation'
]

X = df[FEATURES].values
y = df['label'].values

print(f"\n[2] Features selected: {len(FEATURES)}")
print(f"    {FEATURES}")

# ─────────────────────────────────────────────────────────────
# 3. Train / test split  (80% train, 20% test, stratified)
# ─────────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"\n[3] Train/test split (80/20, stratified):")
print(f"    Train: {len(X_train)} rows  |  Test: {len(X_test)} rows")

# ─────────────────────────────────────────────────────────────
# 4. Scale features
#    SVM is distance-based — without scaling, large-range features
#    (like tx_count going 0–5000) dominate over small ones (like sin_hour).
# ─────────────────────────────────────────────────────────────
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)   # fit ONLY on train set
X_test_scaled  = scaler.transform(X_test)         # apply same scale to test

print(f"\n[4] Features scaled with StandardScaler (zero mean, unit variance)")

# ─────────────────────────────────────────────────────────────
# 5. Train SVM
#    kernel='rbf'  — handles non-linear boundaries well
#    C=10          — allows some misclassification for smoother boundary
#    gamma='scale' — 1 / (n_features * X.var()), good default
# ─────────────────────────────────────────────────────────────
print(f"\n[5] Training SVM (kernel=rbf, C=10, gamma=scale)...")
model = SVC(kernel='rbf', C=10, gamma='scale', probability=True, random_state=42)
model.fit(X_train_scaled, y_train)
print(f"    Done. Support vectors: {model.n_support_} (normal, attack)")

# ─────────────────────────────────────────────────────────────
# 6. Evaluate on test set
# ─────────────────────────────────────────────────────────────
y_pred  = model.predict(X_test_scaled)
y_proba = model.predict_proba(X_test_scaled)[:, 1]

accuracy = accuracy_score(y_test, y_pred)
roc_auc  = roc_auc_score(y_test, y_proba)

print(f"\n[6] Evaluation on held-out test set ({len(X_test)} rows):")
print(f"\n    Accuracy : {accuracy * 100:.2f}%")
print(f"    ROC-AUC  : {roc_auc:.4f}  (1.0 = perfect, 0.5 = random)")

print(f"\n    Classification Report:")
print(classification_report(y_test, y_pred, target_names=["Normal", "Attack"]))

cm = confusion_matrix(y_test, y_pred)
print(f"    Confusion Matrix:")
print(f"                  Predicted")
print(f"                 Normal  Attack")
print(f"    Actual Normal  {cm[0][0]:4d}    {cm[0][1]:4d}   ← false alarms")
print(f"    Actual Attack  {cm[1][0]:4d}    {cm[1][1]:4d}   ← missed attacks")

tn, fp, fn, tp = cm.ravel()
print(f"\n    True Negatives  (correct normal)  : {tn}")
print(f"    False Positives (false alarms)    : {fp}")
print(f"    False Negatives (missed attacks)  : {fn}")
print(f"    True Positives  (caught attacks)  : {tp}")

# ─────────────────────────────────────────────────────────────
# 7. Cross-validation (5-fold) on full dataset
#    Confirms the model isn't just lucky on one split
# ─────────────────────────────────────────────────────────────
print(f"\n[7] 5-fold cross-validation on full dataset...")
X_scaled_full = scaler.fit_transform(X)   # refit scaler on full data for CV
cv_scores = cross_val_score(
    SVC(kernel='rbf', C=10, gamma='scale', random_state=42),
    X_scaled_full, y, cv=5, scoring='accuracy'
)
print(f"    Fold scores : {[f'{s:.4f}' for s in cv_scores]}")
print(f"    Mean        : {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

# ─────────────────────────────────────────────────────────────
# 8. Retrain on FULL dataset before saving
#    Now that we know the model is good, train on all data
#    so it learns from as many examples as possible
# ─────────────────────────────────────────────────────────────
print(f"\n[8] Retraining on full dataset before saving...")
final_scaler = StandardScaler()
X_final = final_scaler.fit_transform(X)
final_model = SVC(kernel='rbf', C=10, gamma='scale', probability=True, random_state=42)
final_model.fit(X_final, y)
print(f"    Done. Support vectors: {final_model.n_support_}")

# ─────────────────────────────────────────────────────────────
# 9. Save model and scaler
# ─────────────────────────────────────────────────────────────
MODEL_PATH  = "bridge_svm_model.pkl"
SCALER_PATH = "bridge_scaler.pkl"

with open(MODEL_PATH, "wb") as f:
    pickle.dump(final_model, f)

with open(SCALER_PATH, "wb") as f:
    pickle.dump(final_scaler, f)

print(f"\n[9] Saved:")
print(f"    Model  → {MODEL_PATH}")
print(f"    Scaler → {SCALER_PATH}")

# ─────────────────────────────────────────────────────────────
# 10. Quick smoke test — run a fake normal and attack window
# ─────────────────────────────────────────────────────────────
print(f"\n[10] Smoke test (example predictions):")

test_cases = {
    "Normal window (quiet hour)": [
        18, 14, 12, 13,       # tx_count, unique_senders, receivers, pairs
        0.30, 2, 2.1, 3.5,    # avg_tx_per_sec, max_1sec, min_arr, std_arr
        0.15, 0.08, 3.2,      # top_sender_share, same_pair_ratio, entropy
        0.0, 1.0, -2.0        # sin_hour, cos_hour, rate_deviation
    ],
    "DDoS attack window": [
        3200, 2, 1, 2,
        53.3, 400, 0.0001, 0.002,
        0.95, 0.98, 0.1,
        -0.5, 0.8, 3180.0
    ],
    "Sybil attack window": [
        300, 180, 1, 180,
        5.0, 20, 0.02, 0.04,
        0.06, 0.97, 4.8,
        0.3, 0.9, 275.0
    ],
    "Bot loop window": [
        200, 4, 4, 4,
        3.3, 10, 0.298, 0.006,
        0.42, 0.96, 1.1,
        0.7, 0.7, 175.0
    ],
}

for name, features in test_cases.items():
    arr = np.array(features).reshape(1, -1)
    arr_scaled = final_scaler.transform(arr)
    pred  = final_model.predict(arr_scaled)[0]
    proba = final_model.predict_proba(arr_scaled)[0]
    label = "✅ NORMAL" if pred == 0 else "🚨 ATTACK"
    print(f"    {label}  ({name})  confidence: {max(proba):.1%}")

print(f"\n{'=' * 55}")
print(f"  Training complete.")
print(f"  Use bridge_svm_model.pkl + bridge_scaler.pkl for inference.")
print(f"{'=' * 55}\n")
