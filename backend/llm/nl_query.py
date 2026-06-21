import json, re, logging
from .client import generate
from .prompts import NL_QUERY_TO_SPEC_PROMPT
from .sanitizer import sanitize_for_prompt

logger = logging.getLogger(__name__)
ALLOWED_TYPES = {"account_summary","transaction_filter","money_trail",
                 "counterparty_network","timeline_range"}
DEFAULT_SPEC  = {"query_type":"transaction_filter",
                 "filters":{"account_ids":[],"date_from":None,"date_to":None,
                             "amount_min":None,"amount_max":None,"txn_type":None,"flags":[]},"limit":100}

async def nl_to_query_spec(question: str, accounts_context: list = None, case_classification: int = 1) -> dict:
    safe_q = sanitize_for_prompt(question, max_length=500)
    ctx_str = json.dumps(accounts_context or [], indent=2)
    prompt = (NL_QUERY_TO_SPEC_PROMPT
              .replace("{CONTEXT}", ctx_str)
              .replace("{QUESTION}", safe_q))
    try:
        raw  = await generate({"_q": safe_q, "accounts": accounts_context or []}, prompt, case_classification, "nl_query")
        spec = _parse_spec(raw)
        if spec.get("query_type") not in ALLOWED_TYPES:
            return DEFAULT_SPEC
        return spec
    except Exception as e:
        logger.warning("NL query parse failed: %s", e)
        return DEFAULT_SPEC

def _parse_spec(raw: str) -> dict:
    clean = raw.strip()
    m = re.search(r'\{.*\}', clean, re.DOTALL)
    if m: return json.loads(m.group(0))
    return json.loads(clean)
