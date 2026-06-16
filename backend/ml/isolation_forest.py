"""
Isolation Forest anomaly detection.
[FIX A2]: contamination='auto' (not fixed float) to avoid sklearn warnings on small datasets.
RULE 1: Feature extraction uses Decimal → float conversion only at sklearn boundary.
"""
import logging
import numpy as np
from decimal import Decimal
from schemas.uts import UniversalTransaction, TransactionFlag
from ml.model_loader import load_isolation_forest

logger = logging.getLogger(__name__)

def extract_features(txns: list[UniversalTransaction]) -> np.ndarray:
    """
    Feature vector per transaction. Decimal → float only at this sklearn boundary.
    Features: [amount, hour_of_day, day_of_week, is_credit, is_round_amount,
               counterparty_is_known]
    """
    rows = []
    for t in txns:
        amount_f    = float(t.amount)
        hour        = t.txn_date.hour
        dow         = t.txn_date.weekday()
        is_credit   = 1.0 if t.txn_type in ("CR", "CREDIT", "CR") else 0.0
        is_round    = 1.0 if t.amount % 1000 == 0 else 0.0
        has_cp      = 1.0 if t.counterparty_account else 0.0
        rows.append([amount_f, hour, dow, is_credit, is_round, has_cp])
    return np.array(rows, dtype=np.float64)

def run_isolation_forest(txns: list[UniversalTransaction]) -> list[UniversalTransaction]:
    """Score transactions. Anomalies flagged as ML_ANOMALY_IF."""
    if len(txns) < 10:
        logger.info("Too few transactions (%d) for Isolation Forest — skipping.", len(txns))
        return txns
    model = load_isolation_forest()
    if model is None:
        logger.warning("Isolation Forest model unavailable — skipping ML scoring.")
        return txns
    try:
        X = extract_features(txns)
        scores = model.decision_function(X)   # Negative = more anomalous
        predictions = model.predict(X)         # -1 = anomaly, 1 = normal
        # Normalize score to 0.0-1.0 (anomaly probability)
        score_min, score_max = scores.min(), scores.max()
        score_range = score_max - score_min if score_max != score_min else 1.0
        for i, txn in enumerate(txns):
            normalized = 1.0 - (scores[i] - score_min) / score_range
            txn.risk_score = round(float(normalized), 4)
            if predictions[i] == -1:
                if TransactionFlag.ML_ANOMALY_IF not in txn.flags:
                    txn.flags.append(TransactionFlag.ML_ANOMALY_IF)
    except Exception as e:
        logger.error("Isolation Forest scoring failed: %s", e)
    return txns
