import logging
from collections import defaultdict
from schemas.uts import UniversalTransaction
from graph.algorithms import rank_normalize

logger = logging.getLogger(__name__)

REVIEW_THRESHOLD = 50  # composite_score >= this => algo_verdict = FLAGGED

# SEVERITY_WEIGHTS literally matches AlertsTable.jsx's severity map:
# high = 1.0, medium = 0.6, low = 0.3
SEVERITY_WEIGHTS = {
    "CIRCULAR_FLOW": 1.0,
    "ROUND_TRIP": 1.0,
    "LAYERING": 1.0,
    "STRUCTURING": 1.0,
    "WATCHLIST_HIT": 1.0,
    "FAN_OUT_PATTERN": 0.6,
    "FAN_IN_PATTERN": 0.6,
    "PASSTHROUGH_SUSPECTED": 0.6,
    "DORMANT_ACTIVATION": 0.6,
    "ML_ANOMALY_ISOLATION_FOREST": 0.6,
    "BALANCE_MISMATCH": 0.3,
    "LOW_OCR_CONFIDENCE": 0.3,
    "FAILED_TXN": 0.3,
    "TIMING_REGULARITY": 0.3,
    "CASH_INTENSIVE": 0.3,
}


def _rule_severity(flags: set[str]) -> float:
    """
    Noisy-OR combination so multiple medium-severity flags compound toward 1
    without a naive sum blowing past it. Two 0.6-weight flags together score
    0.84, not 1.2-clipped-to-1 — appropriately higher than either alone, but
    not falsely maxed out.
    """
    combined = 1.0
    for f in flags:
        # Normalize incoming flag format to match SEVERITY_WEIGHTS keys
        key = f.replace("TransactionFlag.", "").replace("ML_ANOMALY_IF", "ML_ANOMALY_ISOLATION_FOREST")
        w = SEVERITY_WEIGHTS.get(key, 0.3)
        combined *= (1 - w)
    return round(1 - combined, 4)


def compute_composite_scores(
    transactions: list[UniversalTransaction],
    taint_scores: dict,
    betweenness_scores: dict,
) -> dict:
    """
    Returns {account_id: {"composite_score": int, "breakdown": {...}, "algo_verdict": str}}.
    Weights: watchlist 25 / rule severity 20 / Isolation Forest 20 / taint 20 / betweenness 15.
    All five normalized 0–1 before weighting, so the max possible score is exactly 100.
    """
    by_account = defaultdict(list)
    for t in transactions:
        by_account[t.account_id].append(t)

    taint_pct = rank_normalize(taint_scores)
    betw_pct = rank_normalize(betweenness_scores)

    results = {}
    for account_id, txns in by_account.items():
        all_flags = set()
        for t in txns:
            all_flags.update(str(f) for f in t.flags)

        watchlist_hit = 1.0 if any("WATCHLIST_HIT" in str(f) for f in all_flags) else 0.0
        rule_severity = _rule_severity(all_flags)
        if_score = max((t.risk_score or 0.0) for t in txns) if txns else 0.0
        taint = taint_pct.get(account_id, 0.0)
        betw = betw_pct.get(account_id, 0.0)

        breakdown = {
            "watchlist_hit": round(25 * watchlist_hit, 1),
            "rule_severity": round(20 * rule_severity, 1),
            "isolation_forest": round(20 * if_score, 1),
            "taint_propagation": round(20 * taint, 1),
            "betweenness": round(15 * betw, 1),
        }
        composite = min(100, sum(breakdown.values()))

        results[account_id] = {
            "composite_score": round(composite),
            "breakdown": breakdown,
            "algo_verdict": "FLAGGED" if composite >= REVIEW_THRESHOLD else "CLEAR",
        }
    return results


import random

TOP_N_REVIEW = 8     # highest-scoring flagged accounts always reviewed by the LLM
SPOT_CHECK_K = 3      # random sample of CLEAR accounts, so the LLM occasionally
                      # gets a chance to catch something the algorithm missed


def select_accounts_for_llm_review(composite_results: dict) -> list[str]:
    """RULE 17: bounded review pool — predictable LLM call count regardless of case size."""
    flagged = sorted(
        ((aid, r["composite_score"]) for aid, r in composite_results.items()
         if r["algo_verdict"] == "FLAGGED"),
        key=lambda x: -x[1],
    )
    top_n = [aid for aid, _ in flagged[:TOP_N_REVIEW]]

    clear_pool = [aid for aid, r in composite_results.items() if r["algo_verdict"] == "CLEAR"]
    spot_check = random.sample(clear_pool, min(SPOT_CHECK_K, len(clear_pool))) if clear_pool else []

    return list(set(top_n + spot_check))
