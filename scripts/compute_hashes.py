"""Compute SHA-256 hashes of trained models. Paste output into model_loader.py."""
import os, hashlib
MODEL_DIR = os.getenv("MODEL_DIR", "/app/models")
models = ["isolation_forest.joblib"]
for fname in models:
    path = os.path.join(MODEL_DIR, fname)
    if os.path.exists(path):
        h = hashlib.sha256(open(path, "rb").read()).hexdigest()
        key = fname.replace(".joblib", "")
        print(f'    "{key}": "{h}",')
    else:
        print(f"WARNING: {path} not found")
