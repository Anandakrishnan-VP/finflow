from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user

router = APIRouter(prefix="/cases", tags=["next_actions"])

@router.get("/{case_id}/next-actions")
async def get_case_next_actions(
    case_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all next action checklist items for the case.
    """
    res = await db.execute(
        text("""
            SELECT id, case_id, account_id, action_key, action_text, completed, completed_at
            FROM case_next_actions
            WHERE case_id = :cid
            ORDER BY completed ASC, account_id ASC, action_key ASC
        """),
        {"cid": case_id}
    )
    rows = res.fetchall()
    return [dict(r._mapping) for r in rows]

@router.post("/{case_id}/next-actions")
async def create_custom_next_action(
    case_id: str,
    account_id: str = Body(...),
    action_key: str = Body(...),
    action_text: str = Body(...),
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Adds a custom next action checklist item to the case.
    """
    try:
        await db.execute(
            text("""
                INSERT INTO case_next_actions (case_id, account_id, action_key, action_text)
                VALUES (:cid, :aid, :key, :text)
            """),
            {
                "cid": case_id,
                "aid": account_id,
                "key": action_key,
                "text": action_text
            }
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create action (might already exist): {e}")

    return {"status": "success", "message": "Custom next action added."}

@router.patch("/{case_id}/next-actions/{action_id}")
async def toggle_next_action(
    case_id: str,
    action_id: str,
    completed: bool = Body(..., embed=True),
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Toggles the completion status of a next action.
    """
    res = await db.execute(
        text("""
            UPDATE case_next_actions
            SET completed = :completed,
                completed_at = CASE WHEN :completed THEN NOW() ELSE NULL END
            WHERE id = :id AND case_id = :cid
            RETURNING id, completed
        """),
        {"id": action_id, "cid": case_id, "completed": completed}
    )
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Next action not found.")
    await db.commit()
    return {"status": "success", "completed": row.completed}

@router.delete("/{case_id}/next-actions/{action_id}")
async def delete_next_action(
    case_id: str,
    action_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Deletes a next action checklist item.
    """
    res = await db.execute(
        text("DELETE FROM case_next_actions WHERE id = :id AND case_id = :cid RETURNING id"),
        {"id": action_id, "cid": case_id}
    )
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Next action not found.")
    await db.commit()
    return {"status": "success", "message": "Next action deleted."}
