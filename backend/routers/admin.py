from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import get_current_user, require_role, hash_password
from security.audit_log import verify_chain
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/admin", tags=["admin"])

class CreateUser(BaseModel):
    username: str
    password: str
    full_name: str
    badge_number: str
    role: str = "IO"

class UpdateUser(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

@router.get("/users")
async def list_users(current_user=Depends(require_role("ADMIN")),
                     db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, username, full_name, badge_number, role, is_active, created_at FROM users"))
    return [dict(r._mapping) for r in result.fetchall()]

@router.post("/users")
async def create_user(data: CreateUser,
                      current_user=Depends(require_role("ADMIN")),
                      db: AsyncSession = Depends(get_db)):
    hashed = hash_password(data.password)
    result = await db.execute(
        text("""INSERT INTO users (username, hashed_password, full_name, badge_number, role)
                VALUES (:u,:h,:f,:b,:r) RETURNING id"""),
        {"u": data.username, "h": hashed, "f": data.full_name,
         "b": data.badge_number, "r": data.role}
    )
    uid = result.fetchone()[0]
    await db.commit()
    return {"id": str(uid), "status": "created"}

@router.patch("/users/{user_id}")
async def update_user(user_id: str, data: UpdateUser,
                      current_user=Depends(require_role("ADMIN")),
                      db: AsyncSession = Depends(get_db)):
    updates = {}
    if data.full_name: updates["full_name"] = data.full_name
    if data.role: updates["role"] = data.role
    if data.is_active is not None: updates["is_active"] = data.is_active
    if data.password: updates["hashed_password"] = hash_password(data.password)
    if not updates:
        return {"status": "no changes"}
    set_clause = ", ".join(f"{k}=:{k}" for k in updates)
    await db.execute(text(f"UPDATE users SET {set_clause} WHERE id=:uid"),
                     {**updates, "uid": user_id})
    await db.commit()
    return {"status": "updated"}

@router.get("/audit-log")
async def get_audit_log(current_user=Depends(require_role("ADMIN")),
                        db: AsyncSession = Depends(get_db)):
    chain_status = await verify_chain(db)
    result = await db.execute(
        text("SELECT id, user_id, action, resource_type, resource_id, created_at "
             "FROM audit_log ORDER BY id DESC LIMIT 500"))
    return {
        "chain_status": chain_status,
        "entries": [dict(r._mapping) for r in result.fetchall()]
    }

@router.get("/model-status")
async def model_status(current_user=Depends(require_role("ADMIN"))):
    from ml.model_loader import MODEL_PATHS, MODEL_HASHES
    import os, hashlib
    status = {}
    for key, path in MODEL_PATHS.items():
        if os.path.exists(path):
            actual = hashlib.sha256(open(path,"rb").read()).hexdigest()
            status[key] = {
                "exists": True,
                "hash_match": actual == MODEL_HASHES.get(key,""),
                "path": path
            }
        else:
            status[key] = {"exists": False}
    return status
