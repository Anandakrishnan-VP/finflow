from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user, require_role
from security.audit_log import log_action
from schemas.case import CaseCreate, CaseUpdate, CaseResponse

router = APIRouter(prefix="/cases", tags=["cases"])

@router.post("")
async def create_case(data: CaseCreate,
                      current_user=Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""INSERT INTO cases (case_number, title, description,
                classification_level, created_by)
                VALUES (:cn,:t,:d,:cl,:cb) RETURNING id"""),
        {"cn": data.case_number, "t": data.title, "d": data.description,
         "cl": data.classification_level, "cb": current_user["user_id"]}
    )
    case_id = result.fetchone()[0]
    await db.commit()
    await log_action(db, current_user["user_id"], "CASE_CREATED",
                     "case", str(case_id), {"case_number": data.case_number})
    return {"id": str(case_id), "case_number": data.case_number, "status": "OPEN"}

@router.get("")
async def list_cases(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
                     current_user=Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""SELECT id, case_number, title, status, created_at
                FROM cases WHERE status != 'ARCHIVED'
                ORDER BY created_at DESC LIMIT :size OFFSET :offset"""),
        {"size": size, "offset": (page-1)*size}
    )
    return [dict(r._mapping) for r in result.fetchall()]

@router.get("/{case_id}")
async def get_case(case_id: str, current_user=Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM cases WHERE id=:cid AND status != 'ARCHIVED'"),
        {"cid": case_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(404, "Case not found")
    return dict(row._mapping)

@router.patch("/{case_id}")
async def update_case(case_id: str, data: CaseUpdate,
                      current_user=Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=:{k}" for k in updates)
    # Cast assigned_io to UUID string format if present
    if "assigned_io" in updates and updates["assigned_io"]:
        updates["assigned_io"] = str(updates["assigned_io"])
    await db.execute(
        text(f"UPDATE cases SET {set_clause}, updated_at=NOW() WHERE id=:cid"),
        {**updates, "cid": case_id}
    )
    await db.commit()
    await log_action(db, current_user["user_id"], "CASE_UPDATED", "case", case_id, updates)
    return {"status": "updated"}

@router.patch("/{case_id}/archive")  # RULE 9: Never DELETE — only ARCHIVE
async def archive_case(case_id: str,
                       current_user=Depends(require_role("ADMIN")),
                       db: AsyncSession = Depends(get_db)):
    await db.execute(
        text("UPDATE cases SET status='ARCHIVED', updated_at=NOW() WHERE id=:cid"),
        {"cid": case_id}
    )
    await db.commit()
    await log_action(db, current_user["user_id"], "CASE_ARCHIVED", "case", case_id)
    return {"status": "archived"}


@router.delete("/{case_id}")
async def hard_delete_case(case_id: str,
                           current_user=Depends(require_role("ADMIN")),
                           db: AsyncSession = Depends(get_db)):
    """Permanently delete a case and all associated statements, transactions, alerts, and metrics."""
    try:
        # Delete dependent tables first to avoid FK constraints
        await db.execute(text("DELETE FROM alerts WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM money_trails WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM evidence_packages WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM hypothesis_queries WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM case_next_actions WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM case_annotations WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM case_benford_results WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM narration_clusters WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM account_verdicts WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM human_review_queue WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM analysis_tasks WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM watchlist_hits WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM entity_case_appearances WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("UPDATE entities SET first_seen_case = NULL WHERE first_seen_case = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM transactions WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM statements WHERE case_id = :cid"), {"cid": case_id})
        await db.execute(text("DELETE FROM cases WHERE id = :cid"), {"cid": case_id})
        
        await db.commit()
    except Exception as db_err:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database deletion failed: {str(db_err)}")

    # Neo4j Graph Database cleanup
    try:
        from neo4j_client import get_neo4j_driver
        driver = get_neo4j_driver()
        async with driver.session() as session:
            await session.run("MATCH (n {case_id: $case_id}) DETACH DELETE n", {"case_id": case_id})
    except Exception as neo_err:
        import logging
        logging.getLogger(__name__).warning("Failed to clean up Neo4j graph for deleted case %s: %s", case_id, neo_err)

    await log_action(db, current_user["user_id"], "CASE_DELETED_PERMANENTLY", "case", case_id)
    return {"status": "deleted_permanently"}

