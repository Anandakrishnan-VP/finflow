import os, shutil, hashlib, mimetypes
from uuid import uuid4
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from fastapi import Query as FQuery
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user
from config import get_settings
from parsers.router import route_file
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cases/{case_id}/statements", tags=["statements"])

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB

@router.post("")
async def upload_statement(
    case_id: str,
    file: UploadFile = File(...),
    bank_override: str = FQuery(None, description="Manual bank selection if auto-detect fails"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()

    # Stream to disk in chunks — avoids loading large files into RAM
    stmt_id  = uuid4()
    ext      = os.path.splitext(file.filename or "")[-1]
    stored   = os.path.join(settings.upload_dir, f"{stmt_id}{ext}")
    os.makedirs(settings.upload_dir, exist_ok=True)

    sha256   = hashlib.sha256()
    size     = 0
    CHUNK    = 1024 * 1024  # 1 MB chunks
    with open(stored, "wb") as f:
        while True:
            chunk = await file.read(CHUNK)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                f.close()
                os.remove(stored)
                raise HTTPException(413, f"File too large. Maximum {MAX_FILE_SIZE // (1024*1024)}MB.")
            sha256.update(chunk)
            f.write(chunk)

    file_hash = sha256.hexdigest()
    mime      = mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

    # Insert statement row in PROCESSING state
    await db.execute(
        text("""INSERT INTO statements
             (id, case_id, original_filename, stored_path, file_hash, file_size_bytes,
              mime_type, parse_status, parse_progress, parse_stage, uploaded_by)
             VALUES (:id,:cid,:fn,:path,:hash,:size,:mime,'PROCESSING',0,'Queued for parsing',:uid)"""),
        {"id": str(stmt_id), "cid": case_id, "fn": file.filename, "path": stored,
         "hash": file_hash, "size": size, "mime": mime, "uid": current_user["user_id"]}
    )
    await db.commit()

    # Enqueue Celery task
    from tasks.analysis_task import parse_statement_task
    parse_statement_task.delay(
        str(stmt_id),
        stored,
        case_id,
        bank_override,
        file.filename,
        current_user["user_id"]
    )

    return {"statement_id": str(stmt_id), "status": "PROCESSING", "rows_parsed": None, "bank": None}

@router.get("")
async def list_statements(
    case_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""SELECT id, original_filename AS filename, bank_name AS bank,
                       parse_status AS status, row_count AS rows_parsed, parse_error AS error,
                       parse_progress AS progress, parse_stage AS stage, column_mapping,
                       uploaded_at, file_size_bytes AS file_size
                FROM statements
                WHERE case_id = :cid
                ORDER BY uploaded_at DESC"""),
        {"cid": case_id}
    )
    return [dict(r._mapping) for r in result.fetchall()]


@router.get("/verify-chain")
async def verify_case_transactions_chain(
    case_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify cryptographic hash chain of custody for all statements/transactions in the case."""
    stmt_result = await db.execute(
        text("SELECT id, original_filename, file_hash FROM statements WHERE case_id = :cid"),
        {"cid": case_id}
    )
    statements = stmt_result.fetchall()
    
    overall_intact = True
    verified_statements = []
    broken_txns = []
    total_txns = 0
    
    for stmt in statements:
        txn_result = await db.execute(
            text("""SELECT id, txn_hash, chain_hash, txn_date, amount, account_id 
                    FROM transactions 
                    WHERE statement_id = :sid 
                    ORDER BY txn_date ASC, txn_hash ASC"""),
            {"sid": stmt.id}
        )
        txns = txn_result.fetchall()
        total_txns += len(txns)
        
        stmt_intact = True
        prev_hash = stmt.file_hash
        
        for txn in txns:
            content = f"{txn.txn_hash}|{prev_hash}"
            expected = hashlib.sha256(content.encode()).hexdigest()
            if expected != txn.chain_hash:
                stmt_intact = False
                overall_intact = False
                broken_txns.append({
                    "id": str(txn.id),
                    "txn_hash": txn.txn_hash,
                    "expected_chain_hash": expected,
                    "actual_chain_hash": txn.chain_hash
                })
            prev_hash = txn.chain_hash or expected
            
        verified_statements.append({
            "statement_id": str(stmt.id),
            "filename": stmt.original_filename,
            "intact": stmt_intact,
            "transaction_count": len(txns)
        })
        
    return {
        "chain_intact": overall_intact,
        "total_statements": len(statements),
        "total_transactions": total_txns,
        "statements": verified_statements,
        "broken_transactions": broken_txns
    }


async def get_file_preview(file_path: str) -> list[list[str]]:
    ext = os.path.splitext(file_path)[-1].lower()
    rows = []
    if ext in (".csv",):
        import csv, chardet
        try:
            with open(file_path, "rb") as f:
                sample = f.read(8192)
            enc = chardet.detect(sample)["encoding"] or "utf-8"
            with open(file_path, encoding=enc, errors="replace") as f:
                reader = csv.reader(f)
                for idx, r in enumerate(reader):
                    if idx >= 20: break
                    rows.append([str(c).strip() for c in r])
        except Exception:
            try:
                with open(file_path, encoding="utf-8", errors="replace") as f:
                    reader = csv.reader(f)
                    for idx, r in enumerate(reader):
                        if idx >= 20: break
                        rows.append([str(c).strip() for c in r])
            except Exception:
                pass
    elif ext in (".xlsx", ".xls"):
        try:
            if ext == ".xls":
                import xlrd
                wb = xlrd.open_workbook(file_path)
                sheet = wb.sheet_by_index(0)
                for rx in range(min(sheet.nrows, 20)):
                    rows.append([str(sheet.cell_value(rx, cx)).strip() for cx in range(sheet.ncols)])
            else:
                import openpyxl
                wb = openpyxl.load_workbook(file_path, data_only=True)
                sheet = wb.worksheets[0]
                for idx, r in enumerate(sheet.iter_rows(values_only=True)):
                    if idx >= 20: break
                    rows.append([str(c or "").strip() for c in r])
        except Exception:
            pass
    elif ext == ".pdf":
        import pdfplumber, re
        try:
            with pdfplumber.open(file_path) as pdf:
                if pdf.pages:
                    table = pdf.pages[0].extract_table()
                    if table:
                        for r in table[:20]:
                            rows.append([str(c or "").strip() for c in r])
                    else:
                        text = pdf.pages[0].extract_text()
                        if text and len(text.strip()) > 100:
                            for idx, line in enumerate(text.split("\n")[:20]):
                                tokens = re.split(r'\s{2,}', line.strip())
                                if len(tokens) <= 1:
                                    tokens = line.strip().split("\t")
                                rows.append([t.strip() for t in tokens if t.strip()])
                        else:
                            # Scanned PDF: Run OCR on the first page to generate preview rows
                            import fitz, asyncio, tempfile
                            from security.sandbox import run_sandboxed_tesseract
                            from parsers.pdf_scanned import reconstruct_table_from_tsv, preprocess_image
                            from collections import Counter
                            
                            doc = fitz.open(file_path)
                            if doc:
                                page = doc[0]
                                mat = fitz.Matrix(300/72, 300/72)
                                pix = page.get_pixmap(matrix=mat)
                                
                                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_raw:
                                    pix.save(tmp_raw.name)
                                    
                                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
                                    success = preprocess_image(tmp_raw.name, tmp_proc.name)
                                    img_to_ocr = tmp_proc.name if success else tmp_raw.name
                                    
                                tsv_text = await run_sandboxed_tesseract(img_to_ocr, lang="eng")
                                
                                os.unlink(tmp_raw.name)
                                os.unlink(tmp_proc.name)
                                
                                table = reconstruct_table_from_tsv(tsv_text)
                                if table:
                                    # 1. Run collapsed row expansion to reveal proper columns if they were merged
                                    from parsers.pdf_scanned import expand_collapsed_rows
                                    table = expand_collapsed_rows(table)
                                    
                                    # 2. Pad rows to maximum row length to maintain a clean rectangular grid
                                    max_len = max(len(r) for r in table) if table else 0
                                    if max_len > 0:
                                        for r in table:
                                            padded_row = r + [""] * (max_len - len(r))
                                            rows.append(padded_row)
                                            if len(rows) >= 40:
                                                break
        except Exception as e:
            logger.warning("Failed to generate PDF preview via digital/OCR pipeline: %s", e)
    return rows


@router.get("/{statement_id}/preview")
async def preview_statement_file(
    case_id: str,
    statement_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve raw rows (up to 20) of a statement file for visual mapping."""
    result = await db.execute(
        text("SELECT stored_path FROM statements WHERE id = :sid AND case_id = :cid"),
        {"sid": statement_id, "cid": case_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Statement not found")
    
    stored_path = row[0]
    if not os.path.exists(stored_path):
        raise HTTPException(404, "Statement file not found on disk")
        
    try:
        preview_rows = await get_file_preview(stored_path)
        return {"rows": preview_rows}
    except Exception as e:
        raise HTTPException(500, f"Failed to generate preview: {e}")


from pydantic import BaseModel
class ReparseRequest(BaseModel):
    column_mapping: dict


@router.post("/{statement_id}/reparse")
async def reparse_statement_file(
    case_id: str,
    statement_id: str,
    payload: ReparseRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reparse a statement file with custom column mapping."""
    result = await db.execute(
        text("SELECT stored_path, original_filename, bank_name FROM statements WHERE id = :sid AND case_id = :cid"),
        {"sid": statement_id, "cid": case_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Statement not found")
        
    stored_path, filename, bank_name = row
    
    # Clean old transactions for this statement
    await db.execute(
        text("DELETE FROM transactions WHERE statement_id = :sid"),
        {"sid": statement_id}
    )
    
    # Save column mapping & reset status to PROCESSING
    import json
    await db.execute(
        text("""UPDATE statements 
                SET column_mapping = CAST(:mapping AS jsonb), 
                    parse_status = 'PROCESSING', 
                    parse_progress = 0,
                    parse_stage = 'Queued for reparsing',
                    parse_error = NULL
                WHERE id = :sid"""),
        {"mapping": json.dumps(payload.column_mapping), "sid": statement_id}
    )
    await db.commit()
    
    # Enqueue task
    from tasks.analysis_task import parse_statement_task
    parse_statement_task.delay(
        statement_id,
        stored_path,
        case_id,
        bank_name or "generic",
        filename,
        current_user["user_id"],
        payload.column_mapping
    )
    
    return {"statement_id": statement_id, "status": "PROCESSING"}

