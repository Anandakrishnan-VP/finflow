"""
Kotak Mahindra Bank statement parser.
Kotak format: Txn Date | Description | Dr / Cr | Withdrawal Amt | Deposit Amt | Balance
CRITICAL: All monetary values = Decimal. Never float (RULE 1).
"""
import hashlib, logging, re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import Optional
import pdfplumber
from schemas.uts import UniversalTransaction, TransactionType

logger = logging.getLogger(__name__)
BANK_NAME = "Kotak Mahindra Bank"
DATE_FORMATS = ["%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d-%b-%Y"]

def _pd(s):
    for fmt in DATE_FORMATS:
        try: return datetime.strptime(s.strip(), fmt)
        except: pass
    return None

def _pa(s) -> Optional[Decimal]:
    if not s or not s.strip(): return None
    cleaned = re.sub(r"[₹,\s]", "", s)
    try: return Decimal(cleaned)
    except: return None

def _is_header(cells):
    t = " ".join(c.lower() for c in cells)
    return sum(1 for k in ["txn","date","description","dr","cr","balance","withdrawal","deposit"] if k in t) >= 2

def _get_file_hash(file_path: str) -> str:
    if not file_path: return ""
    try:
        with open(file_path, "rb") as f:
            return hashlib.sha256(f.read(8192)).hexdigest()
    except Exception:
        return ""

def _parse_row(cells, account_id, account_holder, file_hash):
    try:
        if len(cells) < 4: return None
        date = _pd(cells[0])
        if not date: return None
        narration = cells[1]
        # Kotak may have Dr/Cr indicator in col 2
        dr_cr_indicator = cells[2].strip().upper() if len(cells) > 2 else ""
        if len(cells) >= 6:
            wd, dep, bal = _pa(cells[3]), _pa(cells[4]), _pa(cells[5])
        elif len(cells) >= 5:
            wd, dep, bal = _pa(cells[2]), _pa(cells[3]), _pa(cells[4])
        else:
            wd, dep, bal = None, None, None

        if wd and wd > 0:
            amount, txn_type = wd, TransactionType.DEBIT
        elif dep and dep > 0:
            amount, txn_type = dep, TransactionType.CREDIT
        elif dr_cr_indicator in ("DR", "D") and _pa(cells[-2]):
            amount, txn_type = _pa(cells[-2]), TransactionType.DEBIT
            bal = _pa(cells[-1])
        elif dr_cr_indicator in ("CR", "C") and _pa(cells[-2]):
            amount, txn_type = _pa(cells[-2]), TransactionType.CREDIT
            bal = _pa(cells[-1])
        else:
            return None

        h = hashlib.sha256(f"{account_id}|{date.isoformat()}|{amount}|{narration}".encode()).hexdigest()
        return UniversalTransaction(
            txn_hash=h, case_id="", statement_id="",
            source_file_hash=file_hash,
            account_id=account_id, account_holder=account_holder, bank_name=BANK_NAME,
            txn_date=date, amount=amount, txn_type=txn_type, balance_after=bal, narration=narration,
        )
    except Exception as e:
        logger.debug("Kotak row error: %s", e)
        return None

async def parse_pdf(file_path: str) -> list[UniversalTransaction]:
    file_hash = _get_file_hash(file_path)
    txns = []
    try:
        import camelot
        tables = camelot.read_pdf(file_path, pages="all", flavor="lattice")
        rows = [list(map(str, r)) for t in tables for _, r in t.df.iterrows() if not _is_header(list(map(str, r)))]
        txns = [t for r in rows for t in [_parse_row(r, "", "", file_hash)] if t]
        if txns: return txns
    except Exception: pass
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                table = page.extract_table()
                if not table: continue
                for row in table:
                    cells = [str(c or "").strip() for c in row]
                    if _is_header(cells): continue
                    t = _parse_row(cells, "", "", file_hash)
                    if t: txns.append(t)
        if txns: return txns
    except Exception: pass
    from parsers.pdf_scanned import parse_scanned_pdf
    return await parse_scanned_pdf(file_path, BANK_NAME)

async def parse_excel(file_path: str) -> list[UniversalTransaction]:
    file_hash = _get_file_hash(file_path)
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    rows = [[str(c or "").strip() for c in r] for r in wb.active.iter_rows(values_only=True)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    return [t for r in rows[start:] for t in [_parse_row(r, "", "", file_hash)] if t]

async def parse_csv(file_path: str) -> list[UniversalTransaction]:
    file_hash = _get_file_hash(file_path)
    import csv, chardet
    enc = chardet.detect(open(file_path,"rb").read())["encoding"] or "utf-8"
    with open(file_path, encoding=enc, errors="replace") as f:
        rows = [[c.strip() for c in r] for r in csv.reader(f)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    return [t for r in rows[start:] for t in [_parse_row(r, "", "", file_hash)] if t]
