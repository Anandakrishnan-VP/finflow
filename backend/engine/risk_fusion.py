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


def compute_role_label(
    account_id: str,
    txns: list,
    composite_score: float,
    betweenness: float,
) -> str:
    """
    Auto-labels an account based on financial behavior and risk score.
    Returns MULE, AGGREGATOR, CASH_OUT, DORMANT_SUSPECT, or CLEAR.
    """
    if not txns:
        return "CLEAR"

    total_credit = sum(t.amount for t in txns if str(t.txn_type) in ("CR", "CREDIT"))
    total_debit = sum(t.amount for t in txns if str(t.txn_type) in ("DR", "DEBIT"))
    
    # Collect all flags
    all_flags = set(str(f) for t in txns for f in t.flags)
    
    # Cash intensive calculation
    cash_amount = sum(
        t.amount for t in txns 
        if str(t.txn_type) in ("DR", "DEBIT") and 
        ("CASH" in str(t.flags) or "CASH_INTENSIVE" in str(t.flags) or 
         any(keyword in (t.narration or "").lower() for keyword in ["cash", "atm", "self", "withdrawal", "withdraw"]))
    )
    
    cash_ratio = float(cash_amount / total_debit) if total_debit > 0 else 0.0
    pass_through_ratio = float(total_debit / total_credit) if total_credit > 0 else 0.0
    
    # Counterparty details
    in_counterparties = set(t.counterparty_account for t in txns if str(t.txn_type) in ("CR", "CREDIT") and t.counterparty_account)
    out_counterparties = set(t.counterparty_account for t in txns if str(t.txn_type) in ("DR", "DEBIT") and t.counterparty_account)
    
    in_degree = len(in_counterparties)
    out_degree = len(out_counterparties)
    
    dates = [t.txn_date for t in txns if t.txn_date]
    txn_range_days = (max(dates) - min(dates)).days if len(dates) > 1 else 0
    
    # 1. DORMANT_SUSPECT: Has DORMANT_ACTIVATION flag and significant composite score/inflows
    if any("DORMANT_ACTIVATION" in f for f in all_flags) and (composite_score >= 40 or total_credit > 10000):
        return "DORMANT_SUSPECT"
        
    # 2. CASH_OUT: Cash ratio is high (> 0.5) and significant debit activity
    if cash_ratio >= 0.5 and total_debit > 5000:
        return "CASH_OUT"
        
    # 3. MULE: High pass-through behavior, low retention of balance, high structuring/layering or fan patterns
    is_passthrough = 0.9 <= pass_through_ratio <= 1.1
    has_mule_flags = any(
        any(flag_name in f for flag_name in ["STRUCTURING", "LAYERING", "PASSTHROUGH_SUSPECTED", "FAN_IN_PATTERN", "FAN_OUT_PATTERN"])
        for f in all_flags
    )
    if (is_passthrough and has_mule_flags and composite_score >= 40) or (is_passthrough and composite_score >= 60):
        return "MULE"
        
    # 4. AGGREGATOR: Receives from many sources (high in-degree) and forwards to others, or high betweenness
    if (in_degree >= 3 and out_degree >= 1 and composite_score >= 40) or (betweenness >= 0.4 and composite_score >= 40):
        return "AGGREGATOR"

    # Default to CLEAR
    return "CLEAR"


def compute_composite_scores(
    transactions: list[UniversalTransaction],
    taint_scores: dict,
    betweenness_scores: dict,
) -> dict:
    """
    Returns {account_id: {"composite_score": int, "breakdown": {...}, "algo_verdict": str, "role_label": str}}.
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

        role = compute_role_label(account_id, txns, composite, betw)

        results[account_id] = {
            "composite_score": round(composite),
            "breakdown": breakdown,
            "algo_verdict": "FLAGGED" if composite >= REVIEW_THRESHOLD else "CLEAR",
            "role_label": role,
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
