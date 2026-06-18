"""
HDFC Bank statement parser.
HDFC digital PDFs: well-structured table with
Date | Narration | Value Dt | Debit Amount | Credit Amount | Closing Balance
CRITICAL: All monetary values = Decimal. Never float (RULE 1).
"""
import hashlib, logging, re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import Optional
import pdfplumber
from schemas.uts import UniversalTransaction, TransactionType

logger = logging.getLogger(__name__)
BANK_NAME = "HDFC Bank"
DATE_FORMATS = ["%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d %b %Y"]

def _parse_date(s: str) -> Optional[datetime]:
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            pass
    return None

def _parse_amount(s: str) -> Optional[Decimal]:
    """RULE 1: Returns Decimal, never float."""
    if not s or not s.strip():
        return None
    cleaned = re.sub(r"[₹,\s]", "", s.strip())
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None

async def parse_pdf(file_path: str) -> list[UniversalTransaction]:
    # Try camelot lattice first
    try:
        import camelot
        tables = camelot.read_pdf(file_path, pages="all", flavor="lattice")
        all_rows = []
        for table in tables:
            for _, row in table.df.iterrows():
                cells = [str(c).strip() for c in row]
                if not _is_header(cells):
                    all_rows.append(cells)
        txns = _parse_rows(all_rows, file_path)
        if txns:
            return txns
    except Exception as e:
        logger.debug("HDFC camelot failed: %s", e)

    # Fall back to pdfplumber stream mode
    txns = []
    try:
        with pdfplumber.open(file_path) as pdf:
            account_id, account_holder = "", ""
            for page in pdf.pages:
                if not account_id:
                    header_text = page.extract_text() or ""
                    account_id, account_holder = _extract_account_info(header_text)
                table = page.extract_table()
                if not table:
                    continue
                for row in table:
                    cells = [str(c or "").strip() for c in row]
                    if not cells or _is_header(cells):
                        continue
                    txn = _parse_hdfc_row(cells, account_id, account_holder, file_path)
                    if txn:
                        txns.append(txn)
    except Exception as e:
        logger.debug("HDFC pdfplumber failed: %s", e)

    if not txns:
        from parsers.pdf_scanned import parse_scanned_pdf
        return await parse_scanned_pdf(file_path, BANK_NAME)
    return txns

def _is_header(cells: list) -> bool:
    text = " ".join(c.lower() for c in cells)
    return sum(1 for kw in ["date","narration","debit","credit","balance"] if kw in text) >= 3

def _extract_account_info(text: str) -> tuple:
    account_id, account_holder = "", ""
    m = re.search(r"Account\s*Number?\s*:?\s*([X\d]{8,20})", text, re.IGNORECASE)
    if m:
        account_id = m.group(1).strip()
    m = re.search(r"(?:Customer|Account\s*Holder)\s*(?:Name)?\s*:?\s*([A-Z ]+)", text, re.IGNORECASE)
    if m:
        account_holder = m.group(1).strip()
    return account_id, account_holder

def _parse_rows(rows: list, file_path: str) -> list[UniversalTransaction]:
    return [t for t in (_parse_hdfc_row(r, "", "", file_path) for r in rows) if t]

def _parse_hdfc_row(cells: list, account_id: str,
                    account_holder: str, file_path: str) -> Optional[UniversalTransaction]:
    # HDFC column order: Date | Narration | Value Dt | Debit | Credit | Balance
    try:
        if len(cells) < 5:
            return None
        date = _parse_date(cells[0])
        if not date:
            return None
        narration = cells[1]
        # Flexible column detection: look for non-empty amount in Debit or Credit cols
        if len(cells) >= 6:
            debit_str, credit_str, balance_str = cells[3], cells[4], cells[5]
        else:
            debit_str, credit_str, balance_str = cells[2], cells[3], cells[4]

        debit  = _parse_amount(debit_str)
        credit = _parse_amount(credit_str)
        balance= _parse_amount(balance_str)

        if debit and debit > 0:
            amount, txn_type = debit, TransactionType.DEBIT
        elif credit and credit > 0:
            amount, txn_type = credit, TransactionType.CREDIT
        else:
            return None

        file_hash = hashlib.sha256(open(file_path,"rb").read(8192)).hexdigest() if file_path else ""
        txn_hash = hashlib.sha256(
            f"{account_id}|{date.isoformat()}|{amount}|{narration}".encode()
        ).hexdigest()
        return UniversalTransaction(
            txn_hash=txn_hash, case_id="", statement_id="",
            source_file_hash=file_hash, account_id=account_id,
            account_holder=account_holder, bank_name=BANK_NAME,
            txn_date=date, amount=amount, txn_type=txn_type,
            balance_after=balance, narration=narration,
        )
    except Exception as e:
        logger.debug("HDFC row error: %s", e)
        return None

async def parse_excel(file_path: str) -> list[UniversalTransaction]:
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    rows = [[str(c or "").strip() for c in row] for row in ws.iter_rows(values_only=True)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    return _parse_rows(rows[start:], file_path)

async def parse_csv(file_path: str) -> list[UniversalTransaction]:
    import csv, chardet
    enc = chardet.detect(open(file_path,"rb").read())["encoding"] or "utf-8"
    with open(file_path, encoding=enc, errors="replace") as f:
        rows = [[c.strip() for c in r] for r in csv.reader(f)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    return _parse_rows(rows[start:], file_path)
