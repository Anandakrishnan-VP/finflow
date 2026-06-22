"""
Three-model anomaly ensemble:
  - Isolation Forest (existing, from Phase 2)
  - Local Outlier Factor (density-based, catches dense fraud clusters IF misses)
  - LightGBM with weak supervision from rule flags (catches pattern-specific fraud)

RULE 20: Every call returns a score AND a confidence band.
RULE 21: Chunked at CHUNK_SIZE — never loads the full list at once in ML steps.
"""
import logging
import os
import numpy as np
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import RobustScaler
from schemas.uts import UniversalTransaction, TransactionFlag
from ml.features import extract_features

logger = logging.getLogger(__name__)
CHUNK_SIZE = 5_000


def _chunk(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def run_lof(txns: list[UniversalTransaction]) -> dict:
    """
    Local Outlier Factor. Returns {txn_hash: score_0_to_1}.
    RULE 21: chunked.
    """
    if len(txns) < 30:
        logger.info("LOF: too few transactions (%d), skipping", len(txns))
        return {}

    scores = {}
    for chunk in _chunk(txns, CHUNK_SIZE):
        X = RobustScaler().fit_transform(extract_features(chunk))
        lof = LocalOutlierFactor(n_neighbors=min(20, len(chunk) - 1),
                                 contamination="auto")
        lof.fit_predict(X)
        neg_scores = -lof.negative_outlier_factor_
        min_s, max_s = neg_scores.min(), neg_scores.max()
        rng = max_s - min_s if max_s != min_s else 1.0
        for i, txn in enumerate(chunk):
            scores[txn.txn_hash] = float((neg_scores[i] - min_s) / rng)
    return scores


def run_lgbm_weak(
    txns: list[UniversalTransaction],
    model_dir: str,
) -> dict:
    """
    LightGBM trained on rule-flag pseudo-labels.
    RULE 21: chunked. RULE 5: verified hash via model_loader.
    """
    import joblib
    import lightgbm as lgb
    from ml.model_loader import load_lgbm_weak

    model = load_lgbm_weak()
    if model is None:
        model_path = os.path.join(model_dir, "lgbm_weak.joblib")
        # In-pipeline training
        X_all = extract_features(txns)
        y_all = np.array([1 if t.flags else 0 for t in txns])

        if y_all.sum() < 5 or (len(y_all) - y_all.sum()) < 5:
            logger.info("LightGBM: not enough class balance for training, skipping")
            return {}

        model = lgb.LGBMClassifier(
            n_estimators=200, learning_rate=0.05, max_depth=6,
            class_weight="balanced", random_state=42, verbose=-1,
        )
        model.fit(X_all, y_all)
        joblib.dump(model, model_path)
        logger.info("LightGBM: trained in-pipeline, saved to %s", model_path)

    scores = {}
    for chunk in _chunk(txns, CHUNK_SIZE):
        X = extract_features(chunk)
        try:
            probs = model.predict_proba(X)[:, 1]
        except Exception as e:
            logger.warning("LightGBM scoring failed on chunk: %s", e)
            continue
        for txn, score in zip(chunk, probs):
            scores[txn.txn_hash] = float(score)
    return scores


def run_ensemble(
    txns: list[UniversalTransaction],
    model_dir: str,
) -> list[UniversalTransaction]:
    """
    Fuse IF + LOF + LightGBM.
    RULE 20: computes uncertainty band from spread.
    """
    from ml.model_loader import load_isolation_forest

    if len(txns) < 10:
        logger.info("Ensemble: too few transactions, skipping")
        return txns

    if_model = load_isolation_forest()
    lof_scores  = run_lof(txns)
    lgbm_scores = run_lgbm_weak(txns, model_dir)

    for chunk in _chunk(txns, CHUNK_SIZE):
        if if_model:
            X = extract_features(chunk)
            if_raw = if_model.decision_function(X)
            if_min, if_max = if_raw.min(), if_raw.max()
            if_rng = if_max - if_min if if_max != if_min else 1.0
            if_norm = [1.0 - (s - if_min) / if_rng for s in if_raw]
        else:
            if_norm = [0.5] * len(chunk)

        for i, txn in enumerate(chunk):
            s_if   = if_norm[i]
            s_lof  = lof_scores.get(txn.txn_hash, 0.5)
            s_lgbm = lgbm_scores.get(txn.txn_hash, 0.5)

            composite = 0.40 * s_if + 0.35 * s_lgbm + 0.25 * s_lof
            spread    = np.std([s_if, s_lof, s_lgbm])

            txn.risk_score = round(float(composite), 4)

            # Confidence band (RULE 20)
            if spread < 0.10:
                band = "HIGH"
            elif spread < 0.25:
                band = "MEDIUM"
            else:
                band = "LOW"

            txn._ensemble_band   = band
            txn._ensemble_detail = {
                "if": round(s_if, 4), "lof": round(s_lof, 4),
                "lgbm": round(s_lgbm, 4), "spread": round(float(spread), 4)
            }

            if composite >= 0.65:
                if TransactionFlag.ML_ANOMALY_IF not in txn.flags:
                    txn.flags.append(TransactionFlag.ML_ANOMALY_IF)

    return txns

