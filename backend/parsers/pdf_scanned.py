"""
OCR fallback parser for scanned bank statement PDFs.
Uses Tesseract via the sandboxed subprocess wrapper.
Low-confidence rows are queued for human review.
"""
import logging, re, tempfile, hashlib
from decimal import Decimal
from datetime import datetime
from pathlib import Path
from schemas.uts import UniversalTransaction, TransactionType, TransactionFlag
from security.sandbox import run_sandboxed_tesseract

logger = logging.getLogger(__name__)
OCR_CONFIDENCE_THRESHOLD = 0.70  # Rows below this → human_review_queue

async def parse_scanned_pdf(file_path: str, bank_name: str) -> list[UniversalTransaction]:
    """
    Convert each PDF page to image, run Tesseract, parse TSV output.
    Returns transactions. Flags LOW_OCR_CONFIDENCE rows.
    """
    import fitz  # PyMuPDF — pip install PyMuPDF in requirements
    doc = fitz.open(file_path)
    txns = []
    file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()

    for page_num, page in enumerate(doc):
        # Render page at 300 DPI
        mat = fitz.Matrix(300/72, 300/72)
        pix = page.get_pixmap(matrix=mat)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            pix.save(tmp.name)
            tsv_text = await run_sandboxed_tesseract(tmp.name, lang="eng+hin")
            Path(tmp.name).unlink(missing_ok=True)

        if not tsv_text:
            continue

        page_txns = _parse_tsv(tsv_text, bank_name, file_hash)
        txns.extend(page_txns)

    doc.close()
    return txns

def _parse_tsv(tsv_text: str, bank_name: str, file_hash: str) -> list[UniversalTransaction]:
    """Parse Tesseract TSV output into transaction lines."""
    lines = tsv_text.strip().split("\n")
    txns = []
    current_line_words = []
    current_conf_scores = []

    for line in lines[1:]:  # Skip header
        parts = line.split("\t")
        if len(parts) < 12:
            continue
        word = parts[11].strip()
        try:
            conf = float(parts[10])
        except ValueError:
            conf = 0.0

        if word:
            current_line_words.append(word)
            if conf > 0:
                current_conf_scores.append(conf)

    # Combine all words into a single text block and use line-based regex
    full_text = " ".join(current_line_words)
    avg_confidence = sum(current_conf_scores) / len(current_conf_scores) if current_conf_scores else 0.0

    # Use regex to find transaction-like lines: date + amount pattern
    txn_pattern = re.compile(
        r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+'
        r'(.{5,60}?)\s+'
        r'([\d,]+\.\d{2})\s+'
        r'([\d,]+\.\d{2})?\s+'
        r'([\d,]+\.\d{2})'
    )
    for m in txn_pattern.finditer(full_text):
        try:
            date_str, narration, amount1_str, amount2_str, balance_str = m.groups()
            for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"]:
                try:
                    date = datetime.strptime(date_str, fmt)
                    break
                except ValueError:
                    continue
            else:
                continue

            amount1 = Decimal(amount1_str.replace(",", ""))
            balance = Decimal(balance_str.replace(",", ""))

            txn_hash = hashlib.sha256(
                f"{bank_name}|{date.isoformat()}|{amount1}|{narration}".encode()
            ).hexdigest()

            t = UniversalTransaction(
                txn_hash=txn_hash, case_id="", statement_id="",
                source_file_hash=file_hash, account_id="",
                account_holder="", bank_name=bank_name,
                txn_date=date, amount=amount1,
                txn_type=TransactionType.DEBIT,  # Will be corrected by balance validator
                balance_after=balance, narration=narration.strip(),
                ocr_confidence=avg_confidence / 100.0,
            )
            if avg_confidence < OCR_CONFIDENCE_THRESHOLD * 100:
                t.flags.append(TransactionFlag.LOW_OCR_CONFIDENCE)
            txns.append(t)
        except Exception:
            continue

    return txns
