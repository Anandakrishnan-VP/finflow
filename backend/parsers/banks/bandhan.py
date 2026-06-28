"""
Bandhan Bank statement parser.
CRITICAL: All monetary values = Decimal. Never float (RULE 1).
"""
import hashlib
import logging
import re
from decimal import Decimal
from datetime import datetime
from typing import Optional

import pdfplumber
from schemas.uts import UniversalTransaction, TransactionType
from parsers.shared.amount_parser import parse_amount, resolve_txn_type
from parsers.shared.date_parser import parse_date, is_skip_row

logger = logging.getLogger(__name__)
BANK_NAME = "Bandhan Bank"


def _make_hash(account_id: str, date: datetime, amount: Decimal, narration: str) -> str:
    return hashlib.sha256(
        f"{account_id}|{date.isoformat()}|{amount}|{narration}".encode()
    ).hexdigest()


def _is_header(cells: list[str]) -> bool:
    combined = " ".join(c.lower() for c in cells)
    keywords = {"date", "narration", "particulars", "description", "debit",
                "credit", "withdrawal", "deposit", "balance"}
    return sum(1 for kw in keywords if kw in combined) >= 3


def _extract_account_info(text: str) -> tuple[str, str]:
    account_id, account_holder = "", ""
    m = re.search(r"Account\s*(?:No|Number|No\.)\s*[:\-]?\s*(\d{9,20})", text, re.IGNORECASE)
    if m:
        account_id = m.group(1).strip()
    m = re.search(r"Account\s*Title\s*[:\-]\s*([A-Z][A-Z /\.]+)", text, re.IGNORECASE)
    if m:
        account_holder = m.group(1).strip()
    return account_id, account_holder


def _parse_row(cells: list[str], account_id: str,
               account_holder: str, file_hash: str) -> Optional[UniversalTransaction]:
    try:
        if len(cells) < 4:
            return None
        # Bandhan typical: Date | Narration | Cheque | Debit | Credit | Balance
        if len(cells) >= 6:
            date_str, narration = cells[0].strip(), cells[1].strip()
            debit_raw, credit_raw, balance_raw = cells[3].strip(), cells[4].strip(), cells[5].strip()
        elif len(cells) == 5:
            date_str, narration = cells[0].strip(), cells[1].strip()
            debit_raw, credit_raw, balance_raw = cells[2].strip(), cells[3].strip(), cells[4].strip()
        elif len(cells) == 4:
            date_str, narration = cells[0].strip(), cells[1].strip()
            debit_raw, credit_raw, balance_raw = cells[2].strip(), "", cells[3].strip()
        else:
            return None

        date = parse_date(date_str)
        if not date:
            return None
        if is_skip_row(date_str, narration):
            return None

        debit   = parse_amount(debit_raw)
        credit  = parse_amount(credit_raw)
        balance = parse_amount(balance_raw)

        amount, txn_type_str = resolve_txn_type(debit, credit)
        if amount is None:
            return None

        txn_type = TransactionType.DEBIT if txn_type_str == 'DR' else TransactionType.CREDIT
        txn_hash = _make_hash(account_id, date, amount, narration)
        return UniversalTransaction(
            txn_hash=txn_hash, case_id="", statement_id="",
            source_file_hash=file_hash, account_id=account_id,
            account_holder=account_holder, bank_name=BANK_NAME,
            txn_date=date, amount=amount, txn_type=txn_type,
            balance_after=balance, narration=narration,
        )
    except Exception as e:
        logger.debug("Bandhan row error: %s | cells: %s", e, cells)
        return None


async def parse_pdf(file_path: str) -> tuple[list, list]:
    file_hash = hashlib.sha256(open(file_path, "rb").read()).hexdigest()

    try:
        import camelot
        tables = camelot.read_pdf(file_path, pages="all", flavor="lattice")
        txns, account_id, account_holder = [], "", ""
        for table in tables:
            for _, row in table.df.iterrows():
                cells = [str(c).strip() for c in row]
                if _is_header(cells):
                    continue
                txn = _parse_row(cells, account_id, account_holder, file_hash)
                if txn:
                    txns.append(txn)
        if len(txns) >= 3:
            logger.info("Bandhan: camelot extracted %d transactions", len(txns))
            return txns, []
    except Exception as e:
        logger.debug("Bandhan camelot failed: %s", e)

    try:
        from parsers.table_reconstruction import detect_column_bands, reconstruct_rows
        txns, account_id, account_holder = [], "", ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                header_text = page.extract_text() or ""
                if not account_id:
                    account_id, account_holder = _extract_account_info(header_text)
                words = page.extract_words(use_text_flow=False)
                words_dicts = [{"text": w["text"], "x0": w["x0"], "x1": w["x1"],
                                "top": w["top"], "bottom": w["bottom"]} for w in words]
                bands = detect_column_bands(words_dicts, page.width)
                rows = reconstruct_rows(words_dicts, bands)
                for row in rows:
                    cells = [row.get("date",""), row.get("description",""),
                             row.get("ref_no",""), row.get("debit",""),
                             row.get("credit",""), row.get("balance","")]
                    txn = _parse_row(cells, account_id, account_holder, file_hash)
                    if txn:
                        txns.append(txn)
        if len(txns) >= 3:
            logger.info("Bandhan: position reconstruction extracted %d transactions", len(txns))
            return txns, []
    except Exception as e:
        logger.debug("Bandhan pdfplumber failed: %s", e)

    from parsers.pdf_scanned import parse_scanned_pdf
    return await parse_scanned_pdf(file_path, BANK_NAME)


async def parse_excel(file_path: str) -> tuple[list, list]:
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    rows = [[str(c or "").strip() for c in row] for row in ws.iter_rows(values_only=True)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    file_hash = hashlib.sha256(open(file_path, "rb").read()).hexdigest()
    txns = [t for r in rows[start:] for t in [_parse_row(r, "", "", file_hash)] if t]
    return txns, []


async def parse_csv(file_path: str) -> tuple[list, list]:
    import csv, chardet
    enc = chardet.detect(open(file_path, "rb").read())["encoding"] or "utf-8"
    with open(file_path, encoding=enc, errors="replace") as f:
        rows = [[c.strip() for c in r] for r in csv.reader(f)]
    start = next((i+1 for i, r in enumerate(rows) if _is_header(r)), 0)
    file_hash = hashlib.sha256(open(file_path, "rb").read()).hexdigest()
    txns = [t for r in rows[start:] for t in [_parse_row(r, "", "", file_hash)] if t]
    return txns, []
