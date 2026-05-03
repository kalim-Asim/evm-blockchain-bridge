import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score

df = pd.read_csv("bridge_anomaly_dataset.csv")
FEATURES = ['tx_count', 'unique_senders', 'unique_receivers', 'active_pairs',
            'avg_tx_per_sec', 'max_tx_in_1sec', 'min_interarrival', 'std_interarrival',
            'top_sender_share', 'same_pair_ratio', 'sender_entropy',
            'sin_hour', 'cos_hour', 'rate_deviation']
X = df[FEATURES].values
y = df['label'].values

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42, stratify=y)

np.random.seed(42)
noise_level = 0.75
X_train_noisy = X_train + np.random.normal(0, noise_level, X_train.shape)
X_test_noisy = X_test + np.random.normal(0, noise_level, X_test.shape)

rf = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
gbc = GradientBoostingClassifier(n_estimators=50, max_depth=3, random_state=42)
ensemble = VotingClassifier(estimators=[('rf', rf), ('gbc', gbc)], voting='soft')

ensemble.fit(X_train_noisy, y_train)

y_pred = ensemble.predict(X_test_noisy)
print(f"Ensemble Accuracy: {accuracy_score(y_test, y_pred)}")
