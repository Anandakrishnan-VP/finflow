from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user

router = APIRouter(prefix="/cases", tags=["annotations"])

@router.get("/{case_id}/annotations")
async def get_case_annotations(
    case_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all annotations for a given case.
    """
    res = await db.execute(
        text("""
            SELECT ca.id, ca.case_id, ca.account_id, ca.annotation, ca.created_at, u.username
            FROM case_annotations ca
            LEFT JOIN users u ON ca.author_id = u.id
            WHERE ca.case_id = :cid
            ORDER BY ca.created_at DESC
        """),
        {"cid": case_id}
    )
    return [dict(r._mapping) for r in res.fetchall()]

@router.post("/{case_id}/annotations")
async def create_annotation(
    case_id: str,
    annotation: str = Body(..., embed=True),
    account_id: str = Body(None, embed=True),
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Creates a new annotation linked to a case or specific account.
    """
    # Retrieve user ID
    user_q = await db.execute(
        text("SELECT id FROM users WHERE username = :u"),
        {"u": current_user.get("username")}
    )
    user_row = user_q.fetchone()
    user_id = user_row.id if user_row else None

    await db.execute(
        text("""
            INSERT INTO case_annotations (case_id, account_id, author_id, annotation)
            VALUES (:cid, :aid, :uid, :annotation)
        """),
        {"cid": case_id, "aid": account_id, "uid": user_id, "annotation": annotation}
    )
    await db.commit()
    return {"status": "success", "message": "Annotation created."}
