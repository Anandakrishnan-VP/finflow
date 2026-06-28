"""
Axis Bank statement parser.
Axis column format: Tran Date | Particulars | Chq/Ref No | Value Date | Withdrawal | Deposit | Balance
CRITICAL: All monetary values = Decimal. Never float (RULE 1).
"""
import hashlib, logging, re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import Optional
import pdfplumber
from schemas.uts import UniversalTransaction, TransactionType

logger = logging.getLogger(__name__)
BANK_NAME = "Axis Bank"
from parsers.shared.amount_parser import parse_amount, resolve_txn_type
from parsers.shared.date_parser import parse_date, is_skip_row


def _is_header(cells):
    t = " ".join(c.lower() for c in cells)
    return sum(1 for k in ["tran","withdrawal","deposit","balance","particular"] if k in t) >= 2

def _parse_row(cells, account_id, account_holder, file_path):
    try:
        if len(cells) < 5: return None
        date = parse_date(cells[0])
        if not date: return None
        narration = cells[1]
        if is_skip_row(cells[0], narration): return None
        # Axis: [Date, Particulars, Ref, Value Date, Withdrawal, Deposit, Balance]
        if len(cells) >= 7:
            wd, dep, bal = parse_amount(cells[4]), parse_amount(cells[5]), parse_amount(cells[6])
        elif len(cells) >= 5:
            wd, dep, bal = parse_amount(cells[2]), parse_amount(cells[3]), parse_amount(cells[4])
        else:
            return None
        amount, txn_type_str = resolve_txn_type(wd, dep)
        if amount is None:
            return None
        txn_type = TransactionType.DEBIT if txn_type_str == 'DR' else TransactionType.CREDIT
        h = hashlib.sha256(f"{account_id}|{date.isoformat()}|{amount}|{narration}".encode()).hexdigest()
        return UniversalTransaction(
            txn_hash=h, case_id="", statement_id="",
            source_file_hash=hashlib.sha256(open(file_path,"rb").read(8192)).hexdigest() if file_path else "",
            account_id=account_id, account_holder=account_holder, bank_name=BANK_NAME,
            txn_date=date, amount=amount, txn_type=txn_type, balance_after=bal, narration=narration,
        )
    except Exception as e:
        logger.debug("Axis row error: %s", e)
        return None

async def parse_pdf(file_path: str) -> list[UniversalTransaction]:
    txns = []
    try:
        import camelot
        tables = camelot.read_pdf(file_path, pages="all", flavor="lattice")
        rows = [list(map(str, r)) for t in tables for _, r in t.df.iterrows() if not _is_header(list(map(str, r)))]
        txns = [t for r in rows for t in [_parse_row(r, "", "", file_path)] if t]
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
                    t = _parse_row(cells, "", "", file_path)
                    if t: txns.append(t)
        if txns: return txns
    except Exception: pass
    from parsers.pdf_scanned import parse_scanned_pdf
    return await parse_scanned_pdf(file_path, BANK_NAME)

async def parse_excel(file_path: str) -> list[UniversalTransaction]:
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    rows = [[str(c or "").strip() for c in r] for r in wb.active.iter_rows(values_only=True)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    return [t for r in rows[start:] for t in [_parse_row(r, "", "", "")] if t]

async def parse_csv(file_path: str) -> list[UniversalTransaction]:
    import csv, chardet
    enc = chardet.detect(open(file_path,"rb").read())["encoding"] or "utf-8"
    with open(file_path, encoding=enc, errors="replace") as f:
        rows = [[c.strip() for c in r] for r in csv.reader(f)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    return [t for r in rows[start:] for t in [_parse_row(r, "", "", "")] if t]
