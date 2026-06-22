"""
SBI Bank statement parser.
SBI digital PDFs: well-structured table with
Txn Date | Value Date | Description | Ref No. | Debit | Credit | Balance
Or 5-column format: Txn Date | Description | Debit | Credit | Balance
CRITICAL: All monetary values = Decimal. Never float (RULE 1).
"""
import hashlib, logging, re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import Optional
import pdfplumber
from schemas.uts import UniversalTransaction, TransactionType

logger = logging.getLogger(__name__)
BANK_NAME = "State Bank of India"
DATE_FORMATS = ["%d %b %Y", "%d/%m/%Y", "%d-%m-%Y", "%d-%b-%Y", "%d/%m/%y"]

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

def _is_header_row(cells: list[str]) -> bool:
    text = " ".join(c.lower() for c in cells)
    return sum(1 for kw in ["date", "description", "debit", "credit", "balance"] if kw in text) >= 3

def _make_hash(account_id: str, date: datetime, amount: Decimal, narration: str) -> str:
    return hashlib.sha256(
        f"{account_id}|{date.isoformat()}|{amount}|{narration}".encode()
    ).hexdigest()

def _get_file_hash(file_path: str) -> str:
    if not file_path:
        return ""
    try:
        with open(file_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except Exception:
        return ""

async def parse_pdf(file_path: str) -> list[UniversalTransaction]:
    file_hash = _get_file_hash(file_path)
    # Pre-extract account info from the first page text
    account_id, account_holder = "", ""
    try:
        with pdfplumber.open(file_path) as pdf:
            if pdf.pages:
                header_text = pdf.pages[0].extract_text() or ""
                account_id, account_holder = _extract_account_info(header_text)
    except Exception as e:
        logger.debug("SBI pre-extract account info failed: %s", e)

    # Try camelot lattice first
    try:
        import camelot
        tables = camelot.read_pdf(file_path, pages="all", flavor="lattice")
        all_rows = []
        for table in tables:
            for _, row in table.df.iterrows():
                cells = [str(c).strip() for c in row]
                if not _is_header_row([c.lower() for c in cells]):
                    all_rows.append(cells)
        txns = _normalize_sbi_rows(all_rows, file_hash, account_id, account_holder)
        if txns:
            return txns
    except Exception as e:
        logger.debug("SBI camelot failed: %s", e)

    # Fall back to pdfplumber stream mode
    txns = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                if not account_id:
                    header_text = page.extract_text() or ""
                    account_id, account_holder = _extract_account_info(header_text)
                table = page.extract_table()
                if not table:
                    continue
                for row in table:
                    cells = [str(c or "").strip() for c in row]
                    if not cells or _is_header_row([c.lower() for c in cells]):
                        continue
                    txn = _parse_sbi_row(cells, account_id, account_holder, file_hash)
                    if txn:
                        txns.append(txn)
    except Exception as e:
        logger.debug("SBI pdfplumber failed: %s", e)

    if not txns:
        from parsers.pdf_scanned import parse_scanned_pdf
        return await parse_scanned_pdf(file_path, BANK_NAME)
    return txns

def _extract_account_info(text: str) -> tuple[str, str]:
    account_id, account_holder = "", ""
    m = re.search(r"Account\s*Number?\s*:?\s*(\d{9,20})", text, re.IGNORECASE)
    if m:
        account_id = m.group(1).strip()
    m = re.search(r"(?:Customer|Account\s*Holder|Account)\s*(?:Name)?\s*:?\s*([A-Z ]+)", text, re.IGNORECASE)
    if m:
        account_holder = m.group(1).strip()
    return account_id, account_holder

def _normalize_sbi_rows(rows: list, file_hash: str, account_id: str = "", account_holder: str = "") -> list[UniversalTransaction]:
    txns = []
    for cells in rows:
        t = _parse_sbi_row(cells, account_id, account_holder, file_hash)
        if t:
            txns.append(t)
    return txns

def _parse_sbi_row(cells: list[str], account_id: str, account_holder: str, file_hash: str) -> Optional[UniversalTransaction]:
    try:
        if len(cells) < 5:
            return None
        date = _parse_date(cells[0])
        if not date:
            return None
        # narration is usually column 2 or 1
        narration = cells[2] if len(cells) >= 7 else cells[1]

        # Handle 5-column format (no separate Ref/Value Date columns)
        if len(cells) == 5:
            debit_str  = cells[2]
            credit_str = cells[3]
            balance_str= cells[4]
        elif len(cells) >= 7:
            debit_str  = cells[4]
            credit_str = cells[5]
            balance_str= cells[6]
        elif len(cells) == 6:
            debit_str  = cells[3]
            credit_str = cells[4]
            balance_str= cells[5]
        else:
            return None

        debit  = _parse_amount(debit_str)
        credit = _parse_amount(credit_str)
        balance= _parse_amount(balance_str)

        if debit and debit > 0:
            amount = debit
            txn_type = TransactionType.DEBIT
        elif credit and credit > 0:
            amount = credit
            txn_type = TransactionType.CREDIT
        else:
            return None

        txn_hash = _make_hash(account_id, date, amount, narration)
        return UniversalTransaction(
            txn_hash=txn_hash,
            case_id="",
            statement_id="",
            source_file_hash=file_hash,
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
        logger.debug("SBI row parse error: %s | row: %s", e, cells)
        return None

async def parse_excel(file_path: str) -> list[UniversalTransaction]:
    file_hash = _get_file_hash(file_path)
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header_row = None
    for i, row in enumerate(rows):
        cells = [str(c or "").strip().lower() for c in row]
        if _is_header_row(cells):
            header_row = i
            break
    if header_row is None:
        return []
    data_rows = [[str(c or "").strip() for c in row] for row in rows[header_row+1:]]
    return _normalize_sbi_rows(data_rows, file_hash)

async def parse_csv(file_path: str) -> list[UniversalTransaction]:
    file_hash = _get_file_hash(file_path)
    import csv, chardet
    raw = open(file_path, "rb").read()
    enc = chardet.detect(raw)["encoding"] or "utf-8"
    with open(file_path, "r", encoding=enc, errors="replace") as f:
        reader = csv.reader(f)
        rows = list(reader)
    if not rows:
        return []
    start = 0
    for i, row in enumerate(rows):
        if _is_header_row([c.lower() for c in row]):
            start = i + 1
            break
    return _normalize_sbi_rows(rows[start:], file_hash)
