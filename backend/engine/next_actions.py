import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

def get_suggestions_for_account(account_id: str, role: str, flags: set[str], composite_score: float) -> list[dict]:
    """
    Given an account's auto-labeled role, flags, and score, returns a list of
    suggested legal and investigative next actions under BNSS (formerly CrPC).
    """
    suggestions = []

    # Mule or Dormant accounts: urgent freezing and KYC request
    if role in ("MULE", "DORMANT_SUSPECT"):
        suggestions.append({
            "action_key": "FREEZE_ACCOUNT",
            "action_text": f"Coordinate with the nodal bank officer to freeze Account {account_id} under Section 106 of BNSS (formerly CrPC 102)."
        })
        suggestions.append({
            "action_key": "REQUEST_KYC_AOF",
            "action_text": f"Issue a notice under Section 94 of BNSS (formerly CrPC 91) to the bank manager requesting the Account Opening Form (AOF), KYC documentation, and login IP history for Account {account_id}."
        })

    # Aggregator: network tracing and payment gateway notices
    if role == "AGGREGATOR":
        suggestions.append({
            "action_key": "TRACE_DOWNSTREAM",
            "action_text": f"Issue a notice under Section 94 of BNSS to trace downstream transfer paths and identify the immediate beneficiaries receiving funds from Aggregator Account {account_id}."
        })
        suggestions.append({
            "action_key": "REQUEST_SDR_CDR",
            "action_text": f"Request Subscriber Detail Records (SDR) and Call Detail Records (CDR) of the mobile number linked to Aggregator Account {account_id}."
        })

    # Cash out runners: CCTV requests and local surveillance
    if role == "CASH_OUT":
        suggestions.append({
            "action_key": "REQUEST_CCTV",
            "action_text": f"Request CCTV footage from the ATM chamber / bank branch where the cash withdrawals occurred for Account {account_id} around transaction timestamps."
        })
        suggestions.append({
            "action_key": "DEPLOY_INTELLIGENCE",
            "action_text": f"Deploy local intelligence or coordinate with the local police station to physically identify the cash-out runner using CCTV profiles near the ATM location."
        })

    # Alert-specific rules: Loop flows
    if any("CIRCULAR_FLOW" in f or "ROUND_TRIP" in f for f in flags):
        suggestions.append({
            "action_key": "MCA_SEARCH",
            "action_text": f"Conduct a Ministry of Corporate Affairs (MCA) registry search to identify common directors or beneficial owners behind the shell companies linked to Account {account_id}."
        })

    # Alert-specific rules: Watchlist hits
    if any("WATCHLIST" in f for f in flags):
        suggestions.append({
            "action_key": "CCTNS_CROSSREF",
            "action_text": f"Cross-reference the account owner of {account_id} with the active CCTNS (Crime and Criminal Tracking Network & Systems) database for past criminal history and register a Look Out Circular (LOC) if they are a flight risk."
        })

    # Alert-specific rules: Structuring/Layering
    if any("STRUCTURING" in f or "LAYERING" in f for f in flags):
        suggestions.append({
            "action_key": "VERIFY_STRUCTURING",
            "action_text": f"Analyze patterns of multiple deposits just below reporting thresholds in Account {account_id} and request bank for PAN card details and source validation for depositors."
        })

    # Alert-specific rules: Pass-through behavior
    if any("PASSTHROUGH" in f or "HIGH_VOLUME" in f for f in flags):
        suggestions.append({
            "action_key": "TRACE_GATEWAYS",
            "action_text": f"Issue a notice under Section 94 of BNSS to the relevant payment gateways or banks to retrieve transaction logging, IP addresses, and MAC details linked to transfers in Account {account_id}."
        })

    # Alert-specific rules: ML Anomaly
    if any("ML_ANOMALY" in f or "ANOMALY" in f for f in flags):
        suggestions.append({
            "action_key": "REQUEST_STR_CTR",
            "action_text": f"Request the bank's compliance officer to provide any Suspicious Transaction Reports (STRs) or Cash Transaction Reports (CTRs) filed for Account {account_id}."
        })

    # Default action for any flagged account with composite score >= 20
    if composite_score >= 20 and not suggestions:
        suggestions.append({
            "action_key": "MONITOR_TXNS",
            "action_text": f"Monitor transaction volume and issue a Section 94 BNSS notice to the bank for complete statement updates of Account {account_id}."
        })

    return suggestions


async def generate_case_next_actions(db, case_id: str, verdict_rows: list[dict], transactions: list):
    """
    Runs the next actions rules for all accounts in a case and populates the DB.
    """
    logger.info("Generating next actions for case %s", case_id)
    
    # Pre-map transactions to accounts to gather all flags
    from collections import defaultdict
    acc_flags = defaultdict(set)
    for t in transactions:
        for f in t.flags:
            acc_flags[t.account_id].add(str(f))

    all_suggestions = []
    for r in verdict_rows:
        account_id = r["account_id"]
        role = r["role_label"]
        composite_score = r["composite_score"]
        flags = acc_flags[account_id]
        
        # Don't create actions for clear accounts unless score is high or they have alerts
        if role == "CLEAR" and composite_score < 50 and not flags:
            continue
            
        suggs = get_suggestions_for_account(account_id, role, flags, composite_score)
        for s in suggs:
            all_suggestions.append({
                "account_id": account_id,
                "action_key": s["action_key"],
                "action_text": s["action_text"]
            })

    # Insert into database using INSERT ... ON CONFLICT DO NOTHING
    for s in all_suggestions:
        await db.execute(
            text("""
                INSERT INTO case_next_actions (case_id, account_id, action_key, action_text)
                VALUES (:cid, :aid, :key, :text)
                ON CONFLICT (case_id, account_id, action_key) DO NOTHING
            """),
            {
                "cid": case_id,
                "aid": s["account_id"],
                "key": s["action_key"],
                "text": s["action_text"]
            }
        )
    await db.commit()
    logger.info("Inserted %d next action suggestions for case %s", len(all_suggestions), case_id)
