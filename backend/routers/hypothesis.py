"""
Hypothesis API Router.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import json
from database import get_db
from security.auth import get_current_user
from engine.hypothesis import run_hypothesis_query

router = APIRouter(prefix="/cases", tags=["hypothesis"])


@router.get("/{case_id}/hypothesis")
async def get_hypothesis_path(
    case_id: str,
    from_account: str = Query(..., min_length=1),
    to_account: str = Query(..., min_length=1),
    max_hops: int = Query(4, ge=1, le=10),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify case exists
    case_row = await db.execute(text("SELECT id FROM cases WHERE id=:cid"), {"cid": case_id})
    if not case_row.fetchone():
        raise HTTPException(status_code=404, detail="Case not found")

    # Run the Neo4j path query
    result = await run_hypothesis_query(case_id, from_account, to_account, max_hops)

    # Log to DB
    user_id = current_user.get("id")
    try:
        await db.execute(
            text("""
                INSERT INTO hypothesis_queries
                (case_id, queried_by, from_account, to_account, max_hops, path_found, path_data)
                VALUES (:cid, :uid, :from_acc, :to_acc, :hops, :found, :data)
            """),
            {
                "cid": case_id,
                "uid": user_id,
                "from_acc": from_account,
                "to_acc": to_account,
                "hops": max_hops,
                "found": result["path_found"],
                "data": json.dumps(result["path_data"]),
            }
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        # Log the error but return the query result anyway so the investigator is not blocked
        router.logger = router.logger if hasattr(router, 'logger') else None
        print(f"Error logging hypothesis query: {e}")

    return result
