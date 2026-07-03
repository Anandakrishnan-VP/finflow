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
from parsers.shared.amount_parser import parse_amount, resolve_txn_type
from parsers.shared.date_parser import parse_date, is_skip_row

def _is_header_row(cells: list[str]) -> bool:
    text = " ".join(c.lower() for c in cells)
    return sum(1 for kw in ["date", "description", "debit", "credit", "balance"] if kw in text) >= 3

def _make_hash(account_id: str, date: datetime, amount: Decimal, narration: str) -> str:
    return hashlib.sha256(
        f"{account_id}|{date.isoformat()}|{amount}|{narration}".encode()
    ).hexdigest()

async def parse_pdf(file_path: str) -> list[UniversalTransaction]:
    # Pre-extract account info from the first page header text first
    account_id, account_holder = "", ""
    page_count = 1
    try:
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
            if pdf.pages:
                header_text = pdf.pages[0].extract_text() or ""
                account_id, account_holder = _extract_account_info(header_text)
    except Exception as e:
        logger.debug("SBI pre-extract account info failed: %s", e)

    # Try camelot lattice first (skip for large files to avoid memory lockups)
    if page_count <= 20:
        try:
            import camelot
            tables = camelot.read_pdf(file_path, pages="all", flavor="lattice")
            all_rows = []
            for table in tables:
                for _, row in table.df.iterrows():
                    cells = [str(c).strip() for c in row]
                    if not _is_header_row([c.lower() for c in cells]):
                        all_rows.append(cells)
            txns = _normalize_sbi_rows(all_rows, file_path, account_id, account_holder)
            if txns:
                return txns
        except Exception as e:
            logger.debug("SBI camelot failed: %s", e)
    else:
        logger.info("Large PDF (%d pages). Skipping Camelot in SBI parser.", page_count)

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
                    txn = _parse_sbi_row(cells, account_id, account_holder, file_path)
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

def _normalize_sbi_rows(rows: list, file_path: str, account_id: str = "", account_holder: str = "") -> list[UniversalTransaction]:
    txns = []
    for cells in rows:
        t = _parse_sbi_row(cells, account_id, account_holder, file_path)
        if t:
            txns.append(t)
    return txns

def _parse_sbi_row(cells: list[str], account_id: str, account_holder: str, file_path: str) -> Optional[UniversalTransaction]:
    try:
        if len(cells) < 5:
            return None
        date = parse_date(cells[0])
        if not date:
            return None
        # narration is usually column 2 or 1
        narration = cells[2] if len(cells) >= 7 else cells[1]
        if is_skip_row(cells[0], narration):
            return None

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

        debit  = parse_amount(debit_str)
        credit = parse_amount(credit_str)
        balance= parse_amount(balance_str)

        amount, txn_type_str = resolve_txn_type(debit, credit)
        if amount is None:
            return None
        txn_type = TransactionType.DEBIT if txn_type_str == 'DR' else TransactionType.CREDIT

        txn_hash = _make_hash(account_id, date, amount, narration)
        return UniversalTransaction(
            txn_hash=txn_hash,
            case_id="",
            statement_id="",
            source_file_hash=hashlib.sha256(open(file_path,"rb").read()).hexdigest() if file_path else "",
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
    return _normalize_sbi_rows(data_rows, file_path)

async def parse_csv(file_path: str) -> list[UniversalTransaction]:
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
    return _normalize_sbi_rows(rows[start:], file_path)
