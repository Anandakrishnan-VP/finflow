from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user

router = APIRouter(tags=["entities"])

@router.get("/cases/{case_id}/entities")
async def get_entities(case_id: str, current_user=Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""SELECT e.id, e.canonical_name, e.linked_accounts, e.risk_score, e.created_at
                FROM entities e WHERE e.first_seen_case=:cid"""),
        {"cid": case_id}
    )
    return [dict(r._mapping) for r in result.fetchall()]

@router.get("/entities/{entity_id}")
async def get_entity(entity_id: str, current_user=Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM entities WHERE id=:eid"), {"eid": entity_id})
    row = result.fetchone()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(404, "Entity not found")
    return dict(row._mapping)
