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
        text("""SELECT original_filename AS filename, bank_name AS bank,
                       parse_status AS status, row_count AS rows_parsed, parse_error AS error,
                       parse_progress AS progress, parse_stage AS stage
                FROM statements
                WHERE case_id = :cid
                ORDER BY uploaded_at DESC"""),
        {"cid": case_id}
    )
    return [dict(r._mapping) for r in result.fetchall()]

