"""Extract entities (persons, accounts, UPI IDs, PANs, phones) from transaction narrations."""
import re, logging
from schemas.uts import UniversalTransaction

logger = logging.getLogger(__name__)

"""Extract entities (persons, accounts, UPI IDs, PANs, phones, IFSC) from transaction narrations."""
import re, logging
from schemas.uts import UniversalTransaction

logger = logging.getLogger(__name__)

# Strict Pattern matchers
_UPI_RE     = re.compile(r'\b[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+\b', re.IGNORECASE)
_PAN_RE     = re.compile(r'\b[A-Z]{5}\d{4}[A-Z]\b')
_GSTIN_RE   = re.compile(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b')
_PHONE_RE   = re.compile(r'\b(?:\+91[\-\s]?)?[6-9]\d{9}\b')
_ACCOUNT_RE = re.compile(r'\b\d{9,18}\b')
_IFSC_RE    = re.compile(r'\b[A-Z]{4}0[A-Z0-9]{6}\b')

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
        "MAHB": "Bank of Maharashtra",
        "KVBL": "Karur Vysya Bank",
        "FDRL": "Federal Bank",
        "IOBA": "Indian Overseas Bank",
        "CBIN": "Central Bank of India",
        "PSIB": "Punjab & Sind Bank",
        "TMBL": "Tamilnad Mercantile Bank",
        "CSBK": "CSB Bank",
        "ESFB": "Equitas Small Finance Bank",
        "AUBL": "AU Small Finance Bank",
    }
    return mapping.get(prefix, f"{prefix} Bank")

def extract_entities_from_narration(narration: str) -> dict:
    """Returns dict of identified entity types from a single narration string with strict ordering."""
    result = {}
    if not narration:
        return result
        
    narration_clean = narration.strip()
    working_text = narration_clean
    
    # 1. Extract UPI IDs first and remove them from working text to avoid double-matching phone/account numbers inside UPI handles
    upis = _UPI_RE.findall(working_text)
    if upis:
        result["upi_ids"] = list(set(upis))
        for u in upis:
            working_text = working_text.replace(u, " ")
            
    # 2. Extract PAN & GSTIN
    pans = _PAN_RE.findall(working_text)
    if pans:
        result["pan_numbers"] = list(set(pans))
        for p in pans:
            working_text = working_text.replace(p, " ")
            
    gstins = _GSTIN_RE.findall(working_text)
    if gstins:
        result["gstin_numbers"] = list(set(gstins))
        for g in gstins:
            working_text = working_text.replace(g, " ")

    # 3. Extract IFSC Codes & Bank Names
    ifsc_matches = _IFSC_RE.findall(working_text)
    if ifsc_matches:
        ifsc_list = list(set(ifsc_matches))
        result["ifsc_codes"] = ifsc_list
        result["counterparty_bank"] = get_bank_name_from_ifsc(ifsc_list[0])
        for code in ifsc_matches:
            working_text = working_text.replace(code, " ")

    # 4. Extract Standalone Phone Numbers
    phones = _PHONE_RE.findall(working_text)
    if phones:
        result["phone_numbers"] = list(set(phones))
        for ph in phones:
            working_text = working_text.replace(ph, " ")

    # 5. Extract Account Numbers (standalone 9-18 digit strings)
    accs = re.findall(r'(?:acc[ \-:]*|account[ \-:]*)?\b\d{9,18}\b', working_text, re.IGNORECASE)
    if accs:
        # Filter out numbers already matched
        clean_accs = [a.strip() for a in accs if len(a.strip()) >= 9]
        if clean_accs:
            result["account_numbers"] = list(set(clean_accs))

    # 6. Parse multi-segment bank narrations (hyphen / slash separated patterns)
    # Examples:
    #   "UPI-DR-319648119483-Devaram Sai Haswanth Reddy-YESB-010561100000039-Pay to BharatPe"
    #   "IMPS/NA/XXXX3731/RRN:506016194602/AU SMALL FINANCE BANK LIMITED/AARFA ENTERPRISE/PAY"
    #   "BB/CHQ DEP/106171/02-04-2025/HARDIK/ AXIS BANK LTD"
    delimiter = "-" if ("-" in narration_clean and "/" not in narration_clean) else "/"
    parts = [p.strip() for p in narration_clean.split(delimiter) if p.strip()]
    
    if len(parts) >= 2:
        method_keywords = {
            "neft", "imps", "rtgs", "upi", "chq", "cheque", "atm", 
            "cash", "card", "pos", "transfer", "ft", "bb", "dep", 
            "wd", "withdrawal", "nfs", "opm", "b/f", "c/f", "dr", "cr", "csw", "by", "to", "pay", "rec"
        }
        
        name_candidates = []
        bank_candidates = []
        
        for part in parts:
            part_upper = part.upper()
            part_lower = part.lower()

            if _IFSC_RE.match(part_upper):
                result["ifsc_codes"] = [part_upper]
                result["counterparty_bank"] = get_bank_name_from_ifsc(part_upper)
                continue

            if _UPI_RE.match(part):
                result["upi_ids"] = [part]
                continue

            if _PHONE_RE.match(part_upper):
                result["phone_numbers"] = [part]
                continue

            if re.search(r'\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b', part):
                continue

            words = set(part_lower.replace('-', ' ').split())
            if words.intersection(method_keywords) and len(words) <= 2:
                continue

            if part_lower in ("self", "cash", "deposit", "withdrawal", "payment from phonepe", "pay to bharatpe merchant"):
                continue

            # Identify Bank Names vs Person/Business Names
            if any(kw in part_lower for kw in ("bank", "ltd", "limited", "coop", "nidhi", "corp", "infra", "enterprise")):
                if "bank" in part_lower or "ltd" in part_lower:
                    bank_candidates.append(part)
                else:
                    name_candidates.append(part)
            elif len(part) >= 3 and any(c.isalpha() for c in part) and not part.isdigit():
                name_candidates.append(part)

        if name_candidates and "counterparty_name" not in result:
            result["counterparty_name"] = name_candidates[0]
            
        if bank_candidates and "counterparty_bank" not in result:
            result["counterparty_bank"] = bank_candidates[0]

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
