import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import IsolationForest
from sklearn.metrics import accuracy_score
df = pd.read_csv("bridge_anomaly_dataset.csv")
FEATURES = ['tx_count', 'unique_senders', 'unique_receivers', 'active_pairs',
            'avg_tx_per_sec', 'max_tx_in_1sec', 'min_interarrival', 'std_interarrival',
            'top_sender_share', 'same_pair_ratio', 'sender_entropy',
            'sin_hour', 'cos_hour']
X = df[FEATURES].values
y = df['label'].values

# For IF, train only on normal data
X_train_normal = df[df['label'] == 0][FEATURES].values
X_test = df[FEATURES].values
y_test = df['label'].values

iso = IsolationForest(contamination=0.1, random_state=42)
iso.fit(X_train_normal)

# predict returns 1 for normal, -1 for anomaly. Convert to 0 for normal, 1 for attack
y_pred = [0 if p == 1 else 1 for p in iso.predict(X_test)]
print("Isolation Forest Accuracy:", accuracy_score(y_test, y_pred))
