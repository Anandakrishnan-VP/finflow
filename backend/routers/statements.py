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

@router.post("/upload")
async def upload_statements_bulk(
    case_id: str,
    files: list[UploadFile] = File(...),
    overrides_json: str = Form(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import json
    settings = get_settings()

    # Parse overrides_json if present
    overrides = {}
    if overrides_json:
        try:
            overrides = json.loads(overrides_json)
        except Exception:
            logger.warning("Failed to parse overrides_json: %s", overrides_json)

    uploaded_count = 0
    parsed_transactions = 0
    rejected_count = 0
    ocr_runs = 0
    details = []

    for file in files:
        stmt_id = uuid4()
        ext = os.path.splitext(file.filename or "")[-1]
        stored = os.path.join(settings.upload_dir, f"{stmt_id}{ext}")
        os.makedirs(settings.upload_dir, exist_ok=True)

        # Stream to disk
        sha256 = hashlib.sha256()
        size = 0
        CHUNK = 1024 * 1024
        try:
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
            mime = mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

            # Insert statement row in PROCESSING state
            await db.execute(
                text("""INSERT INTO statements
                     (id, case_id, original_filename, stored_path, file_hash, file_size_bytes,
                      mime_type, parse_status, parse_progress, parse_stage, uploaded_by)
                     VALUES (:id,:cid,:fn,:path,:hash,:size,:mime,'PROCESSING',5,'Starting parse...',:uid)"""),
                {"id": str(stmt_id), "cid": case_id, "fn": file.filename, "path": stored,
                 "hash": file_hash, "size": size, "mime": mime, "uid": current_user["user_id"]}
            )
            await db.commit()

            # Run parser route_file directly
            bank_override = overrides.get(file.filename)

            # Progress callback to update database status
            async def progress_cb(pct: int, stage: str):
                await db.execute(
                    text("UPDATE statements SET parse_progress=:pct, parse_stage=:stage WHERE id=:sid"),
                    {"pct": pct, "stage": stage, "sid": str(stmt_id)}
                )
                await db.commit()

            txns, meta = await route_file(
                stored, case_id, str(stmt_id), bank_override, file.filename, progress_callback=progress_cb
            )

            # Save parsed transactions to db
            for txn in txns:
                try:
                    await db.execute(
                        text("""INSERT INTO transactions
                             (txn_hash, case_id, statement_id, account_id, account_holder, bank_name,
                              txn_date, amount, txn_type, balance_after, narration,
                              counterparty_account, counterparty_name)
                              VALUES (:h,:cid,:sid,:aid,:ah,:bn,:td,:amt,:tt,:bal,:nar,:cp,:cpn)
                              ON CONFLICT (txn_hash) DO NOTHING"""),
                         {"h": txn.txn_hash, "cid": case_id, "sid": str(stmt_id),
                          "aid": txn.account_id, "ah": txn.account_holder, "bn": txn.bank_name,
                          "td": txn.txn_date, "amt": str(txn.amount), "tt": txn.txn_type,
                          "bal": str(txn.balance_after) if txn.balance_after else None,
                          "nar": txn.narration, "cp": txn.counterparty_account,
                          "cpn": txn.counterparty_name}
                    )
                except Exception as ex:
                    logger.debug("Transaction insert skip in endpoint: %s", ex)

            # Update statement record to PARSED
            await db.execute(
                text("""UPDATE statements 
                        SET bank_name = :bank, parse_status = 'PARSED', parse_progress = 100, 
                            parse_stage = 'Parsing completed successfully', row_count = :rc
                        WHERE id = :sid"""),
                {"bank": meta.get("bank_name", ""), "rc": len(txns), "sid": str(stmt_id)}
            )
            await db.commit()

            uploaded_count += 1
            parsed_transactions += len(txns)
            if meta.get("ocr_used"):
                ocr_runs += 1

            details.append({
                "filename": file.filename,
                "engine": meta.get("bank_name", "UNKNOWN"),
                "tx_count": len(txns),
                "status": "success"
            })

        except Exception as e:
            logger.error("Failed to process file %s: %s", file.filename, e, exc_info=True)
            # Update statement to FAILED in DB
            try:
                await db.execute(
                    text("""UPDATE statements 
                            SET parse_status = 'FAILED', parse_progress = 100, 
                                parse_stage = 'Parsing failed', parse_error = :err
                            WHERE id = :sid"""),
                    {"err": str(e)[:500], "sid": str(stmt_id)}
                )
                await db.commit()
            except Exception as db_err:
                logger.error("Failed to set statement status to FAILED in DB: %s", db_err)

            rejected_count += 1
            details.append({
                "filename": file.filename,
                "engine": "FAILED",
                "tx_count": 0,
                "status": "failed"
            })

    return {
        "uploaded_count": uploaded_count,
        "parsed_transactions": parsed_transactions,
        "rejected_count": rejected_count,
        "ocr_runs": ocr_runs,
        "details": details
    }

@router.get("")
async def list_statements(
    case_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""SELECT original_filename AS filename, bank_name AS bank,
                       parse_status AS status, row_count AS rows_parsed, parse_error AS error,
                       parse_progress AS progress, parse_stage AS stage
                FROM statements
                WHERE case_id = :cid
                ORDER BY uploaded_at DESC"""),
        {"cid": case_id}
    )
    return [dict(r._mapping) for r in result.fetchall()]

