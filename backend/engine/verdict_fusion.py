import logging

logger = logging.getLogger(__name__)


def fuse_verdict(algo_verdict: str, llm_verdict: str) -> dict:
    """
    Combines algorithmic classification and LLM second opinions into human-actionable priority tiers.
    RULE 15: Never collapse algo + LLM verdicts into a single boolean.
    RULE 16: Agreement tiers are prioritization indicators, never auto-disposal.
    """
    algo = algo_verdict.upper()
    llm = llm_verdict.upper()

    # 6-state Verdict Reconciliation Matrix
    if algo == "FLAGGED" and llm == "SUSPICIOUS":
        return {
            "agreement_tier": "CROSS_VALIDATED_HIGH",
            "tier_label": "Cross-Validated High Suspicion (Both Engine & AI audit flagged this account)",
            "review_priority": 0,
        }
    elif algo == "FLAGGED" and llm == "NOT_SUSPICIOUS":
        return {
            "agreement_tier": "DIVERGENT_ALGO_ONLY",
            "tier_label": "Divergent Alert: Algo Flagged, AI Clear (Statistical/network flag disputed by AI narrative audit)",
            "review_priority": 1,
        }
    elif algo == "CLEAR" and llm == "SUSPICIOUS":
        return {
            "agreement_tier": "DIVERGENT_LLM_ONLY",
            "tier_label": "Divergent Alert: AI Flagged, Algo Clear (AI identified patterns not caught by hard rules/models)",
            "review_priority": 2,
        }
    elif algo == "FLAGGED" and llm == "NOT_REVIEWED":
        return {
            "agreement_tier": "ALGO_FLAGGED_PENDING_REVIEW",
            "tier_label": "Algo Flagged: Awaiting AI Audit (Outside bounded pool, click to run second opinion)",
            "review_priority": 3,
        }
    elif algo == "CLEAR" and llm == "NOT_REVIEWED":
        return {
            "agreement_tier": "ALGO_CLEAR_NOT_REVIEWED",
            "tier_label": "Algo Clear (De-prioritized, not selected for AI spot-check)",
            "review_priority": 4,
        }
    elif algo == "CLEAR" and llm == "NOT_SUSPICIOUS":
        return {
            "agreement_tier": "CROSS_VALIDATED_CLEAR",
            "tier_label": "Cross-Validated Clear (Both Engine & AI spot-check audit agree this account is normal)",
            "review_priority": 5,
        }
    else:
        # UNKNOWN fallback branch must be retained per user instructions
        logger.warning("Unknown verdict combination: algo=%s, llm=%s", algo, llm)
        return {
            "agreement_tier": "UNKNOWN",
            "tier_label": f"Unknown Verdict Combination (Algo: {algo_verdict}, LLM: {llm_verdict})",
            "review_priority": 99,
        }
