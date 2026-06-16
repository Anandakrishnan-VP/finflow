"""
ML model loader. Isolation Forest only — no LSTM, no PyTorch (O3).
RULE 5: joblib.load() only. SHA-256 verify before loading.
[FIX]: No `import torch`. No lstm entries in MODEL_PATHS or MODEL_HASHES.
"""
import os, hashlib, logging
import joblib
import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = os.getenv("MODEL_DIR", "/app/models")

# Only isolation_forest — no lstm_anomaly entry
MODEL_PATHS = {
    "isolation_forest": os.path.join(MODEL_DIR, "isolation_forest.joblib"),
}

# These SHA-256 hashes are populated by scripts/compute_hashes.py after training.
# Paste the output of compute_hashes.py here before deploying.
MODEL_HASHES: dict[str, str] = {
    "isolation_forest": "47006b3505d615a76a9476535f1fe6107f2edae772c6df869f6ed84a96b27c7a",
}


_loaded_models: dict = {}

def load_isolation_forest():
    """RULE 5: SHA-256 verify before loading."""
    key = "isolation_forest"
    if key in _loaded_models:
        return _loaded_models[key]
    path = MODEL_PATHS[key]
    if not os.path.exists(path):
        logger.error("Isolation Forest model not found at %s", path)
        return None
    actual_hash = hashlib.sha256(open(path, "rb").read()).hexdigest()
    expected_hash = MODEL_HASHES.get(key, "")
    if expected_hash and actual_hash != expected_hash:
        raise RuntimeError(
            f"SECURITY: Model hash mismatch for {key}. "
            f"Expected {expected_hash[:16]}... got {actual_hash[:16]}...")
    model = joblib.load(path)
    _loaded_models[key] = model
    logger.info("Isolation Forest loaded and verified.")
    return model
