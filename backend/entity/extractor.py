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

def get_bank_name_from_ifsc(ifsc: str) -> str:
    """Resolve bank name from Indian bank IFSC code prefix."""
    ifsc = ifsc.upper()
    prefix = ifsc[:4]
    mapping = {
        "UTIB": "Axis Bank",
        "HDFC": "HDFC Bank",
        "ICIC": "ICICI Bank",
        "BARB": "Bank of Baroda",
        "SBIN": "State Bank of India",
        "PUNB": "Punjab National Bank",
        "IDFB": "IDFC First Bank",
        "INDB": "IndusInd Bank",
        "KKBK": "Kotak Mahindra Bank",
        "YESB": "YES Bank",
        "IBKL": "IDBI Bank",
        "SCBL": "Standard Chartered",
        "HSBC": "HSBC Bank",
        "UBIN": "Union Bank of India",
        "CNRB": "Canara Bank",
        "BDBL": "Bandhan Bank",
    }
    return mapping.get(prefix, f"{prefix} Bank")

def extract_entities_from_narration(narration: str) -> dict:
    """Returns dict of identified entity types from a single narration string."""
    result = {}
    if not narration:
        return result
        
    narration_clean = narration.strip()
    
    # 1. Run basic regex extractions on the whole string first
    upis   = _UPI_RE.findall(narration_clean)
    pans   = _PAN_RE.findall(narration_clean)
    phones = _PHONE_RE.findall(narration_clean)
    ifsc   = _IFSC_RE.findall(narration_clean)
    
    if upis:   result["upi_ids"]       = list(set(upis))
    if pans:   result["pan_numbers"]   = list(set(pans))
    if phones: result["phone_numbers"] = list(set(phones))
    ifsc_list = list(set(ifsc))
    if ifsc_list: 
        result["ifsc_codes"] = ifsc_list
        result["counterparty_bank"] = get_bank_name_from_ifsc(ifsc_list[0])

    # 2. Extract account numbers (6-18 digits)
    accs = re.findall(r'(?:acc[ \-:]*|account[ \-:]*)?\b\d{6,18}\b', narration_clean, re.IGNORECASE)
    if accs:
        result["account_numbers"] = list(set(accs))

    # 3. Check for slash-separated narration details (common in Indian banks like HDFC, Axis, SBI)
    parts = [p.strip() for p in narration_clean.split('/') if p.strip()]
    if len(parts) >= 2:
        method_keywords = {
            "neft", "imps", "rtgs", "upi", "chq", "cheque", "atm", 
            "cash", "card", "pos", "transfer", "ft", "bb", "dep", 
            "wd", "withdrawal", "nfs", "opm", "b/f", "c/f"
        }
        
        ref_candidates = []
        name_candidates = []
        
        for part in parts:
            part_upper = part.upper()
            part_lower = part.lower()

            if _IFSC_RE.match(part_upper):
                result["ifsc_codes"] = [part_upper]
                result["counterparty_bank"] = get_bank_name_from_ifsc(part_upper)
                continue

            if _UPI_RE.match(part_upper):
                result["upi_ids"] = [part]
                continue

            if _PHONE_RE.match(part_upper):
                result["phone_numbers"] = [part]
                continue

            if _PAN_RE.match(part_upper):
                result["pan_numbers"] = [part_upper]
                continue

            if re.search(r'\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b', part):
                continue

            if part.isdigit() and len(part) >= 6:
                ref_candidates.append(part)
                continue
            
            if len(part) >= 9 and any(c.isdigit() for c in part) and any(c.isalpha() for c in part):
                ref_candidates.append(part_upper)
                continue

            words = set(part_lower.replace('-', ' ').split())
            if words.intersection(method_keywords):
                continue

            if part_lower in ("self", "cash", "deposit", "withdrawal"):
                continue

            if len(part) >= 3 and any(c.isalpha() for c in part):
                name_candidates.append(part)

        # Map candidates back to structured results
        if ref_candidates:
            # First candidate is the main account/reference number
            result["account_numbers"] = ref_candidates
        
        if name_candidates:
            # If one of the names mentions "bank" or "ltd", it's the bank name
            bank_names = [n for n in name_candidates if any(kw in n.lower() for kw in ("bank", "ltd", "coop", "nidhi", "corp"))]
            person_names = [n for n in name_candidates if n not in bank_names]
            
            if person_names:
                result["counterparty_name"] = person_names[0]
            elif bank_names:
                result["counterparty_name"] = bank_names[0]
                
            if bank_names:
                result["counterparty_bank"] = bank_names[0]
            elif len(name_candidates) > 1 and "counterparty_name" in result and name_candidates[1] != result["counterparty_name"]:
                result["counterparty_bank"] = name_candidates[1]

    # Special case: map hr origin/hr-origin to HR-Origin account
    if "hr origin" in narration_clean.lower() or "hr-origin" in narration_clean.lower():
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
            
        # Determine counterparty_bank
        if not txn.counterparty_bank and entities.get("counterparty_bank"):
            txn.counterparty_bank = entities["counterparty_bank"]
            
    return txns
