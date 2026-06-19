from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

# Env var wins (Docker); .env file loaded by config.py acts as fallback for host dev
def _resolve_db_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    if not url:
        try:
            from config import get_settings
            url = get_settings().database_url
        except Exception:
            pass
    return url

DATABASE_URL = _resolve_db_url()

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True) if DATABASE_URL else None
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False) if engine else None

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
