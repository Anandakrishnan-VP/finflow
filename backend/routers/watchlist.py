from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user, require_role
from pydantic import BaseModel

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

class WatchlistEntry(BaseModel):
    entry_type: str
    value: str
    reason: str = ""
    source: str = ""

@router.get("")
async def list_watchlist(current_user=Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, entry_type, value, reason, is_active, created_at FROM watchlist WHERE is_active=true"))
    return [dict(r._mapping) for r in result.fetchall()]

@router.post("")
async def add_entry(entry: WatchlistEntry,
                    current_user=Depends(require_role("ADMIN", "SUPERVISOR")),
                    db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""INSERT INTO watchlist (entry_type, value, reason, source, added_by)
                VALUES (:t,:v,:r,:s,:uid) RETURNING id"""),
        {"t": entry.entry_type, "v": entry.value, "r": entry.reason,
         "s": entry.source, "uid": current_user["user_id"]}
    )
    wid = result.fetchone()[0]
    await db.commit()
    return {"id": str(wid), "status": "added"}

@router.patch("/{entry_id}/deactivate")  # F6 FIX: Soft-delete only
async def deactivate_entry(entry_id: str,
                            current_user=Depends(require_role("ADMIN", "SUPERVISOR")),
                            db: AsyncSession = Depends(get_db)):
    await db.execute(
        text("""UPDATE watchlist SET is_active=false,
                deactivated_by=:uid, deactivated_at=NOW()
                WHERE id=:wid"""),
        {"uid": current_user["user_id"], "wid": entry_id}
    )
    await db.commit()
    return {"status": "deactivated"}

@router.get("/cases/{case_id}/watchlist-hits")
async def get_hits(case_id: str, current_user=Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""SELECT wh.hit_at, w.entry_type, w.value, wh.transaction_id
                FROM watchlist_hits wh JOIN watchlist w ON wh.watchlist_id=w.id
                WHERE wh.case_id=:cid ORDER BY wh.hit_at DESC"""),
        {"cid": case_id}
    )
    return [dict(r._mapping) for r in result.fetchall()]
