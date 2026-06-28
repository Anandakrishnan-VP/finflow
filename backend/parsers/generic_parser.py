"""
Generic and highly robust bank statement parser.
Handles any bank format from tables (PDF, Excel, CSV, Docx, or OCR cells).
Ensures all monetary values are parsed as Decimal (RULE 1).
"""
import hashlib
import logging
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional
from schemas.uts import UniversalTransaction, TransactionType

logger = logging.getLogger(__name__)

# Compile regexes once
DATE_RE = re.compile(r'(\d{1,2})[/\-\.\s](?:\d{1,2}|[A-Za-z]{3,9})[/\-\.\s](\d{2,4})')

DATE_FORMATS = [
    "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y", "%d.%m.%y",
    "%d %b %Y", "%d-%b-%Y", "%d %B %Y", "%d-%B-%Y",
    "%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%m/%d/%y",
    "%d %b", "%d-%b", "%d.%b", "%d %B", "%d-%B", "%d.%B",
    "%b %d", "%b-%d", "%B %d", "%B-%d"
]

HEADER_PATTERNS = {
    "date": [
        r"date", r"txn\s*date", r"tran\s*date", r"post\s*date", r"value\s*date", r"\bdt\b", r"booking\s*date"
    ],
    "narration": [
        r"narration", r"particulars", r"description", r"remarks", r"details", r"transaction\s*details", 
        r"payment\s*details", r"\bremarks\b", r"\binfo\b", r"narrative"
    ],
    "debit": [
        r"\bdebit\b", r"\bwithdrawal\b", r"\bpayment\b", r"\bdr\b", r"\bwithdraw\b", r"\bout\b", r"\bpaid\b",
        r"amount\s*debit", r"withdrawal\s*amt", r"debited", r"withdrawals"
    ],
    "credit": [
        r"\bcredit\b", r"\bdeposit\b", r"\breceipt\b", r"\bcr\b", r"\bin\b", r"\breceived\b",
        r"amount\s*credit", r"deposit\s*amt", r"credited", r"deposits"
    ],
    "amount": [
        r"\bamount\b", r"\bvalue\b", r"txn\s*amount", r"amount\s*\(rs\)", r"amount\s*\(inr\)", r"\bamt\b"
    ],
    "balance": [
        r"\bbalance\b", r"\bbal\b", r"running\s*balance", r"balance\s*\(rs\)", r"balance\s*\(inr\)", r"outstanding"
    ],
    "ref": [
        r"ref", r"chq", r"cheque", r"instrument", r"trn", r"id", r"reference", r"utr", r"txn\s*ref"
    ]
}

def clean_amount_str(s: str) -> str:
    """Normalize and clean currency strings, supporting Indian and European numbering formats."""
    # Remove currency symbols (₹, $, Rs, Rs., INR, etc.) and spaces
    s = re.sub(r'(?i)rs\.?|inr|₹|\$', '', s)
    s = s.replace(" ", "")
    
    commas = s.count(',')
    dots = s.count('.')
    
    if commas > 0 and dots == 0:
        # Check if single comma is a decimal separator (e.g. 12345,67)
        parts = s.split(',')
        if len(parts) == 2 and len(parts[1]) == 2:
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '')
    elif dots > 0 and commas == 0:
        # Check if multiple dots (e.g. 1.234.567)
        if dots > 1:
            last_dot_idx = s.rfind('.')
            first_part = s[:last_dot_idx].replace('.', '')
            last_part = s[last_dot_idx+1:]
            s = first_part + '.' + last_part
    elif commas > 0 and dots > 0:
        # Both commas and dots exist. Last punctuation determines decimal part.
        last_comma = s.rfind(',')
        last_dot = s.rfind('.')
        if last_comma > last_dot:
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
            
    # Clean any other remaining characters except digits, minus, and dot
    s = re.sub(r"[^\d\-\.]", "", s)
    return s

def parse_decimal(s: str) -> Optional[Decimal]:
    """Parse string to Decimal securely. RULE 1: Never float."""
    if not s or not s.strip():
        return None
    raw = s.strip()
    is_negative = False
    if raw.startswith("(") and raw.endswith(")"):
        is_negative = True
        raw = raw[1:-1]
    cleaned = clean_amount_str(raw)
    cleaned = re.sub(r"(?i)[cd]r", "", cleaned)
    if not cleaned:
        return None
    try:
        val = Decimal(cleaned)
        if is_negative:
            val = -val
        return val
    except (InvalidOperation, ValueError):
        return None

def parse_date(s: str) -> Optional[datetime]:
    s = s.strip()
    s = re.sub(r'\s*([/\-\.])\s*', r'\1', s)
    s = re.sub(r'\s+', ' ', s)

    for fmt in DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            if "%y" not in fmt and "%Y" not in fmt and dt.year == 1900:
                dt = dt.replace(year=datetime.now().year)
            if dt.year >= 1980 and dt.year <= datetime.now().year + 1:
                return dt
        except ValueError:
            pass
            
    # 1. Try to find a 3-part date first
    m = re.search(r'(\d{1,2}\s*[/\-\.\s]\s*(?:\d{1,2}|[A-Za-z]{3,9})\s*[/\-\.\s]\s*\d{2,4})', s)
    if m:
        date_part = m.group(1)
        date_part = re.sub(r'\s*([/\-\.])\s*', r'\1', date_part)
        date_part = re.sub(r'\s+', ' ', date_part)
        for fmt in DATE_FORMATS:
            try:
                dt = datetime.strptime(date_part, fmt)
                if "%y" not in fmt and "%Y" not in fmt and dt.year == 1900:
                    dt = dt.replace(year=datetime.now().year)
                if dt.year >= 1980 and dt.year <= datetime.now().year + 1:
                    return dt
            except ValueError:
                pass
                
    # 2. Try to find a 2-part date (Day + Month)
    m2 = re.search(r'(\d{1,2}\s*[/\-\.\s]\s*(?:[A-Za-z]{3,9}|\d{1,2}))', s)
    if m2:
        date_part = m2.group(1)
        date_part = re.sub(r'\s*([/\-\.])\s*', r'\1', date_part)
        date_part = re.sub(r'\s+', ' ', date_part)
        for fmt in DATE_FORMATS:
            try:
                dt = datetime.strptime(date_part, fmt)
                if "%y" not in fmt and "%Y" not in fmt and dt.year == 1900:
                    dt = dt.replace(year=datetime.now().year)
                if dt.year >= 1980 and dt.year <= datetime.now().year + 1:
                    return dt
            except ValueError:
                pass
    return None

def parse_generic_table(
    rows: list[list[str]],
    bank_name: str,
    file_hash: str,
    column_mapping: Optional[dict] = None
) -> list[UniversalTransaction]:
    """
    Parses a list of rows (cells) into UniversalTransactions using dynamic heuristics or manual overrides.
    Supports multi-line narration merging and mathematical debit/credit correction.
    """
    if not rows:
        return []

    cleaned_rows = []
    for r in rows:
        cleaned_rows.append([str(c or "").strip() for c in r])

    if column_mapping:
        logger.info(f"Generic parser: using manual column mapping: {column_mapping}")
        def get_index(k):
            val = column_mapping.get(k)
            if val is None or val == "" or val == "None":
                return None
            try:
                return int(val)
            except (ValueError, TypeError):
                return None

        date_idx = get_index("date")
        narration_idx = get_index("narration")
        debit_idx = get_index("debit")
        credit_idx = get_index("credit")
        amount_idx = get_index("amount")
        balance_idx = get_index("balance")
        start_row_idx = 0
        # If the first row matches headers or is exactly identical to mapping labels, skip it
        if len(cleaned_rows) > 0:
            first_row_lower = [c.lower() for c in cleaned_rows[0]]
            if any(k in first_row_lower for k in ["date", "narration", "debit", "credit", "amount", "balance"]):
                start_row_idx = 1
    else:
        # 1. Identify header row with regex fuzzy mapping
        header_idx = -1
        best_score = 0
        header_mapping = {}

        for idx, r in enumerate(cleaned_rows[:50]):
            score = 0
            mapping = {}
            for c_idx, cell in enumerate(r):
                cell_lower = cell.lower().strip()
                if not cell_lower:
                    continue
                for key, patterns in HEADER_PATTERNS.items():
                    for pattern in patterns:
                        if re.search(pattern, cell_lower):
                            if key not in mapping:
                                mapping[key] = c_idx
                                score += 1
                                break
            if score > best_score and score >= 2:
                best_score = score
                header_idx = idx
                header_mapping = mapping

        logger.info(f"Generic parser: detected header at row {header_idx} with score {best_score}. Mapping: {header_mapping}")

        # If no header was detected, we infer columns from cell value profiles
        if header_idx == -1:
            header_mapping = infer_column_roles(cleaned_rows)
            logger.info(f"Generic parser: no header row found. Inferred mapping: {header_mapping}")
            start_row_idx = 0
        else:
            start_row_idx = header_idx + 1

        date_idx = header_mapping.get("date")
        narration_idx = header_mapping.get("narration")
        debit_idx = header_mapping.get("debit")
        credit_idx = header_mapping.get("credit")
        amount_idx = header_mapping.get("amount")
        balance_idx = header_mapping.get("balance")

    if date_idx is None or (debit_idx is None and credit_idx is None and amount_idx is None):
        logger.warning("Generic parser: missing critical columns (date or amount/debit/credit). Cannot parse.")
        return []

    if narration_idx is None:
        numeric_idxs = {date_idx, debit_idx, credit_idx, amount_idx, balance_idx}
        for c_idx in range(len(cleaned_rows[0])):
            if c_idx not in numeric_idxs:
                narration_idx = c_idx
                break
        if narration_idx is None:
            narration_idx = 0

    txns = []
    last_txn = None

    for idx, r in enumerate(cleaned_rows[start_row_idx:]):
        max_idx = max(filter(lambda x: x is not None, [date_idx, narration_idx, debit_idx, credit_idx, amount_idx, balance_idx]))
        if len(r) <= max_idx:
            continue

        date_str = r[date_idx].strip()
        date = parse_date(date_str)

        # Multi-line narration merging:
        # If date is empty but we have narration, append it to the last valid transaction
        if not date:
            narration_str = r[narration_idx].strip()
            if narration_str and last_txn and not date_str:
                # Make sure other columns aren't containing conflicting data
                last_txn.narration = (last_txn.narration + " " + narration_str).strip()
                last_txn.txn_hash = hashlib.sha256(
                    f"{last_txn.bank_name}|{last_txn.txn_date.isoformat()}|{last_txn.amount}|{last_txn.narration}".encode()
                ).hexdigest()
            continue

        narration = r[narration_idx]
        amount = None
        txn_type = TransactionType.DEBIT

        if debit_idx is not None and credit_idx is not None:
            deb_val = parse_decimal(r[debit_idx])
            cred_val = parse_decimal(r[credit_idx])
            if deb_val is not None and deb_val > 0:
                amount = deb_val
                txn_type = TransactionType.DEBIT
            elif cred_val is not None and cred_val > 0:
                amount = cred_val
                txn_type = TransactionType.CREDIT

        if amount is None and amount_idx is not None:
            amt_val = parse_decimal(r[amount_idx])
            if amt_val is not None:
                amt_str = r[amount_idx].lower()
                if "-" in amt_str or "dr" in amt_str:
                    amount = abs(amt_val)
                    txn_type = TransactionType.DEBIT
                elif "cr" in amt_str:
                    amount = amt_val
                    txn_type = TransactionType.CREDIT
                else:
                    flag = None
                    for cell in r:
                        cl = cell.lower().strip()
                        if cl in ("dr", "cr", "d", "c", "debit", "credit"):
                            flag = cl
                            break
                    if flag in ("dr", "d", "debit"):
                        amount = amt_val
                        txn_type = TransactionType.DEBIT
                    elif flag in ("cr", "c", "credit"):
                        amount = amt_val
                        txn_type = TransactionType.CREDIT
                    else:
                        amount = amt_val
                        txn_type = TransactionType.DEBIT

        if amount is None:
            continue

        balance = None
        if balance_idx is not None:
            balance = parse_decimal(r[balance_idx])

        txn_hash = hashlib.sha256(
            f"{bank_name}|{date.isoformat()}|{amount}|{narration}".encode()
        ).hexdigest()

        txn = UniversalTransaction(
            txn_hash=txn_hash,
            case_id="",
            statement_id="",
            source_file_hash=file_hash,
            account_id="",
            account_holder="",
            bank_name=bank_name,
            txn_date=date,
            amount=amount,
            txn_type=txn_type,
            balance_after=balance,
            narration=narration
        )
        txns.append(txn)
        last_txn = txn

    # Balance validation fallback: if running balances exist, correct transaction types
    if len(txns) >= 2:
        for i in range(1, len(txns)):
            prev = txns[i-1]
            curr = txns[i]
            if prev.balance_after is not None and curr.balance_after is not None:
                diff = curr.balance_after - prev.balance_after
                if diff > 0:
                    curr.txn_type = TransactionType.CREDIT
                elif diff < 0:
                    curr.txn_type = TransactionType.DEBIT

    # Year alignment: if some transactions parsed with current year/2026 due to lack of year in OCR
    # but the rest of the statement is in a different year, align them.
    years = [t.txn_date.year for t in txns if t.txn_date and t.txn_date.year not in (datetime.now().year, 2026)]
    if years:
        from collections import Counter
        most_common_year = Counter(years).most_common(1)[0][0]
        for t in txns:
            if t.txn_date and t.txn_date.year in (datetime.now().year, 2026):
                try:
                    t.txn_date = t.txn_date.replace(year=most_common_year)
                except ValueError:
                    pass

    return txns

def infer_column_roles(rows: list[list[str]]) -> dict:
    """
    Guesses column mapping by analyzing cell types in the first 100 rows.
    Uses balance deltas to mathematically differentiate Debit vs Credit columns.
    """
    if not rows:
        return {}

    from collections import Counter
    lengths = [len(r) for r in rows if len(r) >= 2]
    if not lengths:
        return {}
    most_common_len = Counter(lengths).most_common(1)[0][0]

    filtered_rows = [r for r in rows if len(r) == most_common_len]
    if not filtered_rows:
        return {}

    num_cols = most_common_len
    date_scores = [0] * num_cols
    numeric_scores = [0] * num_cols
    total_len = [0] * num_cols
    valid_rows = 0

    for r in filtered_rows[:100]:
        valid_rows += 1
        for idx, cell in enumerate(r):
            if parse_date(cell):
                date_scores[idx] += 1
            if parse_decimal(cell) is not None:
                numeric_scores[idx] += 1
            total_len[idx] += len(cell)

    if valid_rows == 0:
        return {}

    mapping = {}

    # 1. Identify Date Column
    best_date_idx = -1
    best_date_score = 0
    for idx, s in enumerate(date_scores):
        if s > best_date_score:
            best_date_score = s
            best_date_idx = idx
    if best_date_idx != -1 and best_date_score > valid_rows * 0.3:
        mapping["date"] = best_date_idx

    # 2. Identify Numeric Columns
    numeric_idxs = []
    for idx, s in enumerate(numeric_scores):
        if idx == best_date_idx:
            continue
        if s >= 1:
            numeric_idxs.append(idx)

    # Differentiate Debit, Credit, Balance using mathematical deltas
    if len(numeric_idxs) >= 3:
        c1, c2, c3 = numeric_idxs[0], numeric_idxs[1], numeric_idxs[-1]
        c1_credit_matches = 0
        c2_credit_matches = 0
        prev_bal = None
        for r in rows[:100]:
            if len(r) <= max(c1, c2, c3):
                continue
            b = parse_decimal(r[c3])
            v1 = parse_decimal(r[c1])
            v2 = parse_decimal(r[c2])
            if prev_bal is not None and b is not None:
                diff = b - prev_bal
                if diff > 0:  # Balance increased
                    if v1 is not None and abs(v1 - diff) < 0.01:
                        c1_credit_matches += 1
                    if v2 is not None and abs(v2 - diff) < 0.01:
                        c2_credit_matches += 1
                elif diff < 0:  # Balance decreased
                    if v1 is not None and abs(v1 - abs(diff)) < 0.01:
                        c2_credit_matches += 1
                    if v2 is not None and abs(v2 - abs(diff)) < 0.01:
                        c1_credit_matches += 1
            if b is not None:
                prev_bal = b
        
        if c1_credit_matches > c2_credit_matches:
            mapping["credit"] = c1
            mapping["debit"] = c2
        else:
            mapping["debit"] = c1
            mapping["credit"] = c2
        mapping["balance"] = c3
    elif len(numeric_idxs) == 2:
        mapping["amount"] = numeric_idxs[0]
        mapping["balance"] = numeric_idxs[1]
    elif len(numeric_idxs) == 1:
        if numeric_idxs[0] == num_cols - 1:
            mapping["balance"] = numeric_idxs[0]
        else:
            mapping["amount"] = numeric_idxs[0]

    # 3. Identify Narration Column
    longest_text_idx = -1
    longest_len = 0
    for idx in range(num_cols):
        if idx == best_date_idx or idx in numeric_idxs:
            continue
        avg_len = total_len[idx] / valid_rows
        if avg_len > longest_len:
            longest_len = avg_len
            longest_text_idx = idx
    if longest_text_idx != -1:
        mapping["narration"] = longest_text_idx

    return mapping

