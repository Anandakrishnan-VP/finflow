"""
Train and save Isolation Forest model.
FIX O3: No LSTM training. torch not installed.
"""
import os, numpy as np
from sklearn.ensemble import IsolationForest
import joblib

MODEL_DIR = os.getenv("MODEL_DIR", "/app/models")
os.makedirs(MODEL_DIR, exist_ok=True)

print("Training Isolation Forest (contamination=auto)...")
# Generate representative synthetic training data
np.random.seed(42)
n_normal = 10000
normal_data = np.column_stack([
    np.random.lognormal(mean=10, sigma=1.5, size=n_normal),   # amount (log-normal)
    np.random.randint(0, 24, size=n_normal),                    # hour
    np.random.randint(0, 7,  size=n_normal),                    # day of week
    np.random.binomial(1, 0.4, size=n_normal).astype(float),   # is_credit
    np.random.binomial(1, 0.2, size=n_normal).astype(float),   # is_round
    np.random.binomial(1, 0.7, size=n_normal).astype(float),   # has_counterparty
])
# [A2 FIX] contamination='auto' — not a fixed float
model = IsolationForest(contamination='auto', n_estimators=200,
                         random_state=42, n_jobs=-1)
model.fit(normal_data)
output_path = os.path.join(MODEL_DIR, "isolation_forest.joblib")
joblib.dump(model, output_path)
print(f"Isolation Forest saved → {output_path}")
