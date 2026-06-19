"""
Feature extraction for the FinFlow ML ensemble.
22 features, up from 10, split into four groups:
  A. Amount signals (4) — raw, log, round-number, threshold proximity
  B. Temporal signals (5) — hour circular, weekday, weekend, velocity
  C. Account-relative signals (7) — z-score within account, passthrough ratio,
     fan-out ratio, days-since-last, rolling volume, retention ratio, counterparty diversity
  D. Narration signals (2) — cash keywords, narration length
  E. Structural signals (4) — has counterparty, is credit, near STR, near CTR

All monetary inputs must be Decimal or float of a Decimal — never raw Python float
from a database row that came from a NUMERIC column without explicit conversion.

Exported symbols used by ensemble.py:
  extract_features(txns)       — list[UniversalTransaction] -> np.ndarray
  extract_features_df(df)      — pd.DataFrame -> np.ndarray   (for training)
  FEATURE_NAMES                — list[str]  (22 elements, same order as matrix cols)
"""
import re
import numpy as np
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)

STR_THRESHOLD = 500_000
GRID_STR_THRESHOLD = 500_000
CTR_THRESHOLD = 1_000_000
STRUCTURING_BAND = 0.05          # within 5% of threshold
CASH_KEYWORDS = re.compile(
    r"\b(cash|atm|cdm|withdrawal|deposit cash|cash deposit|self|by hand)\b",
    re.IGNORECASE
)

FEATURE_NAMES = [
    # A. Amount
    "log_amount",               # 0
    "is_round_500",             # 1 — divisible by 500 (Indian ATM denomination)
    "is_round_1000",            # 2
    "near_str",                 # 3 — within STRUCTURING_BAND of STR threshold
    "near_ctr",                 # 4
    # B. Temporal
    "hour_sin",                 # 5
    "hour_cos",                 # 6
    "day_of_week",              # 7
    "is_weekend",               # 8
    "is_off_hours",             # 9 — 22:00–05:00, atypical for legitimate transfers
    # C. Account-relative
    "amount_zscore",            # 10 — z-score of this amount within account history
    "passthrough_ratio",        # 11 — total_debits / total_credits for account
    "retention_ratio",          # 12 — 1 - passthrough_ratio, clipped 0–1
    "fan_out_ratio",            # 13 — unique counterparties / total transactions
    "days_since_last",          # 14 — inter-transaction gap in days (log-scaled)
    "rolling_7d_count",         # 15 — transaction count in past 7 days (log-scaled)
    "rolling_7d_volume_log",    # 16 — total volume in past 7 days (log-scaled)
    # D. Narration
    "is_cash_related",          # 17
    "narration_length_log",     # 18 — short narrations are suspicious
    # E. Structural
    "is_credit",                # 19
    "has_counterparty",         # 20
    "raw_amount_log_clipped",   # 21 — log(amount) clipped at 20 (handles outliers)
]
assert len(FEATURE_NAMES) == 22


# ─── Inference path (called from ensemble.py with UniversalTransaction objects) ───

def extract_features(txns: list) -> np.ndarray:
    """
    Build feature matrix from a list of UniversalTransaction objects.
    Account-relative features are computed from the full list context
    (all transactions passed in), not just the individual row.
    """
    if not txns:
        return np.empty((0, 22), dtype=np.float64)

    # Pre-compute account-level stats for account-relative features
    account_stats = _compute_account_stats(txns)

    rows = []
    for txn in txns:
        rows.append(_txn_to_features(txn, account_stats))
    return np.array(rows, dtype=np.float64)


def _txn_to_features(txn, account_stats: dict) -> list:
    amt   = float(txn.amount) if txn.amount else 0.0
    hour  = txn.txn_date.hour
    dow   = txn.txn_date.weekday()
    stats = account_stats.get(txn.account_id, _empty_stats())

    return [
        # A. Amount
        np.log1p(amt),
        1.0 if amt % 500 == 0 else 0.0,
        1.0 if amt % 1000 == 0 else 0.0,
        1.0 if STR_THRESHOLD * (1 - STRUCTURING_BAND) <= amt < STR_THRESHOLD else 0.0,
        1.0 if CTR_THRESHOLD * (1 - STRUCTURING_BAND) <= amt < CTR_THRESHOLD else 0.0,
        # B. Temporal
        np.sin(2 * np.pi * hour / 24),
        np.cos(2 * np.pi * hour / 24),
        float(dow),
        1.0 if dow >= 5 else 0.0,
        1.0 if hour >= 22 or hour <= 5 else 0.0,
        # C. Account-relative
        _zscore(amt, stats["mean"], stats["std"]),
        min(1.0, stats["passthrough"]),
        max(0.0, 1.0 - min(1.0, stats["passthrough"])),
        min(1.0, stats["fan_out"]),
        np.log1p(stats["days_since_last"]),
        np.log1p(stats["rolling_7d_count"]),
        np.log1p(stats["rolling_7d_volume"]),
        # D. Narration
        1.0 if CASH_KEYWORDS.search(txn.narration or "") else 0.0,
        np.log1p(len(txn.narration or "")),
        # E. Structural
        1.0 if str(txn.txn_type) in ("CR", "CREDIT") else 0.0,
        1.0 if txn.counterparty_account else 0.0,
        min(20.0, np.log1p(amt)),
    ]


def _zscore(value: float, mean: float, std: float) -> float:
    if std == 0:
        return 0.0
    return float(np.clip((value - mean) / std, -5, 5))


def _empty_stats() -> dict:
    return {"mean": 0, "std": 1, "passthrough": 0, "fan_out": 0,
            "days_since_last": 0, "rolling_7d_count": 0, "rolling_7d_volume": 0}


def _compute_account_stats(txns: list) -> dict:
    """
    Compute account-level aggregates needed for account-relative features.
    Single pass through the list.
    """
    from collections import defaultdict
    from datetime import timedelta

    by_account = defaultdict(list)
    for t in txns:
        by_account[t.account_id].append(t)

    stats = {}
    for account_id, account_txns in by_account.items():
        sorted_txns = sorted(account_txns, key=lambda t: t.txn_date)
        amounts = [float(t.amount) for t in sorted_txns]
        mean_a  = float(np.mean(amounts)) if amounts else 0.0
        std_a   = float(np.std(amounts)) if len(amounts) > 1 else 1.0

        total_cr = sum(float(t.amount) for t in sorted_txns
                       if str(t.txn_type) in ("CR", "CREDIT"))
        total_dr = sum(float(t.amount) for t in sorted_txns
                       if str(t.txn_type) in ("DR", "DEBIT"))
        passthrough = (total_dr / total_cr) if total_cr > 0 else 0.0

        counterparties = {t.counterparty_account for t in sorted_txns
                          if t.counterparty_account}
        fan_out = len(counterparties) / len(sorted_txns) if sorted_txns else 0.0

        # Days since last transaction for each txn — use last txn's gap for simplicity
        gaps = []
        for i in range(1, len(sorted_txns)):
            gaps.append(
                (sorted_txns[i].txn_date - sorted_txns[i-1].txn_date).days)
        days_since_last = gaps[-1] if gaps else 0

        # Rolling 7-day window for the last transaction
        if sorted_txns:
            last_date  = sorted_txns[-1].txn_date
            week_ago   = last_date - timedelta(days=7)
            window     = [t for t in sorted_txns if t.txn_date >= week_ago]
            rolling_count  = len(window)
            rolling_volume = sum(float(t.amount) for t in window)
        else:
            rolling_count, rolling_volume = 0, 0.0

        stats[account_id] = {
            "mean": mean_a, "std": std_a,
            "passthrough": passthrough,
            "fan_out": fan_out,
            "days_since_last": days_since_last,
            "rolling_7d_count": rolling_count,
            "rolling_7d_volume": rolling_volume,
        }
    return stats


# ─── Training path (called from train_models.py with a pandas DataFrame) ────────

def extract_features_df(df) -> np.ndarray:
    """
    Converts a pandas DataFrame (output of generate_training_data.py) into the
    feature matrix. Column names match the CSV output of the generator.
    All 22 FEATURE_NAMES columns must be present in df.
    """
    return df[FEATURE_NAMES].values.astype(np.float64)
