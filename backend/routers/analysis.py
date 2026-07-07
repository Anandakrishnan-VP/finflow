from fastapi import APIRouter, HTTPException, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user
from tasks.analysis_task import analyze_case_task
from celery.result import AsyncResult
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cases", tags=["analysis"])

@router.post("/{case_id}/analyze")
async def start_analysis(case_id: str,
                         current_user=Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """RULE 3: Returns task_id immediately. Pipeline runs in Celery worker."""
    result = await db.execute(
        text("SELECT id FROM cases WHERE id=:cid AND status != 'ARCHIVED'"),
        {"cid": case_id}
    )
    if not result.fetchone():
        raise HTTPException(404, "Case not found")

    # Check statement blockers before triggering Celery task
    stmt_result = await db.execute(
        text("""SELECT original_filename, parse_status, COALESCE(needs_review_reason, parse_error, parse_stage, '') AS reason
                FROM statements
                WHERE case_id = :cid"""),
        {"cid": case_id}
    )
    statements = stmt_result.fetchall()
    if not statements:
        raise HTTPException(status_code=400, detail="Cannot analyze case: No bank statements have been uploaded.")

    blockers = []
    for stmt in statements:
        if stmt.parse_status not in ("PARSED", "PARSED_WITH_WARNINGS"):
            blockers.append(f"{stmt.original_filename} ({stmt.parse_status}: {stmt.reason})")

    if blockers:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot analyze case: Some statements are not fully parsed. Blockers: {', '.join(blockers)}"
        )

    task = analyze_case_task.delay(case_id)
    await db.execute(
        text("""INSERT INTO analysis_tasks (case_id, celery_task_id, status, started_at)
                VALUES (:cid, :tid, 'QUEUED', NOW())"""),
        {"cid": case_id, "tid": task.id}
    )
    await db.commit()
    return {"task_id": task.id, "status": "queued"}

@router.get("/{case_id}/status/{task_id}")
async def get_analysis_status(case_id: str, task_id: str,
                               current_user=Depends(get_current_user)):
    result = AsyncResult(task_id)
    if result.state == "PROGRESS":
        info = result.info or {}
        return {"status": "running", "progress": info.get("progress", 0),
                "stage": info.get("stage", "")}
    elif result.state == "SUCCESS":
        return {"status": "complete", "progress": 100}
    elif result.state == "FAILURE":
        return {"status": "failed", "error": str(result.info)}
    return {"status": "pending", "progress": 0}

@router.get("/{case_id}/alerts")
async def get_alerts(case_id: str, page: int = Query(1, ge=1),
                     size: int = Query(50, ge=1, le=200),
                     current_user=Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""SELECT account_id, flag, confidence, evidence, created_at
                FROM alerts WHERE case_id=:cid
                ORDER BY confidence DESC LIMIT :size OFFSET :off"""),
        {"cid": case_id, "size": size, "off": (page-1)*size}
    )
    return [dict(r._mapping) for r in result.fetchall()]

@router.get("/{case_id}/transactions")
async def get_transactions(case_id: str,
                            response: Response,
                            page: int = Query(1, ge=1), size: int = Query(100),
                            account_id: str = Query(None),
                            channel: str = Query(None),
                            date_from: str = Query(None),
                            date_to: str = Query(None),
                            amount_min: float = Query(None),
                            amount_max: float = Query(None),
                            direction: str = Query(None),
                            counterparty: str = Query(None),
                            flagged_only: bool = Query(False),
                            current_user=Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    where_clauses = ["t.case_id = :cid"]
    params = {"cid": case_id}

    if account_id:
        where_clauses.append("t.account_id = :aid")
        params["aid"] = account_id

    if channel:
        where_clauses.append("t.narration ILIKE :channel")
        params["channel"] = f"%{channel}%"

    if date_from:
        where_clauses.append("t.txn_date >= :date_from")
        params["date_from"] = date_from

    if date_to:
        where_clauses.append("t.txn_date <= :date_to")
        params["date_to"] = date_to

    if amount_min is not None:
        where_clauses.append("t.amount >= :amount_min")
        params["amount_min"] = amount_min

    if amount_max is not None:
        where_clauses.append("t.amount <= :amount_max")
        params["amount_max"] = amount_max

    if direction == "inbound" or direction == "CR":
        where_clauses.append("t.txn_type = 'CR'")
    elif direction == "outbound" or direction == "DR":
        where_clauses.append("t.txn_type = 'DR'")

    if counterparty:
        where_clauses.append("(t.counterparty_name ILIKE :cp OR t.counterparty_account ILIKE :cp OR t.counterparty_bank ILIKE :cp)")
        params["cp"] = f"%{counterparty}%"

    if flagged_only:
        where_clauses.append("""
            EXISTS (
                SELECT 1 FROM alerts al
                WHERE al.case_id = t.case_id AND al.account_id = t.account_id
                AND al.evidence->>'narration' = t.narration
                AND al.evidence->>'amount' = CAST(t.amount AS VARCHAR)
            )
        """)

    where_str = " AND ".join(where_clauses)

    # 1. Fetch matching total count
    count_query = text(f"SELECT COUNT(*) FROM transactions t WHERE {where_str}")
    count_result = await db.execute(count_query, params)
    total_count = count_result.fetchone()[0] or 0

    # Expose total count in custom header (fully backward compatible)
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    # 2. Fetch paginated rows
    params["size"] = size
    params["off"] = (page - 1) * size
    query = text(f"""SELECT t.txn_hash, t.account_id, t.txn_date, t.amount::text,
                            t.txn_type, t.balance_after::text, t.narration,
                            t.counterparty_account, t.counterparty_name, t.counterparty_bank
                     FROM transactions t
                     WHERE {where_str}
                     ORDER BY t.txn_date LIMIT :size OFFSET :off""")
    
    result = await db.execute(query, params)
    return [dict(r._mapping) for r in result.fetchall()]

@router.get("/{case_id}/money-trail")
async def get_money_trail(case_id: str, current_user=Depends(get_current_user),
                           db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""SELECT mt.amount::text, mt.days_held, mt.credit_txn_id::text,
                       cr.txn_date AS credit_date, cr.narration AS credit_narration,
                       dr.txn_date AS debit_date,  dr.narration AS debit_narration,
                       dr.counterparty_account
                FROM money_trails mt
                JOIN transactions cr ON mt.credit_txn_id = cr.id
                JOIN transactions dr ON mt.debit_txn_id  = dr.id
                WHERE mt.case_id=:cid ORDER BY cr.txn_date"""),
        {"cid": case_id}
    )
    return [dict(r._mapping) for r in result.fetchall()]

@router.get("/{case_id}/summary")
async def get_summary(case_id: str, current_user=Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    txn_result  = await db.execute(
        text("SELECT COUNT(*), SUM(amount)::text FROM transactions WHERE case_id=:cid"),
        {"cid": case_id})
    alert_result = await db.execute(
        text("SELECT flag, COUNT(*) FROM alerts WHERE case_id=:cid GROUP BY flag"),
        {"cid": case_id})
    txn_row = txn_result.fetchone()
    return {
        "transaction_count": txn_row[0] or 0,
        "total_amount": txn_row[1] or "0",
        "alerts_by_flag": {r[0]: r[1] for r in alert_result.fetchall()},
    }
