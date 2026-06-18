import json
import logging
from llm.client import generate
from llm.prompts import SECOND_OPINION_PROMPT
from schemas.uts import UniversalTransaction

logger = logging.getLogger(__name__)

NULL_VERDICT = {
    "verdict": "NOT_REVIEWED",
    "confidence": "LOW",
    "reasoning": "LLM review skipped or failed.",
}


async def get_second_opinion(
    account_id: str,
    transactions: list[UniversalTransaction],
) -> dict:
    """
    Asks the LLM for a blind audit of an account's transactions.
    RULE 19: Only raw transaction data is passed — no algorithmic flags, risk scores,
    or pre-judgment hints.
    """
    if not transactions:
        return NULL_VERDICT

    # Extract ONLY raw fields to maintain strict blind-audit compliance
    raw_data = []
    for t in transactions:
        raw_data.append({
            "date": t.txn_date.isoformat() if hasattr(t.txn_date, "isoformat") else str(t.txn_date),
            "narration": t.narration,
            "amount": float(t.amount),
            "type": t.txn_type.value if hasattr(t.txn_type, "value") else str(t.txn_type),
            "counterparty_account": t.counterparty_account,
            "counterparty_name": t.counterparty_name,
        })

    payload = {
        "account_id": account_id,
        "transactions": raw_data,
    }

    try:
        raw_response = await generate(
            payload,
            SECOND_OPINION_PROMPT,
            case_classification=1,
            response_key="second_opinion",
        )
        # Handle template mode string or double-encoded templates
        if isinstance(raw_response, str):
            try:
                res = json.loads(raw_response)
            except json.JSONDecodeError:
                # In case template mode returned a raw string, wrap it or look it up
                res = {
                    "verdict": "SUSPICIOUS" if "SUSPICIOUS" in raw_response.upper() else "NOT_SUSPICIOUS",
                    "confidence": "HIGH",
                    "reasoning": raw_response,
                }
        else:
            res = raw_response

        # Check required fields
        if "verdict" not in res:
            raise ValueError("Invalid second opinion response format: missing 'verdict'")

        return {
            "verdict": res.get("verdict", "NOT_SUSPICIOUS"),
            "confidence": res.get("confidence", "LOW"),
            "reasoning": res.get("reasoning", "No details provided."),
        }

    except Exception as e:
        logger.warning("Failed to get LLM second opinion for %s: %s", account_id, e)
        return NULL_VERDICT
