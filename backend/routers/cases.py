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
