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

MODEL_PATHS = {
    "isolation_forest": os.path.join(MODEL_DIR, "isolation_forest.joblib"),
    "lgbm_weak": os.path.join(MODEL_DIR, "lgbm_weak.joblib"),
}

# These SHA-256 hashes are populated by scripts/compute_hashes.py after training.
# Paste the output of compute_hashes.py here before deploying, or they will be
# loaded dynamically from hashes.json if present.
MODEL_HASHES: dict[str, str] = {
    "isolation_forest": "cff26a972bc18b97206bc3a7e15d2807a8782573c09c29451f5d7f464cffcc07",
    "lgbm_weak": "bee04789ccf39bf582d7c5ca98d70b92d956b31d35965f19120098f55f24c195",
}

def _get_expected_hash(key: str) -> str:
    json_path = os.path.join(MODEL_DIR, "hashes.json")
    if os.path.exists(json_path):
        try:
            import json
            with open(json_path, "r") as f:
                hashes = json.load(f)
                if key in hashes:
                    return hashes[key]
        except Exception:
            pass
    return MODEL_HASHES.get(key, "")

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
    expected_hash = _get_expected_hash(key)
    if expected_hash and actual_hash != expected_hash:
        raise RuntimeError(
            f"SECURITY: Model hash mismatch for {key}. "
            f"Expected {expected_hash[:16]}... got {actual_hash[:16]}...")
    model = joblib.load(path)
    _loaded_models[key] = model
    logger.info("Isolation Forest loaded and verified.")
    return model

def load_lgbm_weak():
    """RULE 5: SHA-256 verify before loading."""
    key = "lgbm_weak"
    if key in _loaded_models:
        return _loaded_models[key]
    path = MODEL_PATHS[key]
    if not os.path.exists(path):
        logger.error("LightGBM weak model not found at %s", path)
        return None
    actual_hash = hashlib.sha256(open(path, "rb").read()).hexdigest()
    expected_hash = _get_expected_hash(key)
    if expected_hash and actual_hash != expected_hash:
        raise RuntimeError(
            f"SECURITY: Model hash mismatch for {key}. "
            f"Expected {expected_hash[:16]}... got {actual_hash[:16]}...")
    model = joblib.load(path)
    _loaded_models[key] = model
    logger.info("LightGBM weak loaded and verified.")
    return model

