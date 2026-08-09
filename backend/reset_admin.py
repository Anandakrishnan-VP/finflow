import asyncio
import os
import bcrypt
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def reset_pass():
    db_url = os.getenv("DATABASE_URL")
    engine = create_async_engine(db_url)
    pwd_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
    print(f"Generated hash: {pwd_hash}")
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET hashed_password=:h WHERE username='admin'"), {"h": pwd_hash})
    await engine.dispose()
    print("SUCCESS: Admin password updated to 'admin123'!")

if __name__ == "__main__":
    asyncio.run(reset_pass())
