import os, hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db

import bcrypt

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES  = 60
REFRESH_TOKEN_EXPIRE_DAYS    = 7

bearer      = HTTPBearer()

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, username: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "username": username,
                       "role": role, "exp": exp, "type": "access"},
                      SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": exp, "type": "refresh"},
                      SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> Optional[dict]:
    """Used for both HTTP Bearer and WebSocket ?token= query parameter."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db)
) -> dict:
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or expired token")
    result = await db.execute(
        text("SELECT id, username, role, is_active FROM users WHERE id=:uid"),
        {"uid": payload["sub"]}
    )
    user = result.fetchone()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="User not found or deactivated")
    return {"user_id": str(user.id), "username": user.username,
            "role": user.role, "is_active": user.is_active}

def require_role(*roles: str):
    """Dependency factory: require_role('ADMIN', 'SUPERVISOR')"""
    async def _check(current_user=Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return _check

async def create_user(db: AsyncSession, username: str, password: str,
                      full_name: str, badge_number: str, role: str):
    hashed = hash_password(password)
    await db.execute(
        text("""INSERT INTO users (username, hashed_password, full_name, badge_number, role)
                VALUES (:u,:h,:f,:b,:r)"""),
        {"u": username, "h": hashed, "f": full_name, "b": badge_number, "r": role}
    )
    await db.commit()
