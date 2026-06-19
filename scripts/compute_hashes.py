"""Compute SHA-256 hashes of trained models. Paste output into model_loader.py or load from hashes.json."""
import os, hashlib, json
MODEL_DIR = os.getenv("MODEL_DIR", "/app/models")
models = ["isolation_forest.joblib", "lgbm_weak.joblib"]
hashes = {}
for fname in models:
    path = os.path.join(MODEL_DIR, fname)
    if os.path.exists(path):
        h = hashlib.sha256(open(path, "rb").read()).hexdigest()
        key = fname.replace(".joblib", "")
        hashes[key] = h
        print(f'    "{key}": "{h}",')
    else:
        print(f"WARNING: {path} not found")

# Write to hashes.json in the models directory (volume mounted in Docker)
out_path = os.path.join(MODEL_DIR, "hashes.json")
try:
    with open(out_path, "w") as f:
        json.dump(hashes, f, indent=4)
    print(f"Successfully wrote hashes to {out_path}")
except Exception as e:
    print(f"Could not write hashes.json: {e}")

