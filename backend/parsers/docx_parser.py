"""DOCX bank statement parser. Uses python-docx to extract tables."""
import hashlib, logging, re
from decimal import Decimal
from datetime import datetime
from typing import Optional
from docx import Document
from schemas.uts import UniversalTransaction, TransactionType

logger = logging.getLogger(__name__)

async def parse_docx(file_path: str, bank_key: str) -> list[UniversalTransaction]:
    doc = Document(file_path)
    file_hash = hashlib.sha256(open(file_path, "rb").read()).hexdigest()
    txns = []
    for table in doc.tables:
        for i, row in enumerate(table.rows):
            cells = [cell.text.strip() for cell in row.cells]
            if i == 0 or _is_header(cells):
                continue
            txn = _parse_row(cells, bank_key, file_hash)
            if txn:
                txns.append(txn)
    return txns

def _is_header(cells):
    text = " ".join(c.lower() for c in cells)
    return sum(1 for k in ["date","narration","debit","credit","balance"] if k in text) >= 2

def _parse_row(cells, bank_key, file_hash) -> Optional[UniversalTransaction]:
    try:
        if len(cells) < 4: return None
        date_str = cells[0]
        narration = cells[1]
        for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%d %b %Y"]:
            try:
                date = datetime.strptime(date_str, fmt)
                break
            except ValueError:
                continue
        else:
            return None
        amounts = [_parse_amount(c) for c in cells[2:]]
        amounts = [a for a in amounts if a is not None and a > 0]
        if len(amounts) < 2: return None
        balance = amounts[-1]
        amount  = amounts[-2] if len(amounts) >= 2 else amounts[0]
        txn_type = TransactionType.DEBIT
        txn_hash = hashlib.sha256(f"{date.isoformat()}|{amount}|{narration}".encode()).hexdigest()
        return UniversalTransaction(
            txn_hash=txn_hash, case_id="", statement_id="",
            source_file_hash=file_hash, account_id="", account_holder="",
            bank_name=bank_key, txn_date=date, amount=amount,
            txn_type=txn_type, balance_after=balance, narration=narration,
        )
    except Exception as e:
        logger.debug("DOCX row error: %s", e)
        return None

def _parse_amount(s: str) -> Optional[Decimal]:
    cleaned = re.sub(r"[₹,\s]", "", s or "")
    try: return Decimal(cleaned)
    except: return None
