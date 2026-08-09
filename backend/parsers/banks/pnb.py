"""
Punjab National Bank (PNB) statement parser.
Supports PDF, Excel (.xlsx/.xls), and CSV formats.
"""
import hashlib, logging, re
from decimal import Decimal
from datetime import datetime
from typing import Optional
import pdfplumber
from schemas.uts import UniversalTransaction, TransactionType
from parsers.shared.amount_parser import parse_amount, resolve_txn_type
from parsers.shared.date_parser import parse_date, is_skip_row

logger = logging.getLogger(__name__)
BANK_NAME = "Punjab National Bank"

def _is_header_row(cells: list[str]) -> bool:
    text = " ".join(c.lower() for c in cells)
    return sum(1 for kw in ["date", "particulars", "narration", "debit", "credit", "balance", "withdrawal", "deposit"] if kw in text) >= 3

def _make_hash(account_id: str, date: datetime, amount: Decimal, narration: str) -> str:
    return hashlib.sha256(f"{account_id}|{date.isoformat()}|{amount}|{narration}".encode()).hexdigest()

def _extract_account_info(text: str) -> tuple[str, str]:
    account_id, account_holder = "", ""
    m = re.search(r"(?:Account|A/C)\s*(?:No|Number)?\s*:?\s*(\d{9,20})", text, re.IGNORECASE)
    if m:
        account_id = m.group(1).strip()
    m = re.search(r"(?:Name|Account\s*Holder)\s*:?\s*([A-Z\s]+)", text, re.IGNORECASE)
    if m:
        account_holder = m.group(1).strip()
    return account_id, account_holder

def _parse_row(cells: list[str], account_id: str, account_holder: str, file_path: str) -> Optional[UniversalTransaction]:
    try:
        if len(cells) < 4:
            return None
        date = parse_date(cells[0])
        if not date:
            return None
        narration = cells[1] if len(cells) >= 4 else ""
        if is_skip_row(cells[0], narration):
            return None

        if len(cells) >= 5:
            debit_str = cells[2]
            credit_str = cells[3]
            balance_str = cells[4]
        elif len(cells) == 4:
            debit_str = cells[2]
            credit_str = ""
            balance_str = cells[3]
        else:
            return None

        debit = parse_amount(debit_str)
        credit = parse_amount(credit_str)
        balance = parse_amount(balance_str)

        amount, txn_type_str = resolve_txn_type(debit, credit)
        if amount is None:
            return None
        txn_type = TransactionType.DEBIT if txn_type_str == 'DR' else TransactionType.CREDIT
        txn_hash = _make_hash(account_id, date, amount, narration)

        return UniversalTransaction(
            txn_hash=txn_hash,
            case_id="",
            statement_id="",
            source_file_hash=hashlib.sha256(open(file_path, "rb").read()).hexdigest() if file_path else "",
            account_id=account_id,
            account_holder=account_holder,
            bank_name=BANK_NAME,
            txn_date=date,
            amount=amount,
            txn_type=txn_type,
            balance_after=balance,
            narration=narration.strip(),
        )
    except Exception as e:
        logger.debug("PNB row parse error: %s", e)
        return None

async def parse_pdf(file_path: str) -> list[UniversalTransaction]:
    txns = []
    account_id, account_holder = "", ""
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                if not account_id:
                    account_id, account_holder = _extract_account_info(text)
                table = page.extract_table()
                if not table:
                    continue
                for row in table:
                    cells = [str(c or "").strip() for c in row]
                    if not cells or _is_header_row(cells):
                        continue
                    t = _parse_row(cells, account_id, account_holder, file_path)
                    if t:
                        txns.append(t)
    except Exception as e:
        logger.debug("PNB PDF parse error: %s", e)
    if not txns:
        from parsers.pdf_scanned import parse_scanned_pdf
        return await parse_scanned_pdf(file_path, BANK_NAME)
    return txns

async def parse_excel(file_path: str) -> list[UniversalTransaction]:
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    txns = []
    account_id, account_holder = "", ""
    start = 0
    for i, row in enumerate(rows):
        cells = [str(c or "").strip() for c in row]
        if not account_id:
            account_id, account_holder = _extract_account_info(" ".join(cells))
        if _is_header_row(cells):
            start = i + 1
            break
    for row in rows[start:]:
        cells = [str(c or "").strip() for c in row]
        t = _parse_row(cells, account_id, account_holder, file_path)
        if t:
            txns.append(t)
    return txns

async def parse_csv(file_path: str) -> list[UniversalTransaction]:
    import csv, chardet
    raw = open(file_path, "rb").read()
    enc = chardet.detect(raw)["encoding"] or "utf-8"
    with open(file_path, "r", encoding=enc, errors="replace") as f:
        reader = csv.reader(f)
        rows = list(reader)
    if not rows:
        return []
    txns = []
    account_id, account_holder = "", ""
    start = 0
    for i, row in enumerate(rows):
        cells = [str(c or "").strip() for c in row]
        if not account_id:
            account_id, account_holder = _extract_account_info(" ".join(cells))
        if _is_header_row(cells):
            start = i + 1
            break
    for row in rows[start:]:
        cells = [str(c or "").strip() for c in row]
        t = _parse_row(cells, account_id, account_holder, file_path)
        if t:
            txns.append(t)
    return txns

