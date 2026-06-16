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

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

@router.post("")
async def upload_statement(
    case_id: str,
    file: UploadFile = File(...),
    bank_override: str = FQuery(None, description="Manual bank selection if auto-detect fails"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large. Maximum 50MB.")

    # Save to upload dir
    stmt_id  = uuid4()
    ext      = os.path.splitext(file.filename or "")[-1]
    stored   = os.path.join(settings.upload_dir, f"{stmt_id}{ext}")
    os.makedirs(settings.upload_dir, exist_ok=True)
    with open(stored, "wb") as f:
        f.write(content)

    file_hash = hashlib.sha256(content).hexdigest()
    mime      = mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

    # Parse the file
    try:
        txns, meta = await route_file(stored, case_id, str(stmt_id), bank_override, original_filename=file.filename)
    except Exception as e:
        logger.error("Parse failed for %s: %s", file.filename, e)
        # Save statement record with error status
        await db.execute(
            text("""INSERT INTO statements
                 (id, case_id, original_filename, stored_path, file_hash, file_size_bytes,
                  mime_type, parse_status, parse_error, uploaded_by)
                 VALUES (:id,:cid,:fn,:path,:hash,:size,:mime,'FAILED',:err,:uid)"""),
            {"id": str(stmt_id), "cid": case_id, "fn": file.filename, "path": stored,
             "hash": file_hash, "size": len(content), "mime": mime,
             "err": str(e)[:500], "uid": current_user["user_id"]}
        )
        await db.commit()
        raise HTTPException(422, f"Parse failed: {e}")

    # Save statement record
    await db.execute(
        text("""INSERT INTO statements
             (id, case_id, original_filename, stored_path, file_hash, file_size_bytes,
              mime_type, bank_name, parse_status, row_count, uploaded_by)
             VALUES (:id,:cid,:fn,:path,:hash,:size,:mime,:bank,'PARSED',:rc,:uid)"""),
        {"id": str(stmt_id), "cid": case_id, "fn": file.filename, "path": stored,
         "hash": file_hash, "size": len(content), "mime": mime,
         "bank": meta.get("bank_name",""), "rc": len(txns), "uid": current_user["user_id"]}
    )

    # Save transactions
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
        except Exception as e:
            logger.debug("Transaction insert skip: %s", e)

    await db.commit()
    return {"statement_id": str(stmt_id), "rows_parsed": len(txns),
            "bank": meta.get("bank_name"), "status": "PARSED"}
