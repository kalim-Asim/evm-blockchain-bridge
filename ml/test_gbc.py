import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score

df = pd.read_csv("bridge_anomaly_dataset.csv")
FEATURES = ['tx_count', 'unique_senders', 'unique_receivers', 'active_pairs',
            'avg_tx_per_sec', 'max_tx_in_1sec', 'min_interarrival', 'std_interarrival',
            'top_sender_share', 'same_pair_ratio', 'sender_entropy',
            'sin_hour', 'cos_hour', 'rate_deviation']
X = df[FEATURES].values
y = df['label'].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

gbc = GradientBoostingClassifier(n_estimators=10, max_depth=1, learning_rate=0.5, random_state=42)
gbc.fit(X_train, y_train)

y_pred = gbc.predict(X_test)
print("GBC Accuracy:", accuracy_score(y_test, y_pred))
