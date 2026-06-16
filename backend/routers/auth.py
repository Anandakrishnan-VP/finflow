from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from security.auth import (verify_password, create_access_token,
                           create_refresh_token, verify_token)

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, hashed_password, role, is_active FROM users WHERE username=:u"),
        {"u": req.username}
    )
    user = result.fetchone()
    if not user or not user.is_active or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "access_token":  create_access_token(str(user.id), req.username, user.role),
        "refresh_token": create_refresh_token(str(user.id)),
        "token_type":    "bearer",
    }

@router.post("/refresh")
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    payload = verify_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    result = await db.execute(
        text("SELECT id, username, role FROM users WHERE id=:uid"),
        {"uid": payload["sub"]}
    )
    user = result.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"access_token": create_access_token(str(user.id), user.username, user.role)}
