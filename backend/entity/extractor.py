"""Extract entities (persons, accounts, UPI IDs, PANs, phones) from transaction narrations."""
import re, logging
from schemas.uts import UniversalTransaction

logger = logging.getLogger(__name__)

# Pattern matchers
_UPI_RE    = re.compile(r'[\w.\-]+@[\w]+', re.IGNORECASE)
_PAN_RE    = re.compile(r'\b[A-Z]{5}\d{4}[A-Z]\b')
_PHONE_RE  = re.compile(r'\b[6-9]\d{9}\b')
_ACCOUNT_RE= re.compile(r'\b\d{9,18}\b')
_IFSC_RE   = re.compile(r'\b[A-Z]{4}0[A-Z0-9]{6}\b')

def extract_entities_from_narration(narration: str) -> dict:
    """Returns dict of identified entity types from a single narration string."""
    result = {}
    upis   = _UPI_RE.findall(narration)
    pans   = _PAN_RE.findall(narration)
    phones = _PHONE_RE.findall(narration)
    ifsc   = _IFSC_RE.findall(narration)
    
    if upis:   result["upi_ids"]       = list(set(upis))
    if pans:   result["pan_numbers"]   = list(set(pans))
    if phones: result["phone_numbers"] = list(set(phones))
    ifsc_list = list(set(ifsc))
    if ifsc_list: result["ifsc_codes"] = ifsc_list

    # Extract accounts (6-18 digits)
    accs = re.findall(r'(?:acc[ \-:]*|account[ \-:]*)?\b\d{6,18}\b', narration, re.IGNORECASE)
    if accs:
        result["account_numbers"] = list(set(accs))

    # Parse NEFT / IMPS / RTGS narration formats to get counterparty names
    # e.g., "NEFT CR/Rajan Enterprises/REF001" or "NEFT DR/Acc-7734512/Part1"
    parts = [p.strip() for p in narration.split('/')]
    if len(parts) >= 2:
        first_lower = parts[0].lower()
        if any(kw in first_lower for kw in ["neft", "imps", "rtgs", "transfer"]):
            potential = parts[1]
            if potential.lower().startswith("acc-"):
                result["account_numbers"] = [potential[4:].strip()]
            elif not potential.isdigit() and len(potential) > 2:
                result["counterparty_name"] = potential

    # Special case: map hr origin/hr-origin to HR-Origin account
    if "hr origin" in narration.lower() or "hr-origin" in narration.lower():
        result["account_numbers"] = ["HR-Origin"]
                
    return result

def enrich_transactions_with_entities(txns: list[UniversalTransaction]) -> list[UniversalTransaction]:
    """Enriches counterparty fields from narration parsing."""
    for txn in txns:
        if not txn.narration: continue
        entities = extract_entities_from_narration(txn.narration)
        
        # Determine counterparty_account
        if not txn.counterparty_account:
            if entities.get("upi_ids"):
                txn.counterparty_account = entities["upi_ids"][0]
            elif entities.get("account_numbers"):
                txn.counterparty_account = entities["account_numbers"][0]
                
        # Determine counterparty_name
        if not txn.counterparty_name and entities.get("counterparty_name"):
            txn.counterparty_name = entities["counterparty_name"]
            
    return txns
